"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the picker starts a search when the text changes and stores the answer */

import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Field, Input, Select, XIcon } from "@kiwiply/ui";
import { errorSentence, newKey, placementsApi, type PickerItem, type PlacementDetail, type PlacementType } from "@/lib/ent/placements";

const SEARCH_DELAY_MS = 250; // config-literal-ok: how long typing rests before the picker asks the server (UI timing)

/** A search box that lists up to 20 matches from the API; choosing one shows it as a chip with a clear button. */
function SearchPicker({
  orgId,
  kind,
  clientId,
  label,
  placeholder,
  value,
  onChange,
}: {
  orgId: number | string;
  kind: "consultant" | "client" | "contact" | "manager";
  clientId?: number;
  label: string;
  placeholder: string;
  value: PickerItem | null;
  onChange: (v: PickerItem | null) => void;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    setState("loading");
    const t = setTimeout(() => {
      void placementsApi.pickers(orgId, kind, text.trim(), clientId).then((r) => {
        if (mine !== seq.current) return;
        if (r.ok) {
          setItems(r.data.items);
          setState("idle");
        } else setState("error");
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [orgId, kind, clientId, text, open]);

  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius)] border border-line bg-paper-2/50 px-3 py-1.5 text-[13.5px]" data-picked={kind}>
        <span className="min-w-0 truncate">
          <span className="font-semibold text-ink">{value.label}</span>
          {value.sub && <span className="text-muted"> · {value.sub}</span>}
        </span>
        <button type="button" aria-label={`Change ${label.toLowerCase()}`} onClick={() => onChange(null)} className="grid h-7 w-7 flex-none place-items-center rounded-full hover:bg-paper-2">
          <XIcon size={14} aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        autoComplete="off"
      />
      {open && (
        <ul role="listbox" aria-label={`${label} results`} className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius)] border border-line bg-paper shadow-lg">
          {state === "loading" && <li className="px-3 py-2 text-[13px] text-muted">Searching…</li>}
          {state === "error" && <li className="px-3 py-2 text-[13px] text-danger">Couldn&apos;t load the list. Try again.</li>}
          {state === "idle" && items.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No matches.</li>}
          {state === "idle" &&
            items.map((it) => (
              <li key={it.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(it);
                    setOpen(false);
                    setText("");
                  }}
                  className="flex min-h-11 w-full flex-col items-start px-3 py-1.5 text-left hover:bg-accent-soft focus-visible:bg-accent-soft"
                >
                  <span className="text-[13.5px] font-semibold text-ink">{it.label}</span>
                  {it.sub && <span className="text-[12px] text-muted">{it.sub}</span>}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Add placement: records that a consultant is working (or will work) at a client. It adds a row; it signs nothing and moves no money. The bill
 * rate is a recorded number. The account manager defaults to the consultant's marketer.
 */
export default function AddPlacementDialog({
  open,
  onClose,
  orgId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  orgId: number | string;
  onCreated: (d: PlacementDetail) => void;
}) {
  const [consultant, setConsultant] = useState<PickerItem | null>(null);
  const [client, setClient] = useState<PickerItem | null>(null);
  const [contact, setContact] = useState<PickerItem | null>(null);
  const [manager, setManager] = useState<PickerItem | null>(null);
  const [role, setRole] = useState("");
  const [type, setType] = useState<PlacementType>("CONTRACT");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rate, setRate] = useState("");
  const [unit, setUnit] = useState("HOUR");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey());

  useEffect(() => {
    if (!open) return;
    key.current = newKey();
    setConsultant(null);
    setClient(null);
    setContact(null);
    setManager(null);
    setRole("");
    setType("CONTRACT");
    setStart("");
    setEnd("");
    setRate("");
    setUnit("HOUR");
    setErr(null);
  }, [open]);

  const rateNumber = rate.trim() === "" ? null : Number(rate);
  const rateBad = rateNumber !== null && (!Number.isFinite(rateNumber) || rateNumber < 0);
  const ready = !!consultant && !!client && role.trim() !== "" && start !== "" && !rateBad && (end === "" || end >= start);

  async function submit() {
    if (!ready || !consultant || !client || busy) return;
    setBusy(true);
    setErr(null);
    const r = await placementsApi.create(
      orgId,
      {
        consultantId: consultant.id,
        clientId: client.id,
        roleTitle: role.trim(),
        placementType: type,
        startDate: start,
        endDate: end || null,
        accountManagerMemberId: manager?.id ?? null,
        clientContactId: contact?.id ?? null,
        billRateMinor: rateNumber === null ? null : Math.round(rateNumber * 100),
        rateUnit: rateNumber === null ? null : unit,
      },
      key.current,
    );
    setBusy(false);
    if (!r.ok) {
      setErr(errorSentence(r));
      return;
    }
    onCreated(r.data);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add placement"
      description="Record that a consultant is placed at a client. This adds it to your records; it signs nothing and moves no money."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="accent" onClick={() => void submit()} disabled={!ready || busy} data-add-submit>
            Add placement
          </Button>
        </>
      }
    >
      <div className="space-y-3.5" data-add-dialog>
        <Field label="Consultant" required hint="Only consultants who are not placed right now are listed.">
          <SearchPicker orgId={orgId} kind="consultant" label="Consultant" placeholder="Search consultants" value={consultant} onChange={setConsultant} />
        </Field>
        <Field label="Client" required>
          <SearchPicker
            orgId={orgId}
            kind="client"
            label="Client"
            placeholder="Search clients"
            value={client}
            onChange={(c) => {
              setClient(c);
              setContact(null);
            }}
          />
        </Field>
        {client && (
          <Field label="Client contact">
            <SearchPicker orgId={orgId} kind="contact" clientId={client.id} label="Client contact" placeholder="Search this client's contacts" value={contact} onChange={setContact} />
          </Field>
        )}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Role" required>
            <Input value={role} maxLength={120} placeholder="Marketing Strategist" onChange={(e) => setRole(e.target.value)} aria-label="Role" />
          </Field>
          <Field label="Placement type">
            <Select aria-label="Placement type" value={type} onChange={(v) => setType(v as PlacementType)} options={[{ value: "CONTRACT", label: "Contract" }, { value: "FTE", label: "Full-time" }, { value: "C2C", label: "Corp-to-corp" }]} />
          </Field>
          <Field label="Start date" required>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start date" />
          </Field>
          <Field label="End date" hint="Leave empty for an open-ended placement.">
            <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} aria-label="End date" />
          </Field>
          <Field label="Bill rate" hint="A recorded number. Nothing is billed from here.">
            <div className="flex gap-2">
              <Input inputMode="decimal" value={rate} placeholder="125" onChange={(e) => setRate(e.target.value)} aria-label="Bill rate" aria-invalid={rateBad || undefined} />
              <div className="w-28 flex-none">
                <Select aria-label="Rate unit" value={unit} onChange={setUnit} options={[{ value: "HOUR", label: "per hour" }, { value: "DAY", label: "per day" }, { value: "MONTH", label: "per month" }, { value: "YEAR", label: "per year" }]} />
              </div>
            </div>
          </Field>
          <Field label="Account manager" hint="Leave empty to use the consultant's marketer.">
            <SearchPicker orgId={orgId} kind="manager" label="Account manager" placeholder="Search people" value={manager} onChange={setManager} />
          </Field>
        </div>
        {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
      </div>
    </Dialog>
  );
}
