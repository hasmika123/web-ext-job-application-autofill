"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ClipboardCheckIcon, Dialog, cn } from "@kiwiply/ui";
import type { OppRow } from "@/lib/ent/consultant-ws/opportunities";
import {
  CONFIRM_TEXT,
  ITEM_LABEL,
  PHONE_NOTE,
  POLL_MS,
  allFinal,
  buildPrepareMessage,
  capsText,
  createPrepareSession,
  fetchPrepareSession,
  fetchPrepareStatus,
  prepareBlock,
  prepareLabel,
  reasonNote,
  sendPrepareBatch,
  skippedText,
  type PrepareCreated,
  type PrepareSession,
  type PrepareStatus,
} from "@/lib/ent/consultant-ws/prepareBatch";
import JobLinkButton from "./JobLinkButton";
import { Pill } from "./parts";
import { useCompact } from "./useCompact";

/**
 * Prepare selected openings on the Assigned Opportunities page (docs/enterprise-v2/63-prepare-batch.md). The consultant ticks openings and confirms; the API plans
 * the batch (and charges the admin-set limits); the page hands the plan to the Kiwiply extension, which opens each job in a new tab of the consultant's own browser
 * and fills it from their profile. Nothing is submitted for anyone: the consultant reviews, completes what is missing and presses the final button on the real
 * site. The batch action is for a desktop browser with the extension; on a phone or a touch tablet it is hidden with a note.
 */

export type Stage = "idle" | "confirm" | "sending";

export interface PrepareUi {
  /** The feature is on for this organization AND this is a desktop-class screen: show the checkboxes and the bar. */
  active: boolean;
  /** The feature is on but this screen is a phone / touch tablet: show the note instead. */
  phoneOnly: boolean;
  /** One calm line when the feature is off for this consultant because the organization has not turned it on or the licence lacks it; null otherwise. */
  note: string | null;
  status: PrepareStatus | null;
  selected: ReadonlySet<number>;
  /** Why this row cannot be ticked, or null. */
  blockOf: (r: OppRow) => string | null;
  /** True for an un-ticked row once the batch size limit is reached. */
  atLimit: boolean;
  toggle: (r: OppRow) => void;
  stage: Stage;
  error: string;
  open: () => void;
  cancel: () => void;
  confirm: () => void;
  run: { created: PrepareCreated; session: PrepareSession | null; acked: boolean | null; titles: Record<number, string> } | null;
  dismiss: () => void;
}

export function usePrepareBatch(orgId: number, rows: readonly OppRow[], loaded: boolean): PrepareUi {
  const compact = useCompact();
  const [status, setStatus] = useState<PrepareStatus | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [run, setRun] = useState<PrepareUi["run"]>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // one status read once the page itself has loaded (the page's own call stays the first one)
  useEffect(() => {
    if (!loaded) return;
    const ctl = new AbortController();
    void fetchPrepareStatus(orgId, ctl.signal).then((s) => {
      if (!ctl.signal.aborted) setStatus(s);
    });
    return () => ctl.abort();
  }, [orgId, loaded]);

  const enabled = status?.enabled === true;
  const active = enabled && !compact;

  // a row that changed under the consultant (declined, applied, closed) drops out of the selection
  const blockedIds = useMemo(() => new Set(rows.filter((r) => prepareBlock(r) !== null).map((r) => r.matchId)), [rows]);
  const live = useMemo(() => new Set([...selected].filter((id) => !blockedIds.has(id) && rows.some((r) => r.matchId === id))), [selected, blockedIds, rows]);
  const max = status?.maxBatch ?? 0;
  const atLimit = max > 0 && live.size >= max;

  const toggle = useCallback(
    (r: OppRow) => {
      if (prepareBlock(r) !== null) return;
      setSelected((cur) => {
        const next = new Set(cur);
        if (next.has(r.matchId)) next.delete(r.matchId);
        else if (max === 0 || next.size < max) next.add(r.matchId);
        return next;
      });
    },
    [max],
  );

  const confirm = useCallback(() => {
    if (stage === "sending" || live.size === 0) return;
    const ids = rows.filter((r) => live.has(r.matchId)).map((r) => r.matchId);
    setStage("sending");
    setError("");
    void (async () => {
      const res = await createPrepareSession(orgId, ids);
      if (!alive.current) return;
      if (res.kind === "CAP") {
        setStatus((s) => (s ? { ...s, remainingToday: res.remainingToday, remainingMonth: res.remainingMonth } : s));
        setError(`${res.message} Today ${res.remainingToday} left, this month ${res.remainingMonth} left.`);
        setStage("confirm");
        return;
      }
      if (res.kind !== "OK") {
        setError(res.kind === "FAILED" && res.message ? res.message : "That didn't go through. Nothing has been opened.");
        setStage("confirm");
        return;
      }
      const created = res.value;
      setStatus((s) => (s ? { ...s, remainingToday: created.remainingToday, remainingMonth: created.remainingMonth } : s));
      const titles = Object.fromEntries(rows.map((r) => [r.matchId, r.title]));
      if (created.sessionId === null || created.jobs.length === 0) {
        setRun({ created, session: null, acked: null, titles });
        setSelected(new Set());
        setStage("idle");
        return;
      }
      setRun({ created, session: null, acked: null, titles });
      setSelected(new Set());
      setStage("idle");
      const ok = await sendPrepareBatch(buildPrepareMessage(created.sessionId, orgId, created.jobs));
      if (alive.current) setRun((cur) => (cur && cur.created === created ? { ...cur, acked: ok } : cur));
    })();
  }, [live, orgId, rows, stage]);

  // the progress panel reads the session while anything is still moving
  const sessionId = run?.created.sessionId ?? null;
  const settled = run?.session ? allFinal(run.session.items) : false;
  useEffect(() => {
    if (sessionId === null || settled) return;
    let stopped = false;
    const pull = () =>
      void fetchPrepareSession(orgId, sessionId).then((s) => {
        if (!stopped && s) setRun((cur) => (cur && cur.created.sessionId === sessionId ? { ...cur, session: s } : cur));
      });
    pull();
    const t = setInterval(pull, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [orgId, sessionId, settled]);

  return {
    active,
    phoneOnly: enabled && compact,
    note: status && !status.enabled ? reasonNote(status.reason) : null,
    status,
    selected: live,
    blockOf: prepareBlock,
    atLimit,
    toggle,
    stage,
    error,
    open: () => {
      if (live.size === 0) return;
      setError("");
      setStage("confirm");
    },
    cancel: () => {
      if (stage !== "sending") setStage("idle");
    },
    confirm,
    run,
    dismiss: () => setRun(null),
  };
}

/* ── the bar above the table ──────────────────────────────────────────────────────────── */

export function PrepareBar({ p }: { p: PrepareUi }) {
  if (p.note) {
    return (
      <p data-prepare-off-note className="mb-2 rounded-lg bg-paper-2 px-3 py-2 text-[12.5px] text-muted">
        {p.note}
      </p>
    );
  }
  if (p.phoneOnly) {
    return (
      <p data-prepare-phone-note className="mb-2 rounded-lg bg-paper-2 px-3 py-2 text-[12.5px] text-muted">
        {PHONE_NOTE}
      </p>
    );
  }
  if (!p.active || !p.status) return null;
  const n = p.selected.size;
  return (
    <div data-prepare-bar className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-paper-2/50 px-3 py-2">
      <Button variant="accent" size="sm" data-prepare-open disabled={n === 0 || p.stage === "sending"} onClick={p.open}>
        <ClipboardCheckIcon size={14} />
        {prepareLabel(n)}
      </Button>
      <p data-prepare-caps className="text-[12.5px] text-muted">
        {capsText(p.status)}
      </p>
    </div>
  );
}

/** The checkbox cell of one row. A row that cannot be ticked says why, in words, next to its title (see {@link PrepareWhy}). */
export function PrepareCheck({ row, p }: { row: OppRow; p: PrepareUi }) {
  const block = p.blockOf(row);
  const checked = p.selected.has(row.matchId);
  const full = !checked && p.atLimit;
  const why = block ?? (full ? `You can prepare up to ${p.status?.maxBatch ?? 0} at a time.` : null);
  return (
    <input
      type="checkbox"
      data-prepare-check={row.matchId}
      aria-label={`Select ${row.title} to prepare`}
      title={why ?? undefined}
      checked={checked}
      disabled={block !== null || full}
      onChange={() => p.toggle(row)}
      className="h-4 w-4 accent-[var(--brand-primary,var(--color-accent))] disabled:opacity-40"
    />
  );
}

export function PrepareWhy({ row, p }: { row: OppRow; p: PrepareUi }) {
  const block = p.blockOf(row);
  if (!block) return null;
  return (
    <span data-prepare-why className="mt-0.5 block text-[11.5px] text-muted">
      Can&apos;t prepare: {block}
    </span>
  );
}

/* ── confirm dialog and progress ──────────────────────────────────────────────────────── */

export function PrepareConfirmDialog({ p, rows }: { p: PrepareUi; rows: readonly OppRow[] }) {
  const chosen = rows.filter((r) => p.selected.has(r.matchId));
  const open = p.stage === "confirm" || p.stage === "sending";
  return (
    <Dialog
      open={open}
      onClose={p.cancel}
      title={chosen.length === 1 ? "Prepare 1 opening" : `Prepare ${chosen.length} openings`}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={p.stage === "sending"} onClick={p.cancel}>
            Cancel
          </Button>
          <Button variant="accent" size="sm" data-prepare-confirm disabled={p.stage === "sending" || chosen.length === 0} onClick={p.confirm}>
            {p.stage === "sending" ? "Preparing..." : "Prepare"}
          </Button>
        </>
      }
    >
      <div data-prepare-dialog className="grid gap-3">
        <p className="text-[13.5px] text-ink-soft">{CONFIRM_TEXT}</p>
        <ul className="grid gap-1 text-[13px] text-ink">
          {chosen.map((r) => (
            <li key={r.matchId} className="truncate">
              {r.title}
              {r.company ? <span className="text-muted"> · {r.company}</span> : null}
            </li>
          ))}
        </ul>
        {p.error ? (
          <p role="alert" data-prepare-error className="text-[12.5px] font-medium text-v2-coral-ink">
            {p.error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

export function PrepareProgress({ p }: { p: PrepareUi }) {
  const run = p.run;
  if (!run) return null;
  const { created } = run;
  const items = run.session?.items ?? created.jobs.map((j) => ({ matchId: j.matchId, url: j.url, title: j.title, company: j.company, state: "WAITING" as const, detail: null, applied: false, updatedAt: null }));
  const none = created.sessionId === null || created.jobs.length === 0;
  return (
    <section aria-label="Prepared openings" data-prepare-progress className="rounded-[var(--radius-lg)] border border-line bg-paper p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-ink">{none ? "Nothing to prepare" : "Preparing your openings"}</h3>
        <Button variant="ghost" size="sm" data-prepare-dismiss onClick={p.dismiss}>
          Close
        </Button>
      </div>
      {none ? (
        <p className="mt-2 text-[13px] text-ink-soft">None of the selected openings can be prepared right now, and nothing was counted against your limit.</p>
      ) : (
        <>
          {run.acked === null ? (
            <p role="status" data-prepare-waiting className="mt-2 text-[13px] text-ink-soft">
              Asking the browser extension to open your jobs...
            </p>
          ) : run.acked ? (
            <p role="status" data-prepare-acked className="mt-2 text-[13px] text-ink-soft">
              The extension is opening each job in a new tab and filling it from your profile. Review each tab, fix anything missing and press Submit yourself. Nothing is submitted for you.
            </p>
          ) : (
            <div role="alert" data-prepare-no-extension className="mt-2 rounded-lg border border-line bg-paper-2/60 p-3 text-[13px] text-ink">
              <p className="font-semibold">Extension not detected</p>
              <p className="mt-1 text-ink-soft">
                Open this page in the browser where the browser extension is installed and connected to your organization, then try again. Or open the links one by one and use the extension on each job as usual.
              </p>
            </div>
          )}
          <ul className="mt-3 divide-y divide-line">
            {items.map((i) => {
              const s = ITEM_LABEL[i.state];
              return (
                <li key={i.matchId} data-prepare-item={i.matchId} data-state={i.state} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{i.title}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {i.company ?? ""}
                      {i.detail ? `${i.company ? " · " : ""}${i.detail}` : ""}
                    </span>
                  </span>
                  <Pill tone={s.tone}>{s.label}</Pill>
                  {i.applied ? <span className="text-[12px] font-semibold text-v2-green-ink">Application tracked</span> : null}
                  {run.acked === false ? <JobLinkButton title={i.title} source={{ sourceUrl: i.url, sourceName: null }} variant="ghost" className={cn("!min-h-8")} /> : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {created.skipped.length > 0 ? (
        <p data-prepare-skipped className="mt-3 text-[12.5px] text-muted">
          Not prepared: {created.skipped.map((s) => `${run.titles[s.matchId] ?? "An opening"} (${skippedText(s.reason)})`).join(", ")}
        </p>
      ) : null}
    </section>
  );
}
