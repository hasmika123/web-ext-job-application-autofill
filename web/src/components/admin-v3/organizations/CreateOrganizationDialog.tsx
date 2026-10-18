"use client";

import { useId, useState, type FormEvent } from "react";
import { Button, Input, Select } from "@kiwiply/ui";
import { SheetFrame } from "../common/ReasonSheet";
import LabelField, { useLabelCheck } from "./LabelField";
import { adminFetch } from "@/lib/admin-client";
import { ORG_TYPES, type CreatedOrg } from "@/lib/admin-orgs";

/**
 * Create organization (X1.11): name, address ({label}.kiwiply.com, checked live), type and the OWNER's name and e-mail. No e-mail is
 * sent: a NEW organization account is created for the owner here (S9, decision O4: any personal Kiwiply account with that address is
 * not read, touched or linked) and the temporary password comes back in the answer, which the page shows once. The platform admin gives
 * it to the owner. (A legacy shared-account organization may still answer `ownerAccount: EXISTING`; the temporary-password dialog then says none was issued.)
 */
export default function CreateOrganizationDialog({ open, baseDomain, onClose, onCreated }: { open: boolean; baseDomain: string; onClose: () => void; onCreated: (created: CreatedOrg) => void }) {
  return (
    <SheetFrame id="create-org-sheet" open={open} onClose={onClose} title="Create organization">
      {open && <Form baseDomain={baseDomain} onClose={onClose} onCreated={onCreated} />}
    </SheetFrame>
  );
}

function Form({ baseDomain, onClose, onCreated }: { baseDomain: string; onClose: () => void; onCreated: (created: CreatedOrg) => void }) {
  const uid = useId();
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("CONSULTANCY");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useLabelCheck(label, null);

  const ready = name.trim().length > 0 && state.kind === "ok" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail.trim()) && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const res = await adminFetch<CreatedOrg>("POST", "/orgs", { name: name.trim(), label: label.trim(), type, ownerEmail: ownerEmail.trim(), ownerName: ownerName.trim() || undefined });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onCreated(res.data);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <p className="text-[13.5px] leading-snug text-ink-soft">
        Creates the organization, its address and a new organization account for its owner. The owner&apos;s personal Kiwiply account, if they have one, is not touched or linked. No e-mail is sent: you will see the owner&apos;s temporary password once, to give to them.
      </p>
      <div>
        <label htmlFor={`${uid}-name`} className="mb-1 block text-[12.5px] font-semibold text-ink">
          Organization name
        </label>
        <Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Acme Staffing" maxLength={120} />
      </div>
      <LabelField label={label} onChange={setLabel} state={state} baseDomain={baseDomain} />
      <div>
        <span className="mb-1 block text-[12.5px] font-semibold text-ink" id={`${uid}-type-l`}>
          Type
        </span>
        <Select value={type} onChange={setType} aria-labelledby={`${uid}-type-l`} options={ORG_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-oname`} className="mb-1 block text-[12.5px] font-semibold text-ink">
            Owner name
          </label>
          <Input id={`${uid}-oname`} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="off" placeholder="Olivia Owner" maxLength={100} />
        </div>
        <div>
          <label htmlFor={`${uid}-oemail`} className="mb-1 block text-[12.5px] font-semibold text-ink">
            Owner e-mail
          </label>
          <Input id={`${uid}-oemail`} type="email" inputMode="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} autoComplete="off" autoCapitalize="none" placeholder="owner@acme.com" maxLength={254} />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] leading-snug text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy} className="min-h-11 sm:min-h-0">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!ready} className="min-h-11 sm:min-h-0">
          {busy ? "Creating…" : "Create organization"}
        </Button>
      </div>
    </form>
  );
}
