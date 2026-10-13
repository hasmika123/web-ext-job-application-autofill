"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Dialog, Field, Input, PlusIcon, Select, SensitiveTextField, TrashIcon, UploadIcon } from "@kiwiply/ui";
import { errorSentence, newKey, resumesApi, VISIBILITY_OPTIONS, type ConsultantOption, type CreateBody, type ExperienceInput, type ResumeDetail, type Visibility } from "@/lib/ent/resumes";

const MAX_EXPERIENCE = 8; // config-literal-ok: mirrors the API's cap (ResumeBoardWriteService.MAX_EXPERIENCE)

interface Props {
  open: boolean;
  onClose: () => void;
  orgId: number | string;
  /** Called with the new record once the API has created it. */
  onCreated: (d: ResumeDetail) => void;
}

const blankExperience = (): ExperienceInput => ({ title: "", employer: "", startYear: null, endYear: null });

/**
 * "Upload Resume": records a NEW resume for a consultant (name, target role, headline, summary, experience, visibility) and, optionally, the plain
 * name of a file. The file's contents are never read or stored (there is no file store); the dialog says so. The record starts as Pending, because a
 * resume prepared for a consultant needs someone else to record its approval. Free text is checked for never-collected values as you type and again
 * by the server.
 */
export default function UploadResumeDialog({ open, onClose, orgId, onCreated }: Props) {
  const [consultants, setConsultants] = useState<ConsultantOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consultantId, setConsultantId] = useState("");
  const [name, setName] = useState("");
  const [fileName, setFileName] = useState("");
  const [role, setRole] = useState("");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("INTERNAL");
  const [experience, setExperience] = useState<ExperienceInput[]>([]);
  const [hits, setHits] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newKey());
  const filePick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    key.current = newKey();
    setError(null);
    setLoadError(null);
    let live = true;
    void resumesApi.consultants(orgId).then((r) => {
      if (!live) return;
      if (r.ok) setConsultants(r.data);
      else setLoadError(errorSentence(r));
    });
    return () => {
      live = false;
    };
  }, [open, orgId]);

  function reset() {
    setConsultantId("");
    setName("");
    setFileName("");
    setRole("");
    setHeadline("");
    setSummary("");
    setVisibility("INTERNAL");
    setExperience([]);
    setHits({});
    setError(null);
  }

  const sensitive = Object.values(hits).some(Boolean);
  const hit = (field: string) => (h: unknown[]) => setHits((s) => ({ ...s, [field]: h.length > 0 }));
  const experienceOk = experience.every((e) => e.title.trim() && e.employer.trim() && e.startYear !== null);
  const canSave = !!consultantId && name.trim().length > 0 && experienceOk && !sensitive && !saving;
  const selected = useMemo(() => consultants?.find((c) => String(c.id) === consultantId) ?? null, [consultants, consultantId]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name); // the name only: the file is never read
    if (!name.trim()) setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  }

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body: CreateBody = {
      consultantId: Number(consultantId),
      name: name.trim(),
      fileName: fileName.trim() || undefined,
      targetRole: role.trim() || undefined,
      headline: headline.trim() || undefined,
      summary: summary.trim() || undefined,
      visibility,
      experience: experience.map((e) => ({ ...e, title: e.title.trim(), employer: e.employer.trim() })),
    };
    const r = await resumesApi.create(orgId, body, key.current);
    setSaving(false);
    if (!r.ok) {
      setError(errorSentence(r));
      return;
    }
    reset();
    onCreated(r.data);
  }

  const setExp = (i: number, patch: Partial<ExperienceInput>) => setExperience((xs) => xs.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const year = (v: string): number | null => (/^\d{4}$/.test(v) ? Number(v) : null);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Upload Resume"
      description="Record a new resume for a consultant. It starts as Pending until someone else approves it."
      className="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="accent" onClick={() => void submit()} disabled={!canSave} data-upload-submit>
            {saving ? "Adding..." : "Add resume"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-1"
        data-upload-form
      >
        <Field label="Consultant" required hint={consultants && consultants.length === 0 ? "You have no consultants in your scope to add a resume for." : undefined} error={loadError}>
          <Select
            aria-label="Consultant"
            value={consultantId}
            onChange={setConsultantId}
            placeholder={consultants === null && !loadError ? "Loading consultants..." : "Choose a consultant"}
            options={(consultants ?? []).map((c) => ({ value: String(c.id), label: c.email ? `${c.name} (${c.email})` : c.name }))}
          />
        </Field>

        <div className="rounded-xl border border-dashed border-line bg-paper-2/50 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => filePick.current?.click()}>
              <UploadIcon aria-hidden size={15} /> Choose a file
            </Button>
            <input ref={filePick} type="file" accept=".pdf,.doc,.docx,.txt,.rtf" hidden onChange={(e) => pickFile(e.target.files?.[0])} data-file-pick />
            <span className="min-w-0 truncate text-[13px] text-ink-soft">{fileName || "No file chosen"}</span>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-muted">Only the file&apos;s name is recorded. Its contents are not read or stored: this page keeps resume details, and the preview, download and print are generated from the fields below.</p>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Resume name" required className="sm:col-span-2">
            <SensitiveTextField label="Resume name" value={name} onValueChange={setName} onHits={hit("name")} maxLength={200} placeholder={selected ? `${selected.name} Resume` : "Anika Khan Resume"} />
          </Field>
          <Field label="File name (optional)">
            <SensitiveTextField label="File name" value={fileName} onValueChange={setFileName} onHits={hit("file")} maxLength={200} placeholder="anika_khan_resume.pdf" />
          </Field>
          <Field label="Target role">
            <SensitiveTextField label="Target role" value={role} onValueChange={setRole} onHits={hit("role")} maxLength={120} placeholder="Backend Engineer" />
          </Field>
          <Field label="Headline" className="sm:col-span-2">
            <SensitiveTextField label="Headline" value={headline} onValueChange={setHeadline} onHits={hit("headline")} maxLength={120} placeholder="Senior Backend Engineer" />
          </Field>
          <Field label="Professional summary" className="sm:col-span-2" hint="Please leave out personal numbers (government or tax ids, bank details, dates of birth).">
            <SensitiveTextField label="Professional summary" multiline rows={4} value={summary} onValueChange={setSummary} onHits={hit("summary")} maxLength={1000} placeholder="Years of experience, strengths, the kind of engagements you want." />
          </Field>
          <Field label="Who can see it">
            <Select aria-label="Who can see it" value={visibility} onChange={(v) => setVisibility(v as Visibility)} options={VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.long }))} />
          </Field>
        </div>

        <fieldset className="space-y-2 pb-2">
          <legend className="mb-1 text-[12.5px] font-semibold text-ink-soft">Experience (optional)</legend>
          {experience.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line p-2.5" data-experience-row>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input aria-label={`Job title ${i + 1}`} placeholder="Job title" value={e.title} maxLength={120} onChange={(ev) => setExp(i, { title: ev.target.value })} />
                <Input aria-label={`Employer ${i + 1}`} placeholder="Employer" value={e.employer} maxLength={120} onChange={(ev) => setExp(i, { employer: ev.target.value })} />
                <Input aria-label={`Start year ${i + 1}`} placeholder="Start year" inputMode="numeric" maxLength={4} value={e.startYear ?? ""} onChange={(ev) => setExp(i, { startYear: year(ev.target.value) })} />
                <Input aria-label={`End year ${i + 1} (blank means present)`} placeholder="End year (blank = present)" inputMode="numeric" maxLength={4} value={e.endYear ?? ""} onChange={(ev) => setExp(i, { endYear: year(ev.target.value) })} />
              </div>
              <button type="button" aria-label={`Remove experience ${i + 1}`} onClick={() => setExperience((xs) => xs.filter((_, n) => n !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-paper-2 hover:text-ink">
                <TrashIcon aria-hidden size={16} />
              </button>
            </div>
          ))}
          {experience.length < MAX_EXPERIENCE && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setExperience((xs) => [...xs, blankExperience()])}>
              <PlusIcon aria-hidden size={14} /> Add experience
            </Button>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-[13px] font-medium text-danger-text" data-upload-error>
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
