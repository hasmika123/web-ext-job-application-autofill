"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { parseResume, type ParsedResume } from "@/lib/resume-parse";
import { track } from "@/lib/analytics";
import { Input, Field, useToast } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

function DetailField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="break-words font-medium text-ink">{value}</dd>
    </>
  );
}

function labelFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || "Resume";
}

function ReviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

export default function ResumeUpload() {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedResume | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleFile(picked: File) {
    setFile(picked);
    setLabel(labelFromName(picked.name));
    setParsing(true);
    setError(null);
    setResult(null);
    setSaveError(null);
    try {
      setResult(await parseResume(picked));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setParsing(false);
    }
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) void handleFile(picked);
    // Reset so re-selecting the SAME file still fires onChange (e.g. after a save or a fix).
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) void handleFile(picked);
  }

  async function onSave() {
    if (!file || !result) return;
    setSaving(true);
    setSaveError(null);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("label", label.trim() || labelFromName(file.name));
      form.append("parsedJson", JSON.stringify(result.structured));
      const res = await fetch("/api/resumes/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save the resume.");
        return;
      }
      track("resume_saved");
      toast({ variant: "success", title: `Saved “${data.label ?? label}”`, description: "Added to your account." });
      setFile(null);
      setResult(null);
      router.refresh();
    } catch {
      setSaveError("Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  }

  const s = result?.structured;
  const bio = result?.bio;

  return (
    <div className="flex flex-col gap-6">
      {/* Drag-and-drop drop-zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "cursor-pointer rounded-[var(--radius-lg)] border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-line bg-paper hover:bg-paper-2",
        )}
      >
        <div className="text-3xl">📄</div>
        <h3 className="mt-2 font-display text-lg font-semibold text-ink">Drop a resume here</h3>
        <p className="mt-1 text-[13.5px] text-muted">
          or <span className="font-semibold text-accent-deep">browse</span> — PDF, DOCX, or TXT.
          Parsed right here in your browser.
        </p>
        {file && <p className="mt-3 text-xs text-muted">{file.name}</p>}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,text/plain"
          onChange={onInput}
          className="hidden"
        />
      </div>

      {parsing && <p className="text-sm text-muted">Reading your resume…</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {s && bio && (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted">Review what we detected, then save it.</p>

          <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)] sm:flex-row sm:items-end">
            <Field label="Resume name" htmlFor="resume-label" className="mb-0 flex-1">
              <Input id="resume-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <button onClick={onSave} disabled={saving} className={cn(buttonVariants("accent"), "disabled:opacity-50")}>
              {saving ? "Saving…" : "Save to my account"}
            </button>
          </div>
          {saveError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {saveError}
            </p>
          )}

          <ReviewCard title="Detected contact">
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm text-ink-soft">
              <DetailField label="Name" value={[bio.firstName, bio.lastName].filter(Boolean).join(" ")} />
              <DetailField label="Email" value={bio.email} />
              <DetailField label="Phone" value={bio.phone} />
              <DetailField label="Location" value={[bio.city, bio.state].filter(Boolean).join(", ")} />
              <DetailField label="LinkedIn" value={bio.linkedin} />
              <DetailField label="GitHub" value={bio.github} />
              <DetailField label="Website" value={bio.website} />
            </dl>
          </ReviewCard>

          {s.summary && (
            <ReviewCard title="Summary">
              <p className="mt-2 text-sm text-ink-soft">{s.summary}</p>
            </ReviewCard>
          )}

          {s.skills.length > 0 && (
            <ReviewCard title={`Skills (${s.skills.length})`}>
              <ul className="mt-3 flex flex-wrap gap-2">
                {s.skills.map((skill, i) => (
                  <li key={i} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-deep">
                    {skill}
                  </li>
                ))}
              </ul>
            </ReviewCard>
          )}

          {s.experience.length > 0 && (
            <ReviewCard title={`Experience (${s.experience.length})`}>
              <ul className="mt-3 flex flex-col gap-3">
                {s.experience.map((exp, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-medium text-ink">{[exp.title, exp.company].filter(Boolean).join(" · ")}</div>
                    <div className="text-xs text-muted">
                      {[exp.location, [exp.startDate, exp.endDate].filter(Boolean).join(" – ")].filter(Boolean).join("  ·  ")}
                    </div>
                  </li>
                ))}
              </ul>
            </ReviewCard>
          )}

          {s.education.length > 0 && (
            <ReviewCard title={`Education (${s.education.length})`}>
              <ul className="mt-3 flex flex-col gap-3">
                {s.education.map((ed, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-medium text-ink">{ed.school}</div>
                    <div className="text-xs text-muted">
                      {[ed.degree, ed.field, ed.endDate].filter(Boolean).join("  ·  ")}
                    </div>
                  </li>
                ))}
              </ul>
            </ReviewCard>
          )}
        </div>
      )}
    </div>
  );
}
