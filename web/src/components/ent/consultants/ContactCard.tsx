"use client";

import { useState, type FormEvent } from "react";
import { Button, Input, PencilIcon } from "@kiwiply/ui";
import { PREFERRED_CONTACTS, TIME_ZONES, checkPhone, preferredLabel, timeZoneLabel } from "@/lib/ent/contact-fields";
import type { ConsultantDetail } from "@/lib/ent/consultants";

/**
 * Work phone, time zone and preferred contact of a consultant (contact data only, no identity documents). Read-only unless the caller may edit;
 * an Org Admin saves through the same PATCH as the other drawer fields, the API validates and PII-scans each value.
 */
export function ContactFields({ detail, canEdit, onSave }: { detail: ConsultantDetail; canEdit: boolean; onSave: (body: { phone: string | null; timeZone: string | null; preferredContact: string | null }) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(detail.phone ?? "");
  const [zone, setZone] = useState(detail.timeZone ?? "");
  const [pref, setPref] = useState(detail.preferredContact ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open() {
    setPhone(detail.phone ?? "");
    setZone(detail.timeZone ?? "");
    setPref(detail.preferredContact ?? "");
    setError(null);
    setEditing(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local = checkPhone(phone);
    if (local) return setError(local);
    setBusy(true);
    const err = await onSave({ phone: phone.trim() || null, timeZone: zone || null, preferredContact: pref || null });
    setBusy(false);
    if (err) return setError(err);
    setEditing(false);
  }

  if (editing) {
    return (
      <form onSubmit={submit} aria-label="Edit contact details" data-contact-form className="space-y-2.5">
        <div>
          <label htmlFor="cd-phone" className="text-[12.5px] font-semibold text-ink">
            Work phone
          </label>
          <Input id="cd-phone" type="tel" inputMode="tel" maxLength={32} value={phone} placeholder="e.g. (555) 010-0142" aria-invalid={error ? true : undefined} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cd-zone" className="text-[12.5px] font-semibold text-ink">
            Time zone
          </label>
          <select id="cd-zone" value={zone} onChange={(e) => setZone(e.target.value)} className="h-10 w-full rounded-md border border-line bg-paper px-2 text-[14px] text-ink">
            <option value="">Not set</option>
            {TIME_ZONES.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cd-pref" className="text-[12.5px] font-semibold text-ink">
            Best way to reach them
          </label>
          <select id="cd-pref" value={pref} onChange={(e) => setPref(e.target.value)} className="h-10 w-full rounded-md border border-line bg-paper px-2 text-[14px] text-ink">
            <option value="">Not set</option>
            {PREFERRED_CONTACTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[12px] text-muted">Contact details only. Please don&apos;t include ID numbers or dates of birth.</p>
        {error ? (
          <p role="alert" className="text-[12.5px] font-medium text-v2-coral-ink">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="accent" disabled={busy}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div data-contact-fields>
      <dl className="grid gap-1.5 text-[13px]">
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-muted">Phone</dt>
          <dd data-contact-phone className="min-w-0 break-words font-medium text-ink">{detail.phone ?? "Not set"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-muted">Time zone</dt>
          <dd data-contact-zone className="min-w-0 break-words font-medium text-ink">{timeZoneLabel(detail.timeZone) ?? "Not set"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 flex-none text-muted">Reach by</dt>
          <dd data-contact-pref className="min-w-0 break-words font-medium text-ink">{preferredLabel(detail.preferredContact) ?? "Not set"}</dd>
        </div>
      </dl>
      {canEdit ? (
        <button type="button" onClick={open} className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-md text-[12.5px] font-semibold text-accent-deep hover:underline">
          <PencilIcon size={13} /> Edit contact details
        </button>
      ) : null}
    </div>
  );
}
