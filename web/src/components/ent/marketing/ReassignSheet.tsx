"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, Input, MemberAvatar, SideSheet, Skeleton, Textarea, useNarrow } from "@kiwiply/ui";
import { OverCapacityNotice } from "./dialogs";
import {
  dayInput,
  dayStartIso,
  errorSentence,
  formatLocalDay,
  licenceLimitOf,
  marketingApi,
  overCapacityOf,
  planNote,
  previewLine,
  type HandoverPreview,
  type LicenceLimit,
  type Marketer,
  type OverCapacity,
  type ReassignResult,
  type Row,
  type Schedule,
} from "@/lib/ent/marketing-assignments";

export type SheetMode = "reassign" | "cover";

/** What the page needs to say after the sheet did something (toast, Undo, refresh). */
export type SheetOutcome =
  | { kind: "reassigned"; result: ReassignResult; name: string; toName: string }
  | { kind: "scheduled"; schedule: Schedule; name: string }
  | { kind: "cover"; schedule: Schedule; name: string }
  | { kind: "cancelled"; schedule: Schedule };

const REASON_MAX = 200; // config-literal-ok: the API's limit on a reason (UI input length)

/**
 * The Reassign sheet of Marketing Assignments: pick the new marketer, say why, choose now or a future date (or set temporary cover that ends by itself), and
 * see BEFORE anything happens how much open work will move (counts only) and how full the new marketer would be. The plans already waiting for the
 * consultant are listed with a Cancel (or End cover now). The API owns every rule; this sheet only asks and shows. Nothing here submits or acts for anyone.
 */
export default function ReassignSheet({
  open,
  onClose,
  orgId,
  consultant,
  marketers,
  initialMode,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  orgId: number;
  consultant: Row | null;
  marketers: Marketer[];
  initialMode: SheetMode;
  onDone: (o: SheetOutcome) => void;
}) {
  const narrow = useNarrow();
  return (
    <SideSheet
      id="reassign-sheet"
      side="right"
      mode={narrow ? "fullscreen" : "overlay"}
      open={open && !!consultant}
      width={480}
      title={consultant ? `Reassign ${consultant.name}` : "Reassign"}
      description="Move this consultant to another marketer now or later, or set temporary cover."
      onClose={onClose}
    >
      {open && consultant ? <SheetBody key={`${consultant.consultantId}:${initialMode}`} onClose={onClose} orgId={orgId} consultant={consultant} marketers={marketers} initialMode={initialMode} onDone={onDone} /> : null}
    </SideSheet>
  );
}

function SheetBody({ onClose, orgId, consultant, marketers, initialMode, onDone }: { onClose: () => void; orgId: number; consultant: Row; marketers: Marketer[]; initialMode: SheetMode; onDone: (o: SheetOutcome) => void }) {
  const [mode, setMode] = useState<SheetMode>(initialMode);
  const [pick, setPick] = useState<number | null>(null);
  const [whenNow, setWhenNow] = useState(true);
  const [day, setDay] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<OverCapacity | null>(null);
  const [licence, setLicence] = useState<LicenceLimit | null>(null);
  const [preview, setPreview] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: HandoverPreview }>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  const options = useMemo(() => marketers.filter((m) => m.status === "ACTIVE" && m.memberId !== consultant.marketer?.memberId), [marketers, consultant.marketer?.memberId]);
  const chosen = options.find((m) => m.memberId === pick) ?? null;

  useEffect(() => {
    const mine = ++seq.current;
    setPreview((p) => (p.status === "ok" ? p : { status: "loading" }));
    void marketingApi.preview(orgId, consultant.consultantId, pick).then((r) => {
      if (mine !== seq.current) return;
      setPreview(r.ok ? { status: "ok", data: r.data } : { status: "error", message: errorSentence(r) });
    });
  }, [orgId, consultant.consultantId, pick, tick]);

  const tomorrow = dayInput(1);
  const startIso = startNow ? undefined : (dayStartIso(startDay) ?? undefined);
  const endIso = dayStartIso(endDay);
  const effectiveIso = whenNow ? undefined : (dayStartIso(day) ?? undefined);
  const dateOk = mode === "reassign" ? whenNow || (!!effectiveIso && day >= tomorrow) : (startNow || (!!startIso && startDay >= dayInput(0))) && !!endIso && endDay > (startNow ? dayInput(0) : startDay);
  const reasonOk = mode === "cover" ? reason.trim().length >= 3 : true;
  const canSubmit = !!chosen && dateOk && reasonOk && !busy && !licence;

  const mutate = () => {
    setError(null);
    setOver(null);
    setLicence(null);
  };

  async function submit(force: boolean) {
    if (!chosen) return;
    setBusy(true);
    mutate();
    const why = reason.trim() ? { reason: reason.trim() } : {};
    const allow = force ? { allowOverCapacity: true } : {};
    if (mode === "reassign") {
      const r = await marketingApi.reassign(orgId, { consultantId: consultant.consultantId, newMarketerMemberId: chosen.memberId, ...(effectiveIso ? { effectiveAt: effectiveIso } : {}), ...why, ...allow });
      setBusy(false);
      if (r.ok) {
        onDone(r.data.status === "SCHEDULED" && r.data.schedule ? { kind: "scheduled", schedule: r.data.schedule, name: consultant.name } : { kind: "reassigned", result: r.data, name: consultant.name, toName: chosen.name });
        onClose();
        return;
      }
      fail(r);
      return;
    }
    const r = await marketingApi.delegate(orgId, { consultantId: consultant.consultantId, coverMarketerMemberId: chosen.memberId, ...(startIso ? { startsAt: startIso } : {}), endsAt: endIso ?? "", reason: reason.trim(), ...allow });
    setBusy(false);
    if (r.ok) {
      onDone({ kind: "cover", schedule: r.data, name: consultant.name });
      onClose();
      return;
    }
    fail(r);
  }

  function fail(r: { ok: false; status: number; code?: string; message: string; extra: Record<string, unknown> }) {
    const o = overCapacityOf(r);
    if (o) return setOver(o);
    const l = licenceLimitOf(r);
    if (l) return setLicence(l);
    setError(errorSentence(r));
  }

  async function cancelPlan(s: Schedule) {
    setBusy(true);
    const r = await marketingApi.cancelSchedule(orgId, s.id);
    setBusy(false);
    if (r.ok) {
      onDone({ kind: "cancelled", schedule: r.data });
      setTick((n) => n + 1);
    } else setError(errorSentence(r));
  }

  const pending = preview.status === "ok" ? preview.data.pending : [];

  return (
    <div className="flex h-full min-h-0 flex-col" data-reassign-sheet>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-4">
        <div className="flex gap-2" role="group" aria-label="What to do">
          <Button type="button" size="sm" variant={mode === "reassign" ? "primary" : "ghost"} aria-pressed={mode === "reassign"} onClick={() => { setMode("reassign"); mutate(); }} data-mode-reassign>
            Reassign
          </Button>
          <Button type="button" size="sm" variant={mode === "cover" ? "primary" : "ghost"} aria-pressed={mode === "cover"} onClick={() => { setMode("cover"); mutate(); }} data-mode-cover>
            Temporary cover
          </Button>
        </div>
        <p className="text-[12.5px] text-muted">
          {mode === "reassign"
            ? `${consultant.marketer ? `${consultant.name} is with ${consultant.marketer.name} now.` : `${consultant.name} has no marketer yet.`} Pick who takes over.`
            : `Someone covers ${consultant.name} while ${consultant.marketer?.name ?? "their marketer"} is away. On the day you choose, ${consultant.name} goes back by itself.`}
        </p>

        {pending.length > 0 && (
          <section aria-label="Plans already waiting" className="rounded-xl border border-line bg-paper-2/40 p-3" data-pending-plans>
            <h3 className="text-[12.5px] font-bold text-ink">Already planned</h3>
            <ul className="mt-1.5 space-y-1.5">
              {pending.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 text-[12.5px] text-ink-soft">
                  <span>
                    {planNote(s)}
                    {s.reason ? <span className="block text-[12px] text-muted">{s.reason}</span> : null}
                  </span>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void cancelPlan(s)} data-cancel-plan>
                    {s.status === "ACTIVE" ? "End cover now" : "Cancel"}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="New marketer">
          <h3 className="text-[12.5px] font-bold text-ink">{mode === "reassign" ? "New marketer" : "Who covers"}</h3>
          {options.length === 0 ? (
            <EmptyState variant="inline" title="No other marketer is available" description="Add a marketer, or resume a paused one." />
          ) : (
            <ul className="mt-2 max-h-[34vh] space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="Marketers">
              {options.map((m) => (
                <li key={m.memberId}>
                  <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${pick === m.memberId ? "border-accent bg-accent-soft/50" : "border-line hover:bg-paper-2/50"}`}>
                    <input
                      type="radio"
                      name="reassign-marketer"
                      checked={pick === m.memberId}
                      onChange={() => { setPick(m.memberId); mutate(); }}
                      className="h-4 w-4 accent-[var(--brand-primary,var(--color-accent))]"
                      aria-label={`${m.name}, ${m.assigned} of ${m.capacity}`}
                    />
                    <MemberAvatar name={m.name} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">{m.name}</span>
                      <span className="block truncate text-[12px] text-muted">{m.title ?? "Marketing"}</span>
                    </span>
                    <span className={`text-[12px] font-semibold tabular-nums ${m.assigned + 1 > m.capacity ? "text-danger-text" : "text-muted"}`}>{m.assigned + 1} / {m.capacity}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="When" className="space-y-2">
          <h3 className="text-[12.5px] font-bold text-ink">When</h3>
          {mode === "reassign" ? (
            <>
              <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink sm:min-h-0">
                <input type="radio" name="when" checked={whenNow} onChange={() => { setWhenNow(true); mutate(); }} className="h-4 w-4 accent-[var(--brand-primary,var(--color-accent))]" /> Now
              </label>
              <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink sm:min-h-0">
                <input type="radio" name="when" checked={!whenNow} onChange={() => { setWhenNow(false); if (!day) setDay(tomorrow); mutate(); }} className="h-4 w-4 accent-[var(--brand-primary,var(--color-accent))]" data-when-date /> On a date
              </label>
              {!whenNow && (
                <div className="pl-6">
                  <Input type="date" value={day} min={tomorrow} onChange={(e) => { setDay(e.target.value); mutate(); }} aria-label="Hand over on" className="w-48" />
                  <p className="mt-1 text-[12px] text-muted">The handover is applied that morning by the scheduled job, with the same history and audit as a change made now.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink sm:min-h-0">
                <input type="radio" name="start" checked={startNow} onChange={() => { setStartNow(true); mutate(); }} className="h-4 w-4 accent-[var(--brand-primary,var(--color-accent))]" /> Cover starts now
              </label>
              <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink sm:min-h-0">
                <input type="radio" name="start" checked={!startNow} onChange={() => { setStartNow(false); if (!startDay) setStartDay(tomorrow); mutate(); }} className="h-4 w-4 accent-[var(--brand-primary,var(--color-accent))]" /> Cover starts on a date
              </label>
              {!startNow && (
                <div className="pl-6">
                  <Input type="date" value={startDay} min={dayInput(0)} onChange={(e) => { setStartDay(e.target.value); mutate(); }} aria-label="Cover starts on" className="w-48" />
                </div>
              )}
              <label className="block text-[12.5px] font-semibold text-ink-soft">
                {consultant.marketer?.name ?? "The marketer"} is back on
                <Input type="date" value={endDay} min={startNow ? tomorrow : startDay} onChange={(e) => { setEndDay(e.target.value); mutate(); }} aria-label="Back on" className="mt-1 w-48" data-cover-end />
              </label>
            </>
          )}
        </section>

        <section aria-label="Why">
          <label className="block text-[12.5px] font-bold text-ink">
            {mode === "cover" ? "Why" : "Why (optional)"}
            <Textarea
              value={reason}
              maxLength={REASON_MAX}
              rows={2}
              onChange={(e) => { setReason(e.target.value); mutate(); }}
              placeholder={mode === "cover" ? "On leave until the 12th" : "Workload balance"}
              className="mt-1 font-normal"
              aria-label="Reason"
              data-reassign-reason
            />
          </label>
          <p className="mt-1 text-[12px] text-muted">Kept in the consultant&apos;s history. Please don&apos;t type private details about a person.</p>
        </section>

        <section aria-label="What will move" className="rounded-xl border border-line p-3" data-handover-preview aria-live="polite">
          <h3 className="text-[12.5px] font-bold text-ink">What will move</h3>
          {preview.status === "loading" && <Skeleton className="mt-2 h-10" />}
          {preview.status === "error" && (
            <p className="mt-1 text-[12.5px] text-danger-text">
              {preview.message}{" "}
              <button type="button" className="font-semibold underline" onClick={() => setTick((n) => n + 1)}>
                Try again
              </button>
            </p>
          )}
          {preview.status === "ok" && (
            <>
              <p className="mt-1 text-[13px] text-ink" data-preview-line>
                {previewLine(preview.data, chosen?.name ?? null)}
              </p>
              {preview.data.total > 0 && preview.data.handoverEnabled && (
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center" data-preview-counts>
                  {[
                    ["Opportunities", preview.data.opportunities],
                    ["Tasks", preview.data.tasks],
                    ["Follow-ups", preview.data.followups],
                  ].map(([label, n]) => (
                    <div key={label as string} className="rounded-lg bg-paper-2/60 px-2 py-1.5">
                      <dd className="text-[16px] font-extrabold tabular-nums text-ink">{n}</dd>
                      <dt className="text-[11px] text-muted">{label}</dt>
                    </div>
                  ))}
                </dl>
              )}
              {chosen && preview.data.toAssigned != null && preview.data.toCapacity != null && (
                <p className={`mt-2 text-[12.5px] ${preview.data.overCapacity ? "font-semibold text-danger-text" : "text-muted"}`}>
                  {chosen.name} would carry {preview.data.toAssigned + 1} of {preview.data.toCapacity} consultants
                  {preview.data.licenceMax ? ` (the license allows ${preview.data.licenceMax})` : ""}.
                </p>
              )}
            </>
          )}
        </section>

        {over && chosen && <OverCapacityNotice name={chosen.name} over={over} busy={busy} onForce={() => void submit(true)} />}
        {licence && chosen && (
          <p role="alert" data-licence-limit className="rounded-xl border border-[var(--color-v2-amber)] bg-v2-amber-soft p-3 text-[13px] text-ink">
            <span className="font-semibold">The license stops this.</span> It allows {licence.max} consultants per marketer and {chosen.name} already has {licence.current}. Pick another marketer, or ask your administrator to raise the allowance.
          </p>
        )}
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-danger-text">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-none items-center justify-between gap-2 border-t border-line pt-3">
        <span className="min-w-0 truncate text-[12px] text-muted" aria-live="polite">
          {mode === "reassign" && !whenNow && effectiveIso ? `Takes effect ${formatLocalDay(effectiveIso)}` : mode === "cover" && endIso ? `Back on ${formatLocalDay(endIso)}` : ""}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit(false)} disabled={!canSubmit} data-reassign-submit>
            {busy ? "Working..." : mode === "cover" ? (startNow ? "Start cover" : "Schedule cover") : whenNow ? "Reassign" : "Schedule handover"}
          </Button>
        </div>
      </div>
    </div>
  );
}
