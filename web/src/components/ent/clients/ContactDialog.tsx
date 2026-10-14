"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Field, Input, Select } from "@kiwiply/ui";
import { clientsApi, errorSentence, newKey, ROLE_LABEL, type ClientDetail, type ContactBody } from "@/lib/ent/clients";

interface Form {
  name: string;
  title: string;
  email: string;
  role: string;
}
const EMPTY: Form = { name: "", title: "", email: "", role: "" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The form's problems in words, one per field; empty when it can be sent. Pure, for the tests. */
export function problems(f: Form): Partial<Record<keyof Form, string>> {
  const out: Partial<Record<keyof Form, string>> = {};
  if (f.name.trim().length < 2) out.name = "A name needs at least 2 characters.";
  if (f.email.trim() !== "" && !EMAIL.test(f.email.trim())) out.email = "Use a work e-mail such as name@company.com.";
  return out;
}

export function toBody(f: Form): ContactBody {
  return { name: f.name.trim(), title: f.title.trim() || null, email: f.email.trim() || null, role: f.role || null };
}

/**
 * Add Contact: a business contact only (name, title, work e-mail, role). No phone number and no private mailbox: the API refuses a
 * consumer mail domain (an organization setting). One Idempotency-Key per opening, so a double click or a retry adds one contact.
 */
export default function ContactDialog({ orgId, clientId, clientName, open, onClose, onAdded }: { orgId: number | string; clientId: number | null; clientName: string; open: boolean; onClose: () => void; onAdded: (d: ClientDetail, contactName: string) => void }) {
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

  const bad = problems(form);
  const shown = (k: keyof Form) => (touched ? bad[k] : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setTouched(true);
    if (clientId === null || Object.keys(bad).length > 0) return;
    setBusy(true);
    setError(null);
    const r = await clientsApi.addContact(orgId, clientId, toBody(form), key);
    setBusy(false);
    if (!r.ok) {
      setError(errorSentence(r));
      return;
    }
    onAdded(r.data, form.name.trim());
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Add contact"
      description={`A person at ${clientName} you work with. We keep a name, a title and a work e-mail only.`}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="add-contact-form" disabled={busy} data-contact-submit>
            {busy ? "Adding..." : "Add contact"}
          </Button>
        </>
      }
    >
      <form
        id="add-contact-form"
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
        <Field label="Name" required error={shown("name")}>
          <Input value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} placeholder="Jennifer Wilson" autoComplete="off" />
        </Field>
        <Field label="Title">
          <Input value={form.title} maxLength={80} onChange={(e) => set("title", e.target.value)} placeholder="VP of Talent Acquisition" autoComplete="off" />
        </Field>
        <Field label="Work e-mail" error={shown("email")}>
          <Input type="email" value={form.email} maxLength={254} onChange={(e) => set("email", e.target.value)} placeholder="jennifer@company.com" autoComplete="off" />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={(v) => set("role", v)} options={[{ value: "", label: "Not set" }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))]} />
        </Field>
      </form>
    </Dialog>
  );
}
