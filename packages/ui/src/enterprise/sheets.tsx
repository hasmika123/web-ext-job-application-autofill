"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import BottomSheet from "../primitives/BottomSheet";
import Button from "../primitives/Button";
import Dialog from "../primitives/Dialog";
import EmptyState from "../primitives/EmptyState";
import ErrorState from "../primitives/ErrorState";
import Input from "../primitives/Input";
import SideSheet from "../primitives/SideSheet";
import Spinner from "../primitives/Spinner";
import Textarea from "../primitives/Textarea";
import useMediaQuery from "../primitives/useMediaQuery";

/**
 * ReasonSheet, ConfirmTypedSheet, HistoryDrawer (X2.15; promoted from the admin kit and decoupled from the web's
 * `adminFetch`: they take plain async callbacks, so the tenant admin and the platform admin share one implementation).
 *
 * ReasonSheet: the confirm-with-reason step before a HIGH-risk action. A title, one sentence of consequence, ONE required
 * field and [Confirm] [Cancel]; a Dialog from `md` up, a BottomSheet on a phone.
 *
 *   <ReasonSheet spec={spec} onClose={() => setSpec(null)} />
 *   spec = { title: "Suspend Priya?", body: "She will lose access at once.", confirmLabel: "Suspend",
 *            run: async (reason) => api.suspend(id, reason) }
 */

// config-literal-ok: Tailwind's `md` breakpoint in media-query form; layout geometry, not a tunable
const NARROW_QUERY = "(max-width: 767px)";

/** True on a phone (below `md`). The server snapshot is false (desktop); a phone corrects itself after hydration. */
export function useNarrow(): boolean {
  return useMediaQuery(NARROW_QUERY, false);
}

export const REASON_MIN = 10; // characters; a reason shorter than a few words is not a reason
export const REASON_MAX = 500; // config-literal-ok: the audit reason column is 1000 chars wide; 500 is the plan's cap

const TARGET = "min-h-11 sm:min-h-0";

/** What `run` answers: the sheet closes on ok, and keeps the error under the field otherwise. */
export type SheetOutcome = { ok: true } | { ok: false; error: string; code?: string };

export interface ReasonSpec {
  title: string;
  /** One sentence of consequence. */
  body: ReactNode;
  confirmLabel: string;
  /** `danger` (default) for deactivate / remove / delete; `primary` for a HIGH action that is not destructive. */
  tone?: "danger" | "primary";
  placeholder?: string;
  /** Offered after `run` refuses with `forceCode`: sends the same change with `force = true`. */
  forceLabel?: string;
  forceCode?: string;
  run: (reason: string, force: boolean) => Promise<SheetOutcome>;
}

/** Why `reason` is not enough yet, or null when it is (empty is not scolded: the button just stays off). */
export function reasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  if (n === 0) return null;
  return n < REASON_MIN ? `Add a few more words (at least ${REASON_MIN} characters).` : null;
}

export function reasonOk(reason: string): boolean {
  const n = reason.trim().length;
  return n >= REASON_MIN && n <= REASON_MAX;
}

/** A Dialog on a desktop, a BottomSheet on a phone; focus goes back to whatever opened it. */
export function SheetFrame({ id, open, onClose, title, children }: { id: string; open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const narrow = useNarrow();
  const trigger = useRef<HTMLElement | null>(null);
  // Before any child effect moves focus into the sheet, remember who had it.
  useLayoutEffect(() => {
    if (open) trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  if (narrow) {
    return (
      <BottomSheet id={id} open={open} onClose={onClose} title={title} returnFocusTo={trigger}>
        {children}
      </BottomSheet>
    );
  }
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {children}
    </Dialog>
  );
}

export interface ReasonFormProps {
  spec: ReasonSpec;
  onClose: () => void;
  /** Type-to-confirm: the confirm button also needs this exact text. */
  typed?: { expected: string; label?: string };
}

/** The form both sheets share: body, optional type-to-confirm, the reason, the buttons. */
export function ReasonForm({ spec, onClose, typed }: ReasonFormProps) {
  const uid = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Focus the first field once the sheet has recorded who opened it (autoFocus would run first).
    const t = setTimeout(() => (typedRef.current ?? reasonRef.current)?.focus(), 0);
    return () => clearTimeout(t);
  }, []);
  const [reason, setReason] = useState("");
  const [typedText, setTypedText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceable, setForceable] = useState(false);

  const typedOk = !typed || typedText.trim() === typed.expected;
  const ready = reasonOk(reason) && typedOk && !busy;
  const local = reasonProblem(reason);

  async function go(force: boolean) {
    if (!ready) return;
    setBusy(true);
    setError(null);
    let out: SheetOutcome;
    try {
      out = await spec.run(reason.trim(), force);
    } catch {
      out = { ok: false, error: "Something went wrong. Try again." };
    }
    setBusy(false);
    if (out.ok) {
      onClose();
      return;
    }
    setError(out.error);
    setForceable(!!spec.forceLabel && !!spec.forceCode && out.code === spec.forceCode);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void go(false);
    }
  }

  const tone = spec.tone ?? "danger";
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void go(false);
      }}
      className="space-y-3"
    >
      <div className="text-[14px] leading-relaxed text-ink">{spec.body}</div>
      {typed && (
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold text-ink">
            Type <span className="font-mono">{typed.expected}</span> to confirm{typed.label ? ` (${typed.label})` : ""}
          </span>
          <Input ref={typedRef} value={typedText} onChange={(e) => setTypedText(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label={`Type ${typed.expected} to confirm`} />
        </label>
      )}
      <div>
        <label htmlFor={`${uid}-reason`} className="mb-1 block text-[12.5px] font-semibold text-ink">
          Reason (required)
        </label>
        <Textarea
          id={`${uid}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={onKey}
          placeholder={spec.placeholder ?? "e.g. Left the company, ticket #4821"}
          maxLength={REASON_MAX}
          ref={reasonRef}
          aria-invalid={local ? true : undefined}
          aria-describedby={`${uid}-help`}
        />
        <p id={`${uid}-help`} className="mt-1 flex items-start justify-between gap-3 text-[12px] leading-snug">
          <span className={local ? "text-danger-text" : "text-muted"}>{local ?? "Saved with the change in the audit log."}</span>
          <span className="flex-none tabular-nums text-muted">
            {reason.trim().length}/{REASON_MAX}
          </span>
        </p>
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] leading-snug text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy} className={TARGET}>
          Cancel
        </Button>
        {forceable && spec.forceLabel && (
          <Button type="button" variant="danger" onClick={() => void go(true)} disabled={!ready} className={TARGET}>
            {spec.forceLabel}
          </Button>
        )}
        <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} disabled={!ready} className={TARGET}>
          {busy ? "Working…" : spec.confirmLabel}
        </Button>
      </div>
    </form>
  );
}

/** Keeps the last spec around so the sheet's content does not vanish while it slides away. */
export function useLastSpec<S>(spec: S | null): S | null {
  const [last, setLast] = useState<S | null>(spec);
  if (spec !== null && spec !== last) setLast(spec);
  return spec ?? last;
}

export function ReasonSheet({ spec, onClose }: { spec: ReasonSpec | null; onClose: () => void }) {
  const shown = useLastSpec(spec);
  return (
    <SheetFrame id="ent-reason-sheet" open={spec !== null} onClose={onClose} title={shown?.title ?? ""}>
      {shown && <ReasonForm spec={shown} onClose={onClose} />}
    </SheetFrame>
  );
}

/**
 * ConfirmTypedSheet: ReasonSheet plus type-to-confirm, for IRREVERSIBLE actions (delete an account, remove a seat for
 * good). The person must type the thing's name exactly AND give a reason before the red button lights.
 */
export interface ConfirmTypedSpec extends ReasonSpec {
  /** The exact text to type. Compared after trimming; case matters. */
  expected: string;
  /** What `expected` is, shown after the prompt: "login", "workspace name". */
  expectedLabel?: string;
}

export function ConfirmTypedSheet({ spec, onClose }: { spec: ConfirmTypedSpec | null; onClose: () => void }) {
  const shown = useLastSpec(spec);
  return (
    <SheetFrame id="ent-confirm-typed-sheet" open={spec !== null} onClose={onClose} title={shown?.title ?? ""}>
      {shown && <ReasonForm spec={shown} onClose={onClose} typed={{ expected: shown.expected, label: shown.expectedLabel }} />}
    </SheetFrame>
  );
}

/* ── HistoryDrawer ───────────────────────────────────────────────────────────────── */

export interface HistoryRow {
  id: string | number;
  /** What changed ("seat.role"). */
  key: string;
  oldValue: string | null;
  newValue: string | null;
  /** ISO instant. */
  changedAt: string;
  actor?: string | null;
  reason?: string | null;
}

export type HistoryLoader = (limit: number) => Promise<{ ok: true; data: HistoryRow[] } | { ok: false; error: string }>;

const LIMIT = 50; // config-literal-ok: a page of history (the API clamps it)
const WIDTH = 520; // config-literal-ok: drawer width in px (the SideSheet default for a right drawer)
const CUT = 80; // config-literal-ok: characters of a value shown before it is cut
const WHEN: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false };

/** "ai.route.parse.model" reads better as "ai · route · parse · model". */
export function dottedKey(key: string): string {
  return key.split(".").join(" · ");
}

/** Values are short settings; long ones are cut so a row stays a row. */
export function shortValue(v: string | null): string {
  if (v === null || v === "") return "none";
  return v.length > CUT ? `${v.slice(0, CUT - 3)}…` : v;
}

type HistoryState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; rows: HistoryRow[] };

function HistoryBody({ load, formatKey, emptyTitle, emptyDescription, what }: { load: HistoryLoader; formatKey: (k: string) => string; emptyTitle: string; emptyDescription: string; what: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let cancelled = false;
    void loadRef.current(LIMIT).then((res) => {
      if (cancelled) return;
      setState(res.ok ? { status: "ok", rows: res.data } : { status: "error", message: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-soft">
        <Spinner /> Loading changes{"…"}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <ErrorState
        variant="inline"
        what={what}
        description={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (state.rows.length === 0) return <EmptyState variant="inline" title={emptyTitle} description={emptyDescription} />;
  return (
    <ol className="divide-y divide-line/60">
      {state.rows.map((h) => (
        <li key={h.id} className="py-3 text-[13px]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="break-all font-semibold text-ink">{formatKey(h.key)}</span>
            <time dateTime={h.changedAt} suppressHydrationWarning className="text-[12px] tabular-nums text-muted">
              {new Date(h.changedAt).toLocaleString("en-US", WHEN)}
            </time>
          </div>
          <p className="mt-0.5 break-words text-ink-soft">
            <span className="text-muted">{shortValue(h.oldValue)}</span> {"→"} <span className="font-medium text-ink">{shortValue(h.newValue)}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            by {h.actor ?? "system"}
            {h.reason ? ` · “${h.reason}”` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

export interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Reads the newest changes; the drawer calls it each time it opens (and on Retry). */
  load: HistoryLoader;
  returnFocusTo?: RefObject<HTMLElement | null>;
  id?: string;
  title?: string;
  description?: string;
  formatKey?: (key: string) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** For the error line: "Couldn't load {what}". */
  what?: string;
}

/** Who changed what and why, newest first: a drawer on a desktop, full screen on a phone. */
export function HistoryDrawer({
  open,
  onClose,
  load,
  returnFocusTo,
  id = "ent-history-drawer",
  title = "Change history",
  description = "Who changed what, and why.",
  formatKey = dottedKey,
  emptyTitle = "No changes yet.",
  emptyDescription = "Every change shows up here with who made it and why.",
  what = "the change history",
}: HistoryDrawerProps) {
  const narrow = useNarrow();
  return (
    <SideSheet id={id} side="right" mode={narrow ? "fullscreen" : "overlay"} width={WIDTH} open={open} onClose={onClose} title={title} description={description} returnFocusTo={returnFocusTo}>
      {open && <HistoryBody load={load} formatKey={formatKey} emptyTitle={emptyTitle} emptyDescription={emptyDescription} what={what} />}
    </SideSheet>
  );
}
