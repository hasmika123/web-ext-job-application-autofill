"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { Button, CalendarCheckIcon, CalendarIcon, Field, Input, Select, SideSheet, SlidersIcon, cn } from "@kiwiply/ui";
import { BASE } from "./parts";
import {
  AVAIL_STATUSES,
  BLOCK_KINDS,
  REASON_MAX,
  STATUS_LABEL,
  TRAVEL_CHOICES,
  TRAVEL_LABEL,
  WORK_MODES,
  WORK_MODE_LABEL,
  blockProblem,
  draftOf,
  fromDateProblem,
  kindInfo,
  prefProblem,
  type AvailStatus,
  type AvailabilityView,
  type Block,
  type BlockDraft,
  type BlockKind,
  type PrefDraft,
  type TravelChoice,
  type WorkMode,
  type WriteResult,
} from "@/lib/ent/consultant-ws/availability";

/**
 * The three side sheets of the Availability page: one calendar entry (add / edit / delete), the availability itself (status and the date
 * the consultant is available from) and the work preferences kept on this page. Each one checks what the API will check (so the form refuses
 * early), hands the draft to its `onSave` and shows the API's own refusal (overlap, "we never store that") under the form. `onSave`
 * resolves to the API's answer; the page redraws from the fresh view it carries.
 */

const ERR = "mt-2 text-[12.5px] font-medium text-v2-coral-ink";
const NOTE = "text-[12.5px] leading-snug text-muted";

export type Saver<A extends unknown[]> = (...args: A) => Promise<WriteResult>;

/** The sentence under a form for a refused or failed write. */
export function failureText(r: WriteResult): string | null {
  if (r.kind === "OK") return null;
  if (r.kind === "DENIED") return "This page isn't part of your role.";
  if (r.kind === "INVALID") return r.sensitive ? "We never store personal identifiers. Please remove it and try again." : r.message;
  return "We couldn't save that. Nothing has changed.";
}

const dateInput = "min-h-11 sm:min-h-0";

function Group({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">{children}</div>;
}

/* ── one calendar entry ─────────────────────────────────────────────────────────────── */

export interface BlockSheetState {
  /** The entry being edited, or null for a new one. */
  block: Block | null;
  startDate: string;
  endDate: string;
  kind: BlockKind;
}

export function BlockSheet({
  state,
  today,
  onClose,
  onSave,
  onDelete,
}: {
  state: BlockSheetState | null;
  today: string;
  onClose: () => void;
  onSave: (id: number | null, d: BlockDraft) => Promise<WriteResult>;
  onDelete: (b: Block) => void;
}) {
  return (
    <SideSheet
      id="availability-block-sheet"
      side="right"
      mode="overlay"
      width={440}
      open={state !== null}
      title={state?.block ? "Edit calendar entry" : "Add blocked dates"}
      description="Mark time off, a holiday or a stretch when you are open to work."
      icon={<CalendarIcon size={20} />}
      onClose={onClose}
    >
      {state ? <BlockForm key={`${state.block?.id ?? "new"}-${state.startDate}`} state={state} today={today} onClose={onClose} onSave={onSave} onDelete={onDelete} /> : null}
    </SideSheet>
  );
}

function BlockForm({ state, today, onClose, onSave, onDelete }: { state: BlockSheetState; today: string; onClose: () => void; onSave: (id: number | null, d: BlockDraft) => Promise<WriteResult>; onDelete: (b: Block) => void }) {
  const b = state.block;
  const [draft, setDraft] = useState<BlockDraft>({ kind: b?.kind ?? state.kind, startDate: b?.startDate ?? state.startDate, endDate: b?.endDate ?? state.endDate, reason: b?.reason ?? "" });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = touched ? blockProblem(draft, today) : null;
  const id = useId();

  const submit = async () => {
    setTouched(true);
    if (blockProblem(draft, today)) return;
    setBusy(true);
    setError(null);
    const r = await onSave(b?.id ?? null, draft);
    setBusy(false);
    const msg = failureText(r);
    if (msg) setError(msg);
  };

  return (
    <form
      data-block-form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4 pt-1"
    >
      <Field label="Type">
        <Select
          aria-label="Type"
          value={draft.kind}
          onChange={(v) => setDraft((d) => ({ ...d, kind: v as BlockKind }))}
          options={BLOCK_KINDS.map((k) => ({ value: k, label: k === "AVAILABLE" ? "Available (open to work)" : kindInfo(k).label }))}
        />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <Field label="Start date">
          <Input type="date" className={dateInput} value={draft.startDate} onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value, endDate: d.endDate && d.endDate < e.target.value ? e.target.value : d.endDate }))} />
        </Field>
        <Field label="End date">
          <Input type="date" className={dateInput} value={draft.endDate} min={draft.startDate || undefined} onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))} />
        </Field>
      </div>
      <Field label="Reason (optional)" hint={`${draft.reason.trim().length}/${REASON_MAX}`}>
        <Input value={draft.reason} maxLength={REASON_MAX + 20} placeholder="For example: Family trip" onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))} />
      </Field>
      <p id={`${id}-rule`} className={NOTE}>
        {draft.kind === "VACATION"
          ? "A vacation starts as Pending. Approval by your marketer has no screen on their side yet, and nothing is sent to them."
          : draft.kind === "AVAILABLE"
            ? "Marks these days as open to work. It can't sit on top of time off."
            : "Personal days and holidays are saved as Approved. They can't overlap another entry."}{" "}
        Please don&apos;t include personal identifiers such as ID or account numbers.
      </p>
      <p role="alert" className={cn(ERR, "min-h-5 !mt-0")}>
        {problem ?? error ?? ""}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        {b ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(b)} disabled={busy}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {b ? "Save changes" : "Add entry"}
          </Button>
        </span>
      </div>
    </form>
  );
}

/* ── availability ───────────────────────────────────────────────────────────────────── */

export function AvailabilitySheet({ open, view, onClose, onSave }: { open: boolean; view: AvailabilityView | null; onClose: () => void; onSave: Saver<[AvailStatus, string | null]> }) {
  return (
    <SideSheet
      id="availability-status-sheet"
      side="right"
      mode="overlay"
      width={440}
      open={open && view !== null}
      title="Update availability"
      description="Tell your team when you are ready for new opportunities."
      icon={<CalendarCheckIcon size={20} />}
      onClose={onClose}
    >
      {open && view ? <StatusForm key={`${view.availability.status}-${view.availability.availableFrom ?? ""}`} view={view} onClose={onClose} onSave={onSave} /> : null}
    </SideSheet>
  );
}

function StatusForm({ view, onClose, onSave }: { view: AvailabilityView; onClose: () => void; onSave: Saver<[AvailStatus, string | null]> }) {
  const [status, setStatus] = useState<AvailStatus>(view.availability.status);
  const [from, setFrom] = useState(view.availability.availableFrom ?? "");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = touched ? fromDateProblem(from, view.today) : null;

  const submit = async () => {
    setTouched(true);
    if (fromDateProblem(from, view.today)) return;
    setBusy(true);
    setError(null);
    const r = await onSave(status, from || null);
    setBusy(false);
    const msg = failureText(r);
    if (msg) setError(msg);
  };

  return (
    <form
      data-status-form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4 pt-1"
    >
      <Field label="Status">
        <Select aria-label="Status" value={status} onChange={(v) => setStatus(v as AvailStatus)} options={AVAIL_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
      </Field>
      <Field label="Available from (optional)" hint="Leave it empty if you are open right away.">
        <Input type="date" className={dateInput} value={from} min={view.today} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <p className={NOTE}>This also updates the availability on My Career Profile. Each change is added to your availability history.</p>
      <p role="alert" className={cn(ERR, "min-h-5 !mt-0")}>
        {problem ?? error ?? ""}
      </p>
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          Save availability
        </Button>
      </div>
    </form>
  );
}

/* ── work preferences ───────────────────────────────────────────────────────────────── */

export function PreferencesSheet({ open, view, onClose, onSave }: { open: boolean; view: AvailabilityView | null; onClose: () => void; onSave: Saver<[PrefDraft]> }) {
  return (
    <SideSheet
      id="availability-prefs-sheet"
      side="right"
      mode="overlay"
      width={440}
      open={open && view !== null}
      title="Work preferences"
      description="How you like to work. Your marketer uses these to match you."
      icon={<SlidersIcon size={20} />}
      onClose={onClose}
    >
      {open && view ? <PrefsForm view={view} onClose={onClose} onSave={onSave} /> : null}
    </SideSheet>
  );
}

function PrefsForm({ view, onClose, onSave }: { view: AvailabilityView; onClose: () => void; onSave: Saver<[PrefDraft]> }) {
  const [d, setD] = useState<PrefDraft>(() => draftOf(view.preferences));
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = touched ? prefProblem(d) : null;
  const set = <K extends keyof PrefDraft>(k: K, v: PrefDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setTouched(true);
    if (prefProblem(d)) return;
    setBusy(true);
    setError(null);
    const r = await onSave(d);
    setBusy(false);
    const msg = failureText(r);
    if (msg) setError(msg);
  };

  return (
    <form
      data-prefs-form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4 pt-1"
    >
      <Group>
        <Field label="Preferred work mode">
          <Select
            aria-label="Preferred work mode"
            value={d.workMode}
            placeholder="Not set"
            onChange={(v) => set("workMode", v as WorkMode | "")}
            options={[{ value: "", label: "Not set" }, ...WORK_MODES.map((m) => ({ value: m, label: WORK_MODE_LABEL[m] }))]}
          />
        </Field>
        <Field label="Notice period (weeks)">
          <Input inputMode="numeric" value={d.noticeWeeks} placeholder="2" onChange={(e) => set("noticeWeeks", e.target.value)} />
        </Field>
      </Group>
      <Group>
        <Field label="Lowest hourly rate ($)">
          <Input inputMode="decimal" value={d.rateMin} placeholder="110" onChange={(e) => set("rateMin", e.target.value)} />
        </Field>
        <Field label="Highest hourly rate ($)">
          <Input inputMode="decimal" value={d.rateMax} placeholder="140" onChange={(e) => set("rateMax", e.target.value)} />
        </Field>
      </Group>
      <Field label="Rate note (optional)">
        <Input value={d.rateNote} maxLength={140} placeholder="Flexible based on role and scope" onChange={(e) => set("rateNote", e.target.value)} />
      </Field>
      <Group>
        <Field label="Travel">
          <Select
            aria-label="Travel"
            value={d.travelLabel}
            placeholder="Not set"
            onChange={(v) => set("travelLabel", v as TravelChoice | "")}
            options={[{ value: "", label: "Not set" }, ...TRAVEL_CHOICES.map((t) => ({ value: t, label: TRAVEL_LABEL[t] }))]}
          />
        </Field>
        <Field label="Up to (% of time)">
          <Input inputMode="numeric" value={d.travelLabel === "NONE" ? "0" : d.travelPercent} disabled={d.travelLabel === "NONE" || d.travelLabel === ""} placeholder="25" onChange={(e) => set("travelPercent", e.target.value)} />
        </Field>
      </Group>
      <p className={NOTE}>
        The rate is only recorded so your marketer knows your range; nothing is charged or paid here. Locations, employment types and work authorization are edited on{" "}
        <Link href={`${BASE}/profile`} className="font-semibold text-accent-deep hover:underline">
          My Career Profile
        </Link>
        .
      </p>
      <p role="alert" className={cn(ERR, "min-h-5 !mt-0")}>
        {problem ?? error ?? ""}
      </p>
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          Save preferences
        </Button>
      </div>
    </form>
  );
}
