"use client";

import { useEffect, useState } from "react";
import { Button, ChipInput, Dialog, Field, Input, Select, Textarea } from "@kiwiply/ui";
import {
  EMPLOYMENT_LABEL, errorSentence, existingId, EXPERIENCE_LABEL, newKey, PRIORITY_OPTIONS, priorityLabel, requirementsApi, SOURCE_LABEL, WORK_MODE_LABEL,
  type ClientOption, type CreateBody, type PatchBody, type Priority, type ReqDetail, type Source, type WorkMode,
} from "@/lib/ent/accounts-ws/requirements";

/**
 * Intake and edit of a client requirement. One form for both: "How did it arrive?" picks Typed in, Pasted text (the client's own words go into the
 * description) or Link (the posting address); the client cannot be changed once entered. Business data only: a rate range, never a bank or tax value, and
 * the API scans every text field (422 when it finds an identity number). One Idempotency-Key per opening, so a double click or a retry enters one requirement.
 */

export interface Form {
  source: Source;
  sourceUrl: string;
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
  priority: Priority;
  dueOn: string;
  status: string;
  skills: string[];
  description: string;
}

export const EMPTY: Form = {
  source: "MANUAL", sourceUrl: "", title: "", clientId: "", contactId: "", location: "", workMode: "", employment: "", experience: "", duration: "",
  rateMin: "", rateMax: "", rateUnit: "", positions: "1", priority: "NORMAL", dueOn: "", status: "OPEN", skills: [], description: "",
};

const opts = (labels: Record<string, string>, none: string) => [{ value: "", label: none }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))];
const LINK = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

/** The form's problems in words, one per field; empty when it can be sent. Pure, for the tests. */
export function problems(f: Form): Partial<Record<keyof Form, string>> {
  const out: Partial<Record<keyof Form, string>> = {};
  if (f.title.trim().length < 2) out.title = "A title needs at least 2 characters.";
  if (!f.clientId) out.clientId = "Choose the client this requirement is for.";
  if (f.source === "PASTED_TEXT" && f.description.trim() === "") out.description = "Paste the client's text.";
  if (f.source === "LINK" && !LINK.test(f.sourceUrl.trim())) out.sourceUrl = "Paste the link of the posting, starting with https://.";
  const min = f.rateMin.trim() === "" ? null : Number(f.rateMin);
  const max = f.rateMax.trim() === "" ? null : Number(f.rateMax);
  if ((min !== null && (!Number.isInteger(min) || min < 0)) || (max !== null && (!Number.isInteger(max) || max < 0))) out.rateMin = "Use whole numbers, such as 90.";
  else if (min !== null && max !== null && min > max) out.rateMax = "The top of the range can't be below the bottom.";
  else if ((min !== null || max !== null) && !f.rateUnit) out.rateUnit = "Choose per hour or per year.";
  const n = Number(f.positions);
  if (!Number.isInteger(n) || n < 1 || n > 500) out.positions = "From 1 to 500.";
  return out;
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function toCreateBody(f: Form): CreateBody {
  return {
    title: f.title.trim(),
    clientId: Number(f.clientId),
    contactId: f.contactId ? Number(f.contactId) : null,
    location: f.location.trim() || null,
    workMode: (f.workMode || null) as WorkMode | null,
    employment: f.employment || null,
    experienceLevel: f.experience || null,
    durationLabel: f.duration.trim() || null,
    rateMin: num(f.rateMin),
    rateMax: num(f.rateMax),
    rateUnit: (f.rateUnit || null) as "HOUR" | "YEAR" | null,
    positions: Number(f.positions),
    status: f.status === "ON_HOLD" ? "ON_HOLD" : "OPEN",
    priority: f.priority,
    dueOn: f.dueOn || null,
    skills: f.skills,
    description: f.description.trim() || null,
    source: f.source,
    sourceUrl: f.source === "LINK" ? f.sourceUrl.trim() : null,
  };
}

/** The form of an existing requirement (the edit dialog opens on it). */
export function formOf(d: ReqDetail): Form {
  const r = d.requirement;
  return {
    source: (["MANUAL", "PASTED_TEXT", "LINK"].includes(r.source) ? r.source : "MANUAL") as Source,
    sourceUrl: d.jobUrl ?? "",
    title: r.title,
    clientId: String(r.client.id),
    contactId: d.contact ? String(d.contact.id) : "",
    location: r.location ?? "",
    workMode: r.workMode ?? "",
    employment: d.employment ?? "",
    experience: d.experienceLevel ?? "",
    duration: d.durationLabel ?? "",
    rateMin: r.rate?.min != null ? String(r.rate.min) : "",
    rateMax: r.rate?.max != null ? String(r.rate.max) : "",
    rateUnit: r.rate?.unit ?? "",
    positions: String(r.positions),
    priority: r.priority,
    dueOn: r.dueOn ?? "",
    status: r.status,
    skills: r.skills,
    description: d.description ?? "",
  };
}

/** Only what changed, as a PATCH body (the API writes nothing for an unchanged field). Empty when nothing changed. */
export function toPatchBody(f: Form, before: Form): PatchBody {
  const out: PatchBody = {};
  if (f.title.trim() !== before.title) out.title = f.title.trim();
  if (f.contactId !== before.contactId) out.contactId = f.contactId ? Number(f.contactId) : null;
  if (f.location.trim() !== before.location) out.location = f.location.trim() || null;
  if (f.workMode !== before.workMode) out.workMode = (f.workMode || null) as WorkMode | null;
  if (f.employment !== before.employment) out.employment = f.employment || null;
  if (f.experience !== before.experience) out.experienceLevel = f.experience || null;
  if (f.duration.trim() !== before.duration) out.durationLabel = f.duration.trim() || null;
  if (f.rateMin !== before.rateMin) out.rateMin = num(f.rateMin);
  if (f.rateMax !== before.rateMax) out.rateMax = num(f.rateMax);
  if (f.rateUnit !== before.rateUnit) out.rateUnit = (f.rateUnit || null) as "HOUR" | "YEAR" | null;
  if (f.positions !== before.positions) out.positions = Number(f.positions);
  if (f.priority !== before.priority) out.priority = f.priority;
  if (f.dueOn !== before.dueOn) out.dueOn = f.dueOn || null;
  if (f.description.trim() !== before.description.trim()) out.description = f.description.trim() || null;
  if (f.skills.join("\u0000") !== before.skills.join("\u0000")) out.skills = f.skills;
  return out;
}

export interface RequirementDialogProps {
  orgId: number | string;
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  /** Editing this requirement; absent = entering a new one. */
  editing?: ReqDetail | null;
  /** Opens with this client already chosen. */
  presetClientId?: number | null;
  onSaved: (detail: ReqDetail, created: boolean) => void;
  /** The API said this client already has the requirement: open that one. */
  onOpenExisting?: (id: number) => void;
}

export default function RequirementDialog({ orgId, open, onClose, clients, editing = null, presetClientId = null, onSaved, onOpenExisting }: RequirementDialogProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [key, setKey] = useState(() => newKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh form and a fresh Idempotency-Key every time the dialog opens
      setForm(editing ? formOf(editing) : { ...EMPTY, clientId: presetClientId ? String(presetClientId) : "" });
      setKey(newKey());
      setError(null);
      setExisting(null);
      setTouched(false);
      setBusy(false);
    }
  }, [open, editing, presetClientId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const bad = problems(form);
  const contacts = clients.find((c) => String(c.id) === form.clientId)?.contacts ?? [];
  const shown = (k: keyof Form) => (touched ? bad[k] : undefined);

  async function submit() {
    setTouched(true);
    if (Object.keys(bad).length > 0) return;
    setBusy(true);
    setError(null);
    setExisting(null);
    if (editing) {
      const patch = toPatchBody(form, formOf(editing));
      if (Object.keys(patch).length === 0) {
        setBusy(false);
        onClose();
        return;
      }
      const r = await requirementsApi.patch(orgId, editing.requirement.id, patch, editing.version);
      setBusy(false);
      if (!r.ok) {
        setError(errorSentence(r));
        return;
      }
      onSaved(r.data, false);
      return;
    }
    const r = await requirementsApi.create(orgId, toCreateBody(form), key);
    setBusy(false);
    if (!r.ok) {
      setError(errorSentence(r));
      setExisting(existingId(r));
      return;
    }
    onSaved(r.data, true);
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={editing ? "Edit requirement" : "Add requirement"}
      description={editing ? "Change what the client asked for. Nothing is sent to anyone." : "Enter what the client asked for. Consultants see it only when you put it in front of them, and they decide whether to apply."}
      className="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="requirement-form" disabled={busy} data-requirement-submit>
            {busy ? "Saving..." : editing ? "Save changes" : "Add requirement"}
          </Button>
        </>
      }
    >
      <form
        id="requirement-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3.5"
        data-requirement-form
      >
        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 p-2.5 text-[13px] text-danger-text" data-requirement-error>
            {error}
            {existing !== null && onOpenExisting ? (
              <>
                {" "}
                <button type="button" className="font-semibold underline" onClick={() => onOpenExisting(existing)}>
                  Open it
                </button>
              </>
            ) : null}
          </p>
        )}
        {!editing && (
          <Field label="How did it arrive?">
            <Select value={form.source} onChange={(v) => set("source", v as Source)} options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))} aria-label="How did it arrive?" />
          </Field>
        )}
        {form.source === "LINK" && !editing && (
          <Field label="Link to the posting" required error={shown("sourceUrl")}>
            <Input value={form.sourceUrl} maxLength={1000} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://" autoComplete="off" />
          </Field>
        )}
        <Field label="Title" required error={shown("title")}>
          <Input value={form.title} maxLength={300} onChange={(e) => set("title", e.target.value)} placeholder="Senior Java Developer" autoComplete="off" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client" required error={shown("clientId")}>
            <Select
              value={form.clientId}
              disabled={!!editing}
              onChange={(v) => setForm((f) => ({ ...f, clientId: v, contactId: "" }))}
              options={[{ value: "", label: "Choose a client" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))]}
              aria-label="Client"
            />
          </Field>
          <Field label="Client contact">
            <Select
              value={form.contactId}
              onChange={(v) => set("contactId", v)}
              disabled={contacts.length === 0}
              options={[{ value: "", label: contacts.length === 0 ? "No contacts" : "No contact" }, ...contacts.map((c) => ({ value: String(c.id), label: c.name }))]}
              aria-label="Client contact"
            />
          </Field>
          <Field label="Location">
            <Input value={form.location} maxLength={300} onChange={(e) => set("location", e.target.value)} placeholder="Austin, TX" />
          </Field>
          <Field label="Work mode">
            <Select value={form.workMode} onChange={(v) => set("workMode", v)} options={opts(WORK_MODE_LABEL, "Not set")} aria-label="Work mode" />
          </Field>
          <Field label="Job type">
            <Select value={form.employment} onChange={(v) => set("employment", v)} options={opts(EMPLOYMENT_LABEL, "Not set")} aria-label="Job type" />
          </Field>
          <Field label="Experience level">
            <Select value={form.experience} onChange={(v) => set("experience", v)} options={opts(EXPERIENCE_LABEL, "Not set")} aria-label="Experience level" />
          </Field>
          <Field label="Duration">
            <Input value={form.duration} maxLength={40} onChange={(e) => set("duration", e.target.value)} placeholder="6 months" />
          </Field>
          <Field label="Openings" error={shown("positions")}>
            <Input inputMode="numeric" value={form.positions} onChange={(e) => set("positions", e.target.value)} aria-label="Openings" />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(v) => set("priority", v as Priority)} options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: priorityLabel(p) }))} aria-label="Priority" />
          </Field>
          <Field label="Needed by">
            <Input type="date" value={form.dueOn} onChange={(e) => set("dueOn", e.target.value)} aria-label="Needed by" />
          </Field>
          {!editing && (
            <Field label="Start as">
              <Select value={form.status} onChange={(v) => set("status", v)} options={[{ value: "OPEN", label: "Open" }, { value: "ON_HOLD", label: "On hold" }]} aria-label="Start as" />
            </Field>
          )}
        </div>
        <fieldset className="grid grid-cols-3 gap-3">
          <legend className="mb-1 text-[12.5px] font-semibold text-ink">Rate range the client pays (whole dollars)</legend>
          <Input aria-label="Minimum rate" inputMode="numeric" placeholder="Min" value={form.rateMin} onChange={(e) => set("rateMin", e.target.value)} />
          <Input aria-label="Maximum rate" inputMode="numeric" placeholder="Max" value={form.rateMax} onChange={(e) => set("rateMax", e.target.value)} />
          <Select aria-label="Rate per" value={form.rateUnit} onChange={(v) => set("rateUnit", v)} options={[{ value: "", label: "Per" }, { value: "HOUR", label: "per hour" }, { value: "YEAR", label: "per year" }]} />
          {(shown("rateMin") || shown("rateMax") || shown("rateUnit")) && (
            <p role="alert" className="col-span-3 text-[12.5px] text-danger-text">
              {shown("rateMin") ?? shown("rateMax") ?? shown("rateUnit")}
            </p>
          )}
        </fieldset>
        <ChipInput label="Skills" value={form.skills} onChange={(v) => set("skills", v)} maxChips={15} maxChipLength={60} placeholder="Add a skill and press Enter" />
        <Field
          label={form.source === "PASTED_TEXT" && !editing ? "The client's text" : "Description"}
          required={form.source === "PASTED_TEXT" && !editing}
          error={shown("description")}
          hint="Never put identity numbers, bank details or birth dates here: we don't store them."
        >
          <Textarea rows={6} value={form.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} aria-label="Description" />
        </Field>
      </form>
    </Dialog>
  );
}
