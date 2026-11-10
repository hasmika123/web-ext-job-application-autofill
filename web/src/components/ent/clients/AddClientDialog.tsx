"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Field, Input, Select, Textarea } from "@kiwiply/ui";
import { clientsApi, errorSentence, newKey, SIZE_LABEL, type ClientDetail, type CreateBody, type Person } from "@/lib/ent/clients";

interface Form {
  name: string;
  industry: string;
  website: string;
  location: string;
  sizeBand: string;
  status: string;
  owner: string;
  about: string;
}
const EMPTY: Form = { name: "", industry: "", website: "", location: "", sizeBand: "", status: "ACTIVE", owner: "", about: "" };

/** The form's problems in words, one per field; empty when it can be sent. Pure, for the tests. */
export function problems(f: Form): Partial<Record<keyof Form, string>> {
  const out: Partial<Record<keyof Form, string>> = {};
  if (f.name.trim().length < 2) out.name = "A name needs at least 2 characters.";
  const w = f.website.trim();
  if (w !== "" && !/^(https?:\/\/)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d{1,5})?(\/\S*)?$/.test(w)) out.website = "Use a web address such as acme.com.";
  return out;
}

export function toBody(f: Form): CreateBody {
  return {
    name: f.name.trim(),
    industry: f.industry.trim() || null,
    website: f.website.trim() || null,
    location: f.location.trim() || null,
    sizeBand: f.sizeBand || null,
    status: (f.status || "ACTIVE") as "ACTIVE" | "PROSPECT",
    ownerMemberId: f.owner ? Number(f.owner) : null,
    about: f.about.trim() || null,
  };
}

/** Add Client: one sheet with the fields of the directory. One Idempotency-Key per opening, so a double click or a retry creates one client. */
export default function AddClientDialog({ orgId, open, onClose, industries, managers, onCreated }: { orgId: number | string; open: boolean; onClose: () => void; industries: string[]; managers: Person[]; onCreated: (c: ClientDetail) => void }) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [key, setKey] = useState(() => newKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh form and a fresh Idempotency-Key every time the dialog opens
      setForm(EMPTY);
      setKey(newKey());
      setError(null);
      setTouched(false);
      setBusy(false);
    }
  }, [open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const bad = problems(form);
  const shown = (k: keyof Form) => (touched ? bad[k] : undefined);

  async function submit() {
    setTouched(true);
    if (Object.keys(bad).length > 0) return;
    setBusy(true);
    setError(null);
    const r = await clientsApi.create(orgId, toBody(form), key);
    setBusy(false);
    if (!r.ok) {
      setError(errorSentence(r));
      return;
    }
    onCreated(r.data);
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Add client"
      description="A company you place consultants with. You can change any field later; changes save by themselves."
      className="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="add-client-form" disabled={busy} data-add-submit>
            {busy ? "Adding..." : "Add client"}
          </Button>
        </>
      }
    >
      <form
        id="add-client-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3.5"
        data-add-form
      >
        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 p-2.5 text-[13px] text-danger-text" data-add-error>
            {error}
          </p>
        )}
        <Field label="Company name" required error={shown("name")}>
          <Input value={form.name} maxLength={200} onChange={(e) => set("name", e.target.value)} placeholder="TechCorp Inc." autoComplete="off" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Industry">
            <Input value={form.industry} maxLength={80} list="client-industries" onChange={(e) => set("industry", e.target.value)} placeholder="Technology" autoComplete="off" />
            <datalist id="client-industries">
              {industries.map((i) => (
                <option key={i} value={i} />
              ))}
            </datalist>
          </Field>
          <Field label="Website" error={shown("website")}>
            <Input value={form.website} maxLength={300} onChange={(e) => set("website", e.target.value)} placeholder="techcorp.com" autoComplete="off" />
          </Field>
          <Field label="Location">
            <Input value={form.location} maxLength={120} onChange={(e) => set("location", e.target.value)} placeholder="San Francisco, CA" />
          </Field>
          <Field label="Company size">
            <Select value={form.sizeBand} onChange={(v) => set("sizeBand", v)} options={[{ value: "", label: "Not set" }, ...Object.entries(SIZE_LABEL).map(([value, label]) => ({ value, label }))]} />
          </Field>
          <Field label="Account manager">
            <Select value={form.owner} onChange={(v) => set("owner", v)} options={[{ value: "", label: "Me" }, ...managers.map((m) => ({ value: String(m.id), label: m.name }))]} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(v) => set("status", v)} options={[{ value: "ACTIVE", label: "Active" }, { value: "PROSPECT", label: "Prospect" }]} />
          </Field>
        </div>
        <Field label="About" hint="Never put identity numbers, bank details or birth dates here: we don't store them.">
          <Textarea rows={4} value={form.about} maxLength={1000} onChange={(e) => set("about", e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
