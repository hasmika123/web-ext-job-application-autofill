"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Field, Input, Select, Textarea } from "@kiwiply/ui";
import { clientsApi, errorSentence, newKey, ROLE_LABEL, type ContactBody, type ContactRow } from "@/lib/ent/clients";
import type { ClientOption } from "@/lib/ent/accounts-ws/requirements";

/**
 * Add or edit a client contact. Business data only: a name, a title, a WORK e-mail (the API refuses private mailboxes), a work phone and a short note.
 * Never an identity, bank or tax value: the API scans every field and answers 422 when it finds one. One Idempotency-Key per opening, so a double click
 * or a retry adds one contact.
 */

export interface Form {
  clientId: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  role: string;
  notes: string;
}
export const EMPTY: Form = { clientId: "", name: "", title: "", email: "", phone: "", role: "", notes: "" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[0-9+()\- ]{1,32}$/;

/** The form's problems in words, one per field; empty when it can be sent. Pure, for the tests. */
export function problems(f: Form, editing: boolean): Partial<Record<keyof Form, string>> {
  const out: Partial<Record<keyof Form, string>> = {};
  if (!editing && !f.clientId) out.clientId = "Choose the client this person works for.";
  if (f.name.trim().length < 2) out.name = "A name needs at least 2 characters.";
  if (f.email.trim() !== "" && !EMAIL.test(f.email.trim())) out.email = "Use a work e-mail such as name@company.com.";
  if (f.phone.trim() !== "") {
    const digits = f.phone.replace(/\D/g, "").length;
    if (!PHONE.test(f.phone.trim()) || digits < 7 || digits > 15) out.phone = "Use 7 to 15 digits, with +, spaces, dashes or brackets only.";
  }
  if (f.notes.length > 500) out.notes = "At most 500 characters.";
  return out;
}

export function toBody(f: Form): ContactBody {
  return { name: f.name.trim(), title: f.title.trim() || null, email: f.email.trim() || null, phone: f.phone.trim() || null, notes: f.notes.trim() || null, role: f.role || null };
}

export function formOf(c: ContactRow): Form {
  return { clientId: String(c.client.id), name: c.name, title: c.title ?? "", email: c.email ?? "", phone: c.phone ?? "", role: c.role ?? "", notes: c.notes ?? "" };
}

/** Only what changed, as a PATCH body; empty when nothing did. */
export function toPatch(f: Form, before: Form): Partial<ContactBody> {
  const b = toBody(f);
  const out: Partial<ContactBody> = {};
  if (f.name.trim() !== before.name) out.name = b.name;
  if (f.title.trim() !== before.title) out.title = b.title;
  if (f.email.trim() !== before.email) out.email = b.email;
  if (f.phone.trim() !== before.phone) out.phone = b.phone;
  if (f.role !== before.role) out.role = b.role;
  if (f.notes.trim() !== before.notes.trim()) out.notes = b.notes;
  return out;
}

export interface ContactFormDialogProps {
  orgId: number | string;
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  editing?: ContactRow | null;
  onSaved: (name: string, created: boolean) => void;
}

export default function ContactFormDialog({ orgId, open, onClose, clients, editing = null, onSaved }: ContactFormDialogProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [key, setKey] = useState(() => newKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh form and a fresh Idempotency-Key every time the dialog opens
      setForm(editing ? formOf(editing) : EMPTY);
      setKey(newKey());
      setError(null);
      setTouched(false);
      setBusy(false);
    }
  }, [open, editing]);

  const bad = problems(form, !!editing);
  const shown = (k: keyof Form) => (touched ? bad[k] : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setTouched(true);
    if (Object.keys(bad).length > 0) return;
    setBusy(true);
    setError(null);
    if (editing) {
      const patch = toPatch(form, formOf(editing));
      if (Object.keys(patch).length === 0) {
        setBusy(false);
        onClose();
        return;
      }
      const r = await clientsApi.patchContact(orgId, editing.client.id, editing.id, patch);
      setBusy(false);
      if (!r.ok) {
        setError(errorSentence(r));
        return;
      }
      onSaved(form.name.trim(), false);
      return;
    }
    const r = await clientsApi.addContact(orgId, Number(form.clientId), toBody(form), key);
    setBusy(false);
    if (!r.ok) {
      setError(errorSentence(r));
      return;
    }
    onSaved(form.name.trim(), true);
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={editing ? "Edit contact" : "Add contact"}
      description="A person at the client you work with. We keep business details only: no private e-mail addresses, and never identity or bank numbers."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="contact-form" disabled={busy} data-contact-submit>
            {busy ? "Saving..." : editing ? "Save changes" : "Add contact"}
          </Button>
        </>
      }
    >
      <form
        id="contact-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-3.5"
        data-contact-form
      >
        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 p-2.5 text-[13px] text-danger-text" data-contact-error>
            {error}
          </p>
        )}
        <Field label="Client" required={!editing} error={shown("clientId")}>
          <Select
            value={form.clientId}
            disabled={!!editing}
            onChange={(v) => set("clientId", v)}
            options={[{ value: "", label: "Choose a client" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))]}
            aria-label="Client"
          />
        </Field>
        <Field label="Name" required error={shown("name")}>
          <Input value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} placeholder="Jennifer Wilson" autoComplete="off" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <Input value={form.title} maxLength={80} onChange={(e) => set("title", e.target.value)} placeholder="VP of Talent Acquisition" autoComplete="off" />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(v) => set("role", v)} options={[{ value: "", label: "Not set" }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))]} aria-label="Role" />
          </Field>
          <Field label="Work e-mail" error={shown("email")}>
            <Input type="email" value={form.email} maxLength={254} onChange={(e) => set("email", e.target.value)} placeholder="jennifer@company.com" autoComplete="off" />
          </Field>
          <Field label="Work phone" error={shown("phone")}>
            <Input type="tel" value={form.phone} maxLength={32} onChange={(e) => set("phone", e.target.value)} placeholder="+1 512 555 0100" autoComplete="off" />
          </Field>
        </div>
        <Field label="Note" error={shown("notes")} hint="For example: prefers a call in the morning. Never identity numbers, bank details or birth dates.">
          <Textarea rows={3} value={form.notes} maxLength={500} onChange={(e) => set("notes", e.target.value)} aria-label="Note" />
        </Field>
      </form>
    </Dialog>
  );
}
