"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { parseResume, type ParsedResume } from "@/lib/resume-parse";

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-foreground/50">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </>
  );
}

function labelFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || "Resume";
}

export default function ResumeUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedResume | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    setLabel(labelFromName(picked.name));
    setParsing(true);
    setError(null);
    setResult(null);
    setSaveError(null);
    setSavedLabel(null);
    try {
      setResult(await parseResume(picked));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setParsing(false);
    }
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
      setSavedLabel(data.label ?? label);
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
      <label className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-foreground/25 p-6">
        <span className="text-sm text-foreground/70">
          Upload a resume (PDF, DOCX, or TXT). It&apos;s parsed right here in your browser.
        </span>
        <input
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,text/plain"
          onChange={onFile}
          className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-foreground file:px-4 file:py-2 file:text-sm file:font-medium file:text-background hover:file:opacity-90"
        />
        {file && <span className="text-xs text-foreground/50">{file.name}</span>}
      </label>

      {parsing && <p className="text-sm text-foreground/60">Reading your resume…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {savedLabel && (
        <p className="rounded-lg border border-green-600/30 bg-green-600/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Saved “{savedLabel}” to your account.
        </p>
      )}

      {s && bio && (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-foreground/60">Review what we detected, then save it.</p>

          <div className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-5 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
              Resume name
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-base outline-none focus:border-foreground/50"
              />
            </label>
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save to my account"}
            </button>
          </div>
          {saveError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {saveError}
            </p>
          )}

          <section className="rounded-xl border border-foreground/15 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
              Detected contact
            </h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <Field label="Name" value={[bio.firstName, bio.lastName].filter(Boolean).join(" ")} />
              <Field label="Email" value={bio.email} />
              <Field label="Phone" value={bio.phone} />
              <Field label="Location" value={[bio.city, bio.state].filter(Boolean).join(", ")} />
              <Field label="LinkedIn" value={bio.linkedin} />
              <Field label="GitHub" value={bio.github} />
              <Field label="Website" value={bio.website} />
            </dl>
          </section>

          {s.summary && (
            <section className="rounded-xl border border-foreground/15 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Summary</h2>
              <p className="mt-2 text-sm text-foreground/80">{s.summary}</p>
            </section>
          )}

          {s.skills.length > 0 && (
            <section className="rounded-xl border border-foreground/15 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
                Skills ({s.skills.length})
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {s.skills.map((skill, i) => (
                  <li key={i} className="rounded-full border border-foreground/15 px-3 py-1 text-xs">
                    {skill}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.experience.length > 0 && (
            <section className="rounded-xl border border-foreground/15 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
                Experience ({s.experience.length})
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                {s.experience.map((exp, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-medium">
                      {[exp.title, exp.company].filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-xs text-foreground/50">
                      {[exp.location, [exp.startDate, exp.endDate].filter(Boolean).join(" – ")]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.education.length > 0 && (
            <section className="rounded-xl border border-foreground/15 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
                Education ({s.education.length})
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                {s.education.map((ed, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-medium">{ed.school}</div>
                    <div className="text-xs text-foreground/50">
                      {[ed.degree, ed.field, ed.endDate].filter(Boolean).join("  ·  ")}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
