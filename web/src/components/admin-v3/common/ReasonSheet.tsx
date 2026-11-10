"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { BottomSheet, Button, Dialog, Input, Textarea } from "@kiwiply/ui";
import type { AdminOutcome } from "@/lib/admin-client";
import { useNarrow } from "./useNarrow";

/**
 * ReasonSheet: the confirm-with-reason step before a HIGH-risk admin action (ADMIN-E2E-PLAN section 3.3 / 9.1;
 * lifted from the AI page's ReasonDialog). A title, one sentence of consequence, ONE required field and
 * `[Confirm] [Cancel]`: a Dialog from `md` up, a BottomSheet on a phone. Turning something ON never comes here.
 *
 *   askReason({ title: "Turn off resume parsing?", body: "New resumes will not be parsed until it is back on.",
 *               confirmLabel: "Turn off", run: (reason) => send({ enabled: false, reason }) });
 *
 * The reason is 10 to 500 characters (the audit column is 1000 wide; the API enforces its own rule too - this is only
 * so the button is not lit for "x"). A refusal from the API stays inside the sheet, under the field, so the admin can
 * fix it without losing what they typed. `forceLabel` adds a second danger button for the one refusal that can be
 * overridden (the API answers `forceCode`, e.g. a provider that routes still use).
 */

export const REASON_MIN = 10; // characters; a reason shorter than a few words is not a reason
export const REASON_MAX = 500; // config-literal-ok: the audit reason column is 1000 chars wide; 500 is the plan's cap (section 3.3)

/** A thumb-sized button on a phone, the normal size from `sm` up. */
const TARGET = "min-h-11 sm:min-h-0";

export interface ReasonSpec {
  title: string;
  /** One sentence of consequence. */
  body: ReactNode;
  confirmLabel: string;
  /** `danger` (default, red) for deactivate / turn off / delete; `primary` for a HIGH action that is not destructive (an export). */
  tone?: "danger" | "primary";
  placeholder?: string;
  /** Offered after the API refuses with `forceCode`: sends the same change with `force = true`. */
  forceLabel?: string;
  forceCode?: string;
  run: (reason: string, force: boolean) => Promise<AdminOutcome>;
}

/** Why `reason` is not enough yet, or null when it is. */
export function reasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  if (n === 0) return null; // nothing typed yet: the button stays off, no scolding
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
  // Before any child effect moves focus into the sheet, remember who had it (BottomSheet restores to a ref, Dialog by itself).
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
  // Focus the first field once the sheet has recorded who opened it (autoFocus would run first and hide the opener,
  // so Esc could not hand focus back to the button that was pressed).
  useEffect(() => {
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
    const out = await spec.run(reason.trim(), force);
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
          placeholder={spec.placeholder ?? "e.g. Provider outage, ticket #4821"}
          maxLength={REASON_MAX}
          ref={reasonRef}
          aria-invalid={local ? true : undefined}
          aria-describedby={`${uid}-help`}
        />
        <p id={`${uid}-help`} className="mt-1 flex items-start justify-between gap-3 text-[12px] leading-snug">
          <span className={local ? "text-danger-text" : "text-v2-muted"}>{local ?? "Saved with the change in the audit log."}</span>
          <span className="flex-none tabular-nums text-v2-muted">
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

export default function ReasonSheet({ spec, onClose }: { spec: ReasonSpec | null; onClose: () => void }) {
  const shown = useLastSpec(spec);
  return (
    <SheetFrame id="admin-reason-sheet" open={spec !== null} onClose={onClose} title={shown?.title ?? ""}>
      {shown && <ReasonForm spec={shown} onClose={onClose} />}
    </SheetFrame>
  );
}
