"use client";

import { useEffect, useState } from "react";
import { Button, ChipInput, Dialog, Field, Input, Select, Textarea } from "@kiwiply/ui";
import { EMPLOYMENT_LABEL, errorSentence, EXPERIENCE_LABEL, jobsApi, newKey, WORK_MODE_LABEL, type ClientOption, type CreateBody, type Employment, type Experience, type JobDetail, type WorkMode } from "@/lib/ent/jobs";

const opts = (labels: Record<string, string>, none: string) => [{ value: "", label: none }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))];

interface Form {
  title: string;
  clientId: string;
  contactId: string;
  location: string;
  workMode: string;
  employment: string;
  experience: string;
  duration: string;
  rateMin: string;
  rateMax: string;
  rateUnit: string;
  positions: string;
  skills: string[];
  description: string;
}

const EMPTY: Form = { title: "", clientId: "", contactId: "", location: "", workMode: "", employment: "", experience: "", duration: "", rateMin: "", rateMax: "", rateUnit: "", positions: "1", skills: [], description: "" };

/** The form's problems in words, one per field; empty when it can be sent. Pure, for the tests. */
export function problems(f: Form): Partial<Record<keyof Form, string>> {
  const out: Partial<Record<keyof Form, string>> = {};
  if (f.title.trim().length < 2) out.title = "A title needs at least 2 characters.";
  if (!f.clientId) out.clientId = "Choose the client this job is for.";
  const min = f.rateMin.trim() === "" ? null : Number(f.rateMin);
  const max = f.rateMax.trim() === "" ? null : Number(f.rateMax);
  if ((min !== null && (!Number.isInteger(min) || min < 0)) || (max !== null && (!Number.isInteger(max) || max < 0))) out.rateMin = "Use whole numbers, such as 120.";
  else if (min !== null && max !== null && min > max) out.rateMax = "The top of the range can't be below the bottom.";
  else if ((min !== null || max !== null) && !f.rateUnit) out.rateUnit = "Choose per hour or per year.";
  const n = Number(f.positions);
  if (!Number.isInteger(n) || n < 1 || n > 500) out.positions = "From 1 to 500.";
  return out;
}

export function toBody(f: Form): CreateBody {
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  return {
    title: f.title.trim(),
    clientId: Number(f.clientId),
    contactId: f.contactId ? Number(f.contactId) : null,
    location: f.location.trim() || null,
    workMode: (f.workMode || null) as WorkMode | null,
    employment: (f.employment || null) as Employment | null,
    experienceLevel: (f.experience || null) as Experience | null,
    durationLabel: f.duration.trim() || null,
    rateMin: num(f.rateMin),
    rateMax: num(f.rateMax),
    rateUnit: (f.rateUnit || null) as "HOUR" | "YEAR" | null,
    positions: Number(f.positions),
    skills: f.skills,
    description: f.description.trim() || null,
  };
}

export interface CreateJobDialogProps {
  orgId: number | string;
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  onCreated: (job: JobDetail) => void;
  /** Opens with this client already chosen (the Clients page's "Create requirement"). */
  presetClientId?: number | null;
}

/** Create Job: one sheet with the fields of the board. One Idempotency-Key per opening, so a double click or a retry creates one job. */
export default function CreateJobDialog({ orgId, open, onClose, clients, onCreated, presetClientId = null }: CreateJobDialogProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [key, setKey] = useState(() => newKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh form and a fresh Idempotency-Key every time the dialog opens
      setForm({ ...EMPTY, clientId: presetClientId ? String(presetClientId) : "" });
      setKey(newKey());
      setError(null);
      setTouched(false);
      setBusy(false);
    }
  }, [open, presetClientId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const bad = problems(form);
  const contacts = clients.find((c) => String(c.id) === form.clientId)?.contacts ?? [];

  async function submit() {
    setTouched(true);
    if (Object.keys(bad).length > 0) return;
    setBusy(true);
    setError(null);
    const r = await jobsApi.create(orgId, toBody(form), key);
    setBusy(false);
    if (!r.ok) {
      setError(errorSentence(r));
      return;
    }
    onCreated(r.data);
  }

  const shown = (k: keyof Form) => (touched ? bad[k] : undefined);

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Create job"
      description="A new job opens with no matches until the matching runs. You can change any field later; changes save by themselves."
      className="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="create-job-form" disabled={busy} data-create-submit>
            {busy ? "Creating..." : "Create job"}
          </Button>
        </>
      }
    >
      <form
        id="create-job-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3.5"
        data-create-form
      >
        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 p-2.5 text-[13px] text-danger-text" data-create-error>
            {error}
          </p>
        )}
        <Field label="Job title" required error={shown("title")}>
          <Input value={form.title} maxLength={300} onChange={(e) => set("title", e.target.value)} placeholder="Senior React Developer" autoComplete="off" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client" required error={shown("clientId")}>
            <Select
              value={form.clientId}
              onChange={(v) => setForm((f) => ({ ...f, clientId: v, contactId: "" }))}
              options={[{ value: "", label: "Choose a client" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))]}
            />
          </Field>
          <Field label="Client contact">
            <Select value={form.contactId} onChange={(v) => set("contactId", v)} disabled={contacts.length === 0} options={[{ value: "", label: contacts.length === 0 ? "No contacts" : "No contact" }, ...contacts.map((c) => ({ value: String(c.id), label: c.name }))]} />
          </Field>
          <Field label="Location">
            <Input value={form.location} maxLength={300} onChange={(e) => set("location", e.target.value)} placeholder="New York, NY" />
          </Field>
          <Field label="Work mode">
            <Select value={form.workMode} onChange={(v) => set("workMode", v)} options={opts(WORK_MODE_LABEL, "Not set")} />
          </Field>
          <Field label="Job type">
            <Select value={form.employment} onChange={(v) => set("employment", v)} options={opts(EMPLOYMENT_LABEL, "Not set")} />
          </Field>
          <Field label="Experience level">
            <Select value={form.experience} onChange={(v) => set("experience", v)} options={opts(EXPERIENCE_LABEL, "Not set")} />
          </Field>
          <Field label="Duration">
            <Input value={form.duration} maxLength={40} onChange={(e) => set("duration", e.target.value)} placeholder="6 months" />
          </Field>
          <Field label="Positions" error={shown("positions")}>
            <Input inputMode="numeric" value={form.positions} onChange={(e) => set("positions", e.target.value)} />
          </Field>
        </div>
        <fieldset className="grid grid-cols-3 gap-3">
          <legend className="mb-1 text-[12.5px] font-semibold text-ink">Compensation (whole dollars)</legend>
          <Input aria-label="Minimum" inputMode="numeric" placeholder="Min" value={form.rateMin} onChange={(e) => set("rateMin", e.target.value)} />
          <Input aria-label="Maximum" inputMode="numeric" placeholder="Max" value={form.rateMax} onChange={(e) => set("rateMax", e.target.value)} />
          <Select aria-label="Per" value={form.rateUnit} onChange={(v) => set("rateUnit", v)} options={[{ value: "", label: "Per" }, { value: "HOUR", label: "per hour" }, { value: "YEAR", label: "per year" }]} />
          {(shown("rateMin") || shown("rateMax") || shown("rateUnit")) && (
            <p role="alert" className="col-span-3 text-[12.5px] text-danger-text">
              {shown("rateMin") ?? shown("rateMax") ?? shown("rateUnit")}
            </p>
          )}
        </fieldset>
        <ChipInput label="Skills" value={form.skills} onChange={(v) => set("skills", v)} maxChips={15} maxChipLength={60} placeholder="Add a skill and press Enter" />
        <Field label="Description" hint="Never put identity numbers, bank details or birth dates here: we don't store them.">
          <Textarea rows={5} value={form.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
