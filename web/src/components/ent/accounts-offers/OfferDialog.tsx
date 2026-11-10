"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the form is reset and the pickers loaded each time the dialog opens */

import { useEffect, useState } from "react";
import { Button, Dialog, Field, Input, Select, Textarea } from "@kiwiply/ui";
import { errorSentence, offersApi, toMinor, type OfferDetail, type OfferWrite, type PickerItem } from "@/lib/ent/offers";

const TYPES = [
  { value: "CONTRACT", label: "Contract" },
  { value: "FTE", label: "Full-time" },
  { value: "C2C", label: "Corp-to-corp" },
];
const PERIODS = [
  { value: "HOUR", label: "per hour" },
  { value: "DAY", label: "per day" },
  { value: "MONTH", label: "per month" },
  { value: "YEAR", label: "per year" },
];
const MODES = [
  { value: "", label: "Not set" },
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "ONSITE", label: "On site" },
];

interface Form {
  consultantId: string;
  clientId: string;
  roleTitle: string;
  placementType: string;
  workMode: string;
  startDate: string;
  endDate: string;
  rate: string;
  ratePeriod: string;
  currency: string;
  deadline: string;
  notes: string;
  extend: boolean;
}

const EMPTY: Form = { consultantId: "", clientId: "", roleTitle: "", placementType: "CONTRACT", workMode: "", startDate: "", endDate: "", rate: "", ratePeriod: "HOUR", currency: "USD", deadline: "", notes: "", extend: false };

function fromDetail(d: OfferDetail): Form {
  const o = d.offer;
  return {
    consultantId: String(o.consultant.id),
    clientId: o.clientId ? String(o.clientId) : "",
    roleTitle: o.roleTitle,
    placementType: o.placementType ?? "CONTRACT",
    workMode: o.workMode ?? "",
    startDate: o.startDate ?? "",
    endDate: o.endDate ?? "",
    rate: o.rateMinor === null ? "" : String(o.rateMinor / 100),
    ratePeriod: o.ratePeriod ?? "HOUR",
    currency: o.currency ?? "USD",
    deadline: o.deadline ?? "",
    notes: d.notes ?? "",
    extend: false,
  };
}

/**
 * Record an offer, or revise one. The dialog says what the page means everywhere else: this records what the client extended; the consultant is the only
 * one who can accept or decline it, and nothing is signed or sent by Kiwiply. Money is plain numbers with a currency and a period.
 */
export default function OfferDialog({
  open,
  orgId,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  orgId: number;
  /** The offer being revised, or null to record a new one. */
  editing: OfferDetail | null;
  onClose: () => void;
  onSaved: (d: OfferDetail, created: boolean) => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [consultants, setConsultants] = useState<PickerItem[]>([]);
  const [clients, setClients] = useState<PickerItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? fromDetail(editing) : EMPTY);
    setError(null);
    void offersApi.pickers(orgId, "consultant", "").then((r) => r.ok && setConsultants(r.data.items));
    void offersApi.pickers(orgId, "client", "").then((r) => r.ok && setClients(r.data.items));
  }, [open, editing, orgId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const rateMinor = toMinor(form.rate);
  const rateBad = Number.isNaN(rateMinor);
  const needsStart = form.extend;
  const valid = form.consultantId !== "" && form.clientId !== "" && form.roleTitle.trim() !== "" && !rateBad && (!needsStart || form.startDate !== "");

  async function submit() {
    setBusy(true);
    setError(null);
    const body: OfferWrite = {
      clientId: Number(form.clientId),
      roleTitle: form.roleTitle.trim(),
      placementType: form.placementType,
      workMode: form.workMode || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      rateMinor: rateMinor,
      ratePeriod: rateMinor === null ? null : form.ratePeriod,
      currency: form.currency.trim().toUpperCase() || "USD",
      deadline: form.deadline || null,
      notes: form.notes.trim() || null,
    };
    const r = editing
      ? await offersApi.update(orgId, editing.offer.id, body)
      : await offersApi.create(orgId, { ...body, consultantId: Number(form.consultantId), extend: form.extend });
    setBusy(false);
    if (r.ok) onSaved(r.data, !editing);
    else setError(errorSentence(r));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit offer" : "Record an offer"}
      description="This records an offer the client extended. Only the consultant can accept or decline it. Nothing is signed or sent from here, and no money moves."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="accent" disabled={!valid || busy} onClick={() => void submit()} data-offer-submit>
            {editing ? "Save changes" : form.extend ? "Record as extended" : "Save draft"}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5" data-offer-dialog>
        <Field label="Consultant" required>
          <Select
            aria-label="Consultant"
            value={form.consultantId}
            onChange={(v) => set("consultantId", v)}
            options={[{ value: "", label: "Choose a consultant" }, ...consultants.map((c) => ({ value: String(c.id), label: c.label }))]}
            disabled={!!editing}
          />
        </Field>
        <Field label="Client" required>
          <Select aria-label="Client" value={form.clientId} onChange={(v) => set("clientId", v)} options={[{ value: "", label: "Choose a client" }, ...clients.map((c) => ({ value: String(c.id), label: c.label }))]} />
        </Field>
        <Field label="Role" required>
          <Input value={form.roleTitle} maxLength={200} onChange={(e) => set("roleTitle", e.target.value)} aria-label="Role" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select aria-label="Type" value={form.placementType} onChange={(v) => set("placementType", v)} options={TYPES} />
          </Field>
          <Field label="Work mode">
            <Select aria-label="Work mode" value={form.workMode} onChange={(v) => set("workMode", v)} options={MODES} />
          </Field>
          <Field label="Start date" required={form.extend}>
            <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} aria-label="Start date" />
          </Field>
          <Field label="End date" hint="Optional.">
            <Input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set("endDate", e.target.value)} aria-label="End date" />
          </Field>
          <Field label="Rate" hint={rateBad ? "Use a number such as 95 or 95.50." : "Optional. A plain number."}>
            <Input inputMode="decimal" value={form.rate} onChange={(e) => set("rate", e.target.value)} aria-label="Rate" aria-invalid={rateBad || undefined} />
          </Field>
          <Field label="Per">
            <Select aria-label="Rate period" value={form.ratePeriod} onChange={(v) => set("ratePeriod", v)} options={PERIODS} />
          </Field>
          <Field label="Currency" hint="Three letters, for example USD.">
            <Input value={form.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} aria-label="Currency" />
          </Field>
          <Field label="Answer by" hint="Optional. The organization's default number of days applies when blank.">
            <Input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} aria-label="Answer by" />
          </Field>
        </div>
        <Field label="Notes" hint="Optional. No ID numbers, bank or tax details.">
          <Textarea rows={2} maxLength={500} value={form.notes} onChange={(e) => set("notes", e.target.value)} aria-label="Notes" />
        </Field>
        {!editing && (
          <label className="flex min-h-11 items-start gap-2.5 text-[13px] text-ink">
            <input type="checkbox" checked={form.extend} onChange={(e) => set("extend", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand-solid,var(--color-accent))]" data-offer-extend />
            <span>
              Record it as extended now. The consultant will see it and can answer. Needs a start date.
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
