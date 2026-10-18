"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Dialog, EmptyState, ErrorState, Input, MemberAvatar, Select, Skeleton, TableSkeleton } from "@kiwiply/ui";
import { Check, PriorityPill } from "./parts";
import {
  errorSentence,
  marketingApi,
  overText,
  type Marketer,
  type Option,
  type OverCapacity,
  type Row,
  type WorkloadReport,
} from "@/lib/ent/marketing-assignments";

/** What a dialog's submit answers: done, or a sentence to show, or the over-capacity figures (the dialog then offers "Assign anyway"). */
export type SubmitOutcome = { ok: true } | { ok: false; error: string; over?: OverCapacity };

const DEBOUNCE_MS = 250; // config-literal-ok: how long typing rests before the picker asks again (UI timing)

function useDebounced<T>(value: T, ms: number = DEBOUNCE_MS): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function OverCapacityNotice({ name, over, onForce, busy }: { name: string; over: OverCapacity; onForce: () => void; busy: boolean }) {
  return (
    <div role="alert" data-over-capacity className="rounded-xl border border-[var(--color-v2-amber)] bg-v2-amber-soft p-3 text-[13px] text-ink">
      <p className="font-semibold">That is over capacity.</p>
      <p className="mt-0.5">{overText(name, over.projected, over.capacity)} You can still do it, and it is recorded in the audit log.</p>
      <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={onForce} disabled={busy} data-assign-anyway>
        Assign anyway
      </Button>
    </div>
  );
}

/* ── Assign Consultants ──────────────────────────────────────────────────────────── */

/**
 * Pick consultants for the selected marketer: the ones nobody carries, or (the other tab) consultants of other marketers, which
 * reassigns them. A heads-up shows before the call when the pick would go past the marketer's capacity; the API makes the final call
 * (409 OVER_CAPACITY, then "Assign anyway").
 */
export function AssignDialog({ open, onClose, orgId, marketer, onSubmit }: { open: boolean; onClose: () => void; orgId: number; marketer: Marketer | null; onSubmit: (ids: number[], allowOver: boolean) => Promise<SubmitOutcome> }) {
  if (!open || !marketer) return null;
  return <AssignInner onClose={onClose} orgId={orgId} marketer={marketer} onSubmit={onSubmit} />;
}

function AssignInner({ onClose, orgId, marketer, onSubmit }: { onClose: () => void; orgId: number; marketer: Marketer; onSubmit: (ids: number[], allowOver: boolean) => Promise<SubmitOutcome> }) {
  const [scope, setScope] = useState<"unassigned" | "others">("unassigned");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [list, setList] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: Row[] }>({ status: "loading" });
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<OverCapacity | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setList({ status: "loading" });
    const p = new URLSearchParams({ size: "100", sort: "name,asc" });
    if (scope === "unassigned") p.set("unassigned", "true");
    if (dq.trim().length >= 2) p.set("q", dq.trim());
    void marketingApi.consultants(orgId, p).then((r) => {
      if (!alive) return;
      if (r.ok) setList({ status: "ok", items: r.data.items.filter((x) => x.marketer?.memberId !== marketer.memberId) });
      else setList({ status: "error", message: errorSentence(r) });
    });
    return () => {
      alive = false;
    };
  }, [orgId, scope, dq, marketer.memberId, tick]);

  const items = list.status === "ok" ? list.items : [];
  const toggle = (id: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const projected = marketer.assigned + picked.size;
  const warn = picked.size > 0 && projected > marketer.capacity;

  async function submit(force: boolean) {
    setBusy(true);
    setError(null);
    const r = await onSubmit([...picked], force);
    setBusy(false);
    if (r.ok) onClose();
    else if (r.over) setOver(r.over);
    else setError(r.error);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Assign consultants to ${marketer.name}`}
      description={`${marketer.assigned} of ${marketer.capacity} consultants today.`}
      className="max-w-xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-muted" aria-live="polite" data-picked-count>
            {picked.size} selected
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submit(false)} disabled={picked.size === 0 || busy} data-assign-submit>
              {busy ? "Assigning..." : `Assign ${picked.size || ""} ${picked.size === 1 ? "consultant" : "consultants"}`.replace("  ", " ")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        <div className="w-full sm:w-52">
          <Select
            aria-label="Pick from"
            value={scope}
            onChange={(v) => {
              setScope(v as "unassigned" | "others");
              setPicked(new Set());
            }}
            options={[
              { value: "unassigned", label: "Unassigned consultants" },
              { value: "others", label: "Other marketers' consultants" },
            ]}
          />
        </div>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or skill..." aria-label="Search consultants to assign" className="min-w-0 flex-1" />
      </div>
      {scope === "others" && <p className="mt-2 text-[12.5px] text-muted">These consultants move to {marketer.name}. You can undo it right after.</p>}

      <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-xl border border-line" data-assign-list>
        {list.status === "loading" && <Skeleton className="m-3 h-40" />}
        {list.status === "error" && <ErrorState what="the consultants" description={list.message} onRetry={() => setTick((n) => n + 1)} />}
        {list.status === "ok" && items.length === 0 && (
          <EmptyState variant="inline" title={scope === "unassigned" ? "Everyone has a marketer" : "No consultants to move"} description={scope === "unassigned" ? "There is nobody waiting for a marketer." : "Try another search."} />
        )}
        {items.length > 0 && (
          <ul className="divide-y divide-line/60">
            {items.map((r) => (
              <li key={r.consultantId}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-paper-2/50">
                  <Check checked={picked.has(r.consultantId)} onChange={() => toggle(r.consultantId)} label={`Select ${r.name}`} />
                  <MemberAvatar name={r.name} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{r.name}</span>
                    <span className="block truncate text-[12px] text-muted">{r.jobTitle ?? ""}{r.marketer ? ` · now with ${r.marketer.name}` : ""}</span>
                  </span>
                  {r.priority && <PriorityPill priority={r.priority} />}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {warn && !over && (
        <p role="status" data-capacity-warning className="mt-3 rounded-lg bg-v2-amber-soft px-3 py-2 text-[12.5px] text-ink">
          Heads up: {overText(marketer.name, projected, marketer.capacity)}
        </p>
      )}
      {over && <div className="mt-3"><OverCapacityNotice name={marketer.name} over={over} busy={busy} onForce={() => void submit(true)} /></div>}
      {error && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-danger-text">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/* ── pick one marketer (reassign / backup) ───────────────────────────────────────── */

/**
 * "Reassign to..." and "Set backup marketer...": a short list of marketers, one choice. `count` consultants are being moved, so the card
 * shows how full each marketer would be; a paused marketer and the excluded ones are not offered.
 */
export function MarketerPickerDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  marketers,
  excludeIds = [],
  count,
  checkCapacity,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  marketers: Marketer[];
  excludeIds?: number[];
  count: number;
  /** True for a reassign (the pick takes the consultants); a backup takes none. */
  checkCapacity: boolean;
  onSubmit: (marketerId: number, allowOver: boolean) => Promise<SubmitOutcome>;
}) {
  if (!open) return null;
  return <PickerInner onClose={onClose} title={title} description={description} confirmLabel={confirmLabel} marketers={marketers} excludeIds={excludeIds} count={count} checkCapacity={checkCapacity} onSubmit={onSubmit} />;
}

function PickerInner({ onClose, title, description, confirmLabel, marketers, excludeIds, count, checkCapacity, onSubmit }: Omit<Parameters<typeof MarketerPickerDialog>[0], "open">) {
  const options = marketers.filter((m) => m.status === "ACTIVE" && !(excludeIds ?? []).includes(m.memberId));
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<OverCapacity | null>(null);
  const chosen = options.find((m) => m.memberId === pick) ?? null;

  async function submit(force: boolean) {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const r = await onSubmit(chosen.memberId, force);
    setBusy(false);
    if (r.ok) onClose();
    else if (r.over) setOver(r.over);
    else setError(r.error);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit(false)} disabled={!chosen || busy} data-picker-submit>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      }
    >
      {options.length === 0 ? (
        <EmptyState variant="inline" title="No other marketer is available" description="Add a marketer, or resume a paused one." />
      ) : (
        <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="Marketers">
          {options.map((m) => {
            const after = m.assigned + (checkCapacity ? count : 0);
            return (
              <li key={m.memberId}>
                <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${pick === m.memberId ? "border-accent bg-accent-soft/50" : "border-line hover:bg-paper-2/50"}`}>
                  <input type="radio" name="marketer" value={m.memberId} checked={pick === m.memberId} onChange={() => { setPick(m.memberId); setOver(null); setError(null); }} className="h-4 w-4 accent-[var(--brand-primary,var(--color-accent))]" aria-label={`${m.name}, ${m.assigned} of ${m.capacity}`} />
                  <MemberAvatar name={m.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{m.name}</span>
                    <span className="block truncate text-[12px] text-muted">{m.title ?? "Marketing"}</span>
                  </span>
                  <span className={`text-[12px] font-semibold tabular-nums ${checkCapacity && after > m.capacity ? "text-danger-text" : "text-muted"}`}>
                    {checkCapacity && count > 0 ? `${after} / ${m.capacity}` : `${m.assigned} / ${m.capacity}`}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {over && chosen && <div className="mt-3"><OverCapacityNotice name={chosen.name} over={over} busy={busy} onForce={() => void submit(true)} /></div>}
      {error && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-danger-text">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/* ── Add Marketer ────────────────────────────────────────────────────────────────── */

/** Promote an existing active member who holds a marketing role. No account is created here: people join through Invitations. */
export function AddMarketerDialog({ open, onClose, orgId, inviteHref, onAdded }: { open: boolean; onClose: () => void; orgId: number; inviteHref: string | null; onAdded: (name: string) => void }) {
  if (!open) return null;
  return <AddInner onClose={onClose} orgId={orgId} inviteHref={inviteHref} onAdded={onAdded} />;
}

function AddInner({ onClose, orgId, inviteHref, onAdded }: { onClose: () => void; orgId: number; inviteHref: string | null; onAdded: (name: string) => void }) {
  const [cands, setCands] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: Option[] }>({ status: "loading" });
  const [pick, setPick] = useState<number | null>(null);
  const [capacity, setCapacity] = useState("20");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setCands({ status: "loading" });
    void marketingApi.candidates(orgId).then((r) => {
      if (!alive) return;
      setCands(r.ok ? { status: "ok", items: r.data.items } : { status: "error", message: errorSentence(r) });
    });
    return () => {
      alive = false;
    };
  }, [orgId, tick]);

  const cap = Number(capacity);
  const capOk = Number.isInteger(cap) && cap >= 1 && cap <= 200;

  async function submit() {
    if (pick == null || !capOk) return;
    setBusy(true);
    setError(null);
    const r = await marketingApi.addMarketer(orgId, { memberId: pick, capacity: cap, ...(title.trim() ? { title: title.trim() } : {}) });
    setBusy(false);
    if (r.ok) {
      onAdded(r.data.name);
      onClose();
    } else setError(errorSentence(r));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a marketer"
      description="Pick a member who has a marketing role. To bring in someone new, invite them first."
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={pick == null || !capOk || busy} data-add-submit>
            {busy ? "Adding..." : "Add marketer"}
          </Button>
        </div>
      }
    >
      {cands.status === "loading" && <TableSkeleton count={3} columns={2} label="Loading members" />}
      {cands.status === "error" && <ErrorState what="the members" description={cands.message} onRetry={() => setTick((n) => n + 1)} />}
      {cands.status === "ok" && cands.items.length === 0 && (
        <EmptyState
          variant="inline"
          title="Nobody is waiting to be added"
          description="Every active member with a marketing role is already a marketer."
          action={inviteHref ? <a href={inviteHref} className="font-semibold text-accent-deep underline">Invite someone</a> : undefined}
        />
      )}
      {cands.status === "ok" && cands.items.length > 0 && (
        <>
          <ul className="max-h-[34vh] space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="Members with a marketing role">
            {cands.items.map((c) => (
              <li key={c.id}>
                <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${pick === c.id ? "border-accent bg-accent-soft/50" : "border-line hover:bg-paper-2/50"}`}>
                  <input type="radio" name="candidate" checked={pick === c.id} onChange={() => setPick(c.id)} className="h-4 w-4 accent-[var(--brand-primary,var(--color-accent))]" aria-label={c.name} />
                  <MemberAvatar name={c.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{c.name}</span>
                    {c.detail && <span className="block truncate text-[12px] text-muted">{c.detail}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
            <label className="text-[12.5px] font-semibold text-ink-soft">
              Capacity
              <Input type="number" min={1} max={200} value={capacity} onChange={(e) => setCapacity(e.target.value)} aria-label="Capacity (most consultants at once)" className="mt-1" />
            </label>
            <label className="text-[12.5px] font-semibold text-ink-soft">
              Title (optional)
              <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Marketing Consultant" className="mt-1" />
            </label>
          </div>
          {!capOk && <p className="mt-1 text-[12px] text-danger-text">Capacity is a whole number from 1 to 200.</p>}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-danger-text">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/* ── capacity (autosave, no Save button) ─────────────────────────────────────────── */

/** The marketer's capacity as a number box that saves when you leave it or press Enter (the toast offers Undo). */
export function CapacityDialog({ open, onClose, marketer, onSave }: { open: boolean; onClose: () => void; marketer: Marketer | null; onSave: (capacity: number) => Promise<SubmitOutcome> }) {
  if (!open || !marketer) return null;
  return <CapacityInner onClose={onClose} marketer={marketer} onSave={onSave} />;
}

function CapacityInner({ onClose, marketer, onSave }: { onClose: () => void; marketer: Marketer; onSave: (capacity: number) => Promise<SubmitOutcome> }) {
  const [value, setValue] = useState(String(marketer.capacity));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const last = useRef(marketer.capacity);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 200;

  async function commit() {
    if (!valid || n === last.current) return;
    setState("saving");
    const r = await onSave(n);
    if (r.ok) {
      last.current = n;
      setState("saved");
      setError(null);
    } else {
      setState("error");
      setError(r.ok ? null : r.error);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Capacity of ${marketer.name}`} description="The most consultants this marketer should carry at once. Going past it is allowed with a warning." footer={<Button type="button" onClick={onClose}>Done</Button>}>
      <label className="block text-[12.5px] font-semibold text-ink-soft">
        Capacity
        <Input
          type="number"
          min={1}
          max={200}
          value={value}
          onChange={(e) => { setValue(e.target.value); setState("idle"); }}
          onBlur={() => void commit()}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commit(); } }}
          aria-label="Capacity"
          className="mt-1 w-32"
          autoFocus
        />
      </label>
      <p className="mt-2 min-h-5 text-[12.5px]" role="status" aria-live="polite" data-capacity-status>
        {state === "saving" && <span className="text-muted">Saving...</span>}
        {state === "saved" && <span className="font-semibold text-v2-green-ink">Saved</span>}
        {state === "error" && <span className="font-semibold text-danger-text">{error}</span>}
        {!valid && <span className="text-danger-text">A whole number from 1 to 200.</span>}
      </p>
      <p className="text-[12.5px] text-muted">{marketer.assigned} consultants assigned now.</p>
    </Dialog>
  );
}

/* ── workload report ─────────────────────────────────────────────────────────────── */

type ReportState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: WorkloadReport };

/** The workload report: one row per marketer with the load, the high-priority and paused counts, consultants with no backup, and open applications. */
export function WorkloadDialog({ open, onClose, orgId }: { open: boolean; onClose: () => void; orgId: number }) {
  if (!open) return null;
  return <WorkloadInner onClose={onClose} orgId={orgId} />;
}

function WorkloadInner({ onClose, orgId }: { onClose: () => void; orgId: number }) {
  const [state, setState] = useState<ReportState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    void marketingApi.workload(orgId).then((r) => {
      if (alive) setState(r.ok ? { status: "ok", data: r.data } : { status: "error", message: errorSentence(r) });
    });
    return () => {
      alive = false;
    };
  }, [orgId, tick]);
  const rows = useMemo(() => (state.status === "ok" ? state.data.items : []), [state]);
  return (
    <Dialog open onClose={onClose} title="Workload report" description="Who carries how much, right now." className="max-w-3xl" footer={<Button type="button" onClick={onClose}>Close</Button>}>
      {state.status === "loading" && <TableSkeleton count={4} columns={5} label="Loading the workload report" />}
      {state.status === "error" && <ErrorState what="the workload report" description={state.message} onRetry={() => setTick((n) => n + 1)} />}
      {state.status === "ok" && rows.length === 0 && <EmptyState variant="inline" title="No marketers yet" description="The report fills in once marketers carry consultants." />}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line" data-workload-report>
          <table aria-label="Workload by marketer" className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-paper-2/60 text-[11.5px] uppercase tracking-[.04em] text-muted">
              <tr>
                {["Marketer", "Load", "High priority", "Paused", "No backup", "Open applications", "Backup for"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((r) => (
                <tr key={r.memberId}>
                  <th scope="row" className="px-3 py-2 font-semibold text-ink">
                    <span className="flex items-center gap-2">
                      <MemberAvatar name={r.name} size={26} />
                      <span>
                        {r.name}
                        {r.status === "PAUSED" && <span className="ml-1 text-[11.5px] font-normal text-muted">(paused)</span>}
                      </span>
                    </span>
                  </th>
                  <td className={`px-3 py-2 tabular-nums ${r.overloaded ? "font-bold text-danger-text" : ""}`}>
                    {r.assigned} / {r.capacity} ({r.percent}%)
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.highPriority}</td>
                  <td className="px-3 py-2 tabular-nums">{r.paused}</td>
                  <td className="px-3 py-2 tabular-nums">{r.withoutBackup}</td>
                  <td className="px-3 py-2 tabular-nums">{r.activeApps}</td>
                  <td className="px-3 py-2 tabular-nums">{r.backupFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
