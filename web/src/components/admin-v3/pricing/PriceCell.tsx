"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, Input, MoneyText, XCircleIcon, cn } from "@kiwiply/ui";
import { adminFetch } from "@/lib/admin-client";
import type { AdminOutcome } from "@/lib/admin-client";
import { bpText, minorToInput, parseMinorInput, type Levers, type MarginAnswer, type PriceView } from "@/lib/admin-plans";

const FLASH_MS = 1600; // config-literal-ok: how long the saved tick stays
const MARGIN_DEBOUNCE_MS = 300; // config-literal-ok: the live margin tick asks the guard 300 ms after the last keystroke (04 section 3)

export interface MarginTickProps {
  /** Basis points, as the server computed them. */
  marginBp: number | null | undefined;
  ok: boolean | null | undefined;
  levers?: Levers | null;
  currency: string;
  id?: string;
}

/** The ✓ / ✗ next to a price: the guard's margin and, when it fails, the lever text. Every figure is a DTO field. */
export function MarginTick({ marginBp, ok, levers, currency, id }: MarginTickProps) {
  if (marginBp == null || ok == null) return <span id={id} className="text-[12px] text-v2-muted">no margin yet</span>;
  return (
    <span id={id} aria-live="polite" className={cn("inline-flex flex-wrap items-center gap-x-1.5 text-[12px] font-semibold tabular-nums", ok ? "text-accent-deep" : "text-danger-text")}>
      {ok ? <CheckIcon size={14} aria-hidden /> : <XCircleIcon size={14} aria-hidden />}
      <span>
        {bpText(marginBp)}
        <span className="sr-only">{ok ? " margin, at or above the floor" : " margin, below the floor"}</span>
      </span>
      {!ok && levers?.minPriceMinor != null && (
        <span className="font-medium">
          · min <MoneyText minor={levers.minPriceMinor} currency={currency} />
        </span>
      )}
      {!ok && levers?.maxAiBudgetCents != null && (
        <span className="font-medium">
          · or AI budget ≤ <MoneyText minor={levers.maxAiBudgetCents} currency={currency} />
        </span>
      )}
    </span>
  );
}

export interface PriceCellProps {
  /** Accessible name: "Pro monthly price". */
  label: string;
  currency: string;
  interval: string;
  audience: string;
  /** The guard's row kind: BASE for a subscription base, OPTIONAL for an add-on, SERVICE for a seat service, ONE_TIME for a setup fee. */
  kind: "BASE" | "OPTIONAL" | "SERVICE" | "ONE_TIME";
  /** The worst-case AI cost of one unit over the WHOLE period, in cents (a DTO field). null = the DTO does not say for this interval, so there is no live tick (the preview still checks it). */
  aiBudgetCents: number | null;
  price: PriceView | null;
  disabled?: boolean;
  /** Why the box is disabled (shown under it). */
  disabledReason?: string;
  onCommit: (amountMinor: number) => Promise<AdminOutcome>;
}

/**
 * A price box: type an amount, see the margin tick turn red/green as you type (debounced `GET /api/admin/catalog/margin`), and
 * leave the box to write a DRAFT price row. A published row is never edited: a changed amount is a new row (ADR-013).
 */
export default function PriceCell({ label, currency, interval, audience, kind, aiBudgetCents, price, disabled, disabledReason, onCommit }: PriceCellProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [live, setLive] = useState<MarginAnswer | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const seq = useRef(0);
  const skipBlur = useRef(false);
  const saved = minorToInput(price?.amountMinor, currency);
  const typed = draft === null ? null : parseMinorInput(draft, currency);

  useEffect(() => {
    if (typed === null || typed === price?.amountMinor || aiBudgetCents === null) {
      seq.current += 1;
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ kind, audience, interval, amountMinor: String(typed), aiBudgetCents: String(aiBudgetCents), currency });
      const res = await adminFetch<MarginAnswer>("GET", `/catalog/margin?${qs}`);
      if (mine === seq.current && res.ok) setLive(res.data);
    }, MARGIN_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [typed, price?.amountMinor, kind, audience, interval, aiBudgetCents, currency]);

  async function commit() {
    if (draft === null) return;
    if (draft.trim() === saved) {
      setDraft(null);
      return;
    }
    if (typed === null) {
      setProblem("Type an amount like 19.99.");
      return;
    }
    setProblem(null);
    const out = await onCommit(typed);
    if (out.ok) {
      setDraft(null);
      setLive(null);
      setFlash(true);
      setTimeout(() => setFlash(false), FLASH_MS);
    } else {
      setProblem(out.error);
    }
  }

  // while an amount is being typed, the tick is the guard's answer for THAT amount; otherwise the row's own margin from the version DTO
  const showingLive = draft !== null && typed !== null && typed !== price?.amountMinor && live !== null;
  const tick = showingLive ? (
    <MarginTick marginBp={live.worst.marginBp} ok={live.ok} levers={live.levers} currency={currency} id={`${id}-m`} />
  ) : (
    <MarginTick marginBp={price?.marginBp} ok={price?.ok} currency={currency} id={`${id}-m`} />
  );

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          aria-label={label}
          aria-describedby={`${id}-m`}
          aria-invalid={problem ? true : undefined}
          disabled={disabled}
          value={draft ?? saved}
          placeholder={disabled ? "—" : "0.00"}
          onChange={(e) => {
            setDraft(e.target.value);
            setProblem(null);
          }}
          onBlur={() => {
            if (!skipBlur.current) void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              skipBlur.current = true;
              void commit().finally(() => {
                skipBlur.current = false;
              });
            } else if (e.key === "Escape") {
              setDraft(null);
              setProblem(null);
              setLive(null);
            }
          }}
          className="min-w-0 flex-1 tabular-nums"
        />
        {flash && <CheckIcon size={16} aria-label="Saved" role="img" className="flex-none text-accent-deep" />}
      </div>
      <div className="mt-1 min-h-[18px]">{price || showingLive ? tick : null}</div>
      {aiBudgetCents === null && !disabled && <p className="text-[11.5px] text-v2-muted">No live margin for this interval; the preview checks it.</p>}
      {price?.source === "DRAFT" && <p className="text-[11.5px] text-v2-muted">draft price, goes live when you publish</p>}
      {price?.derived && <p className="text-[11.5px] text-v2-muted">derived from the monthly price</p>}
      {disabled && disabledReason && <p className="text-[11.5px] text-v2-muted">{disabledReason}</p>}
      {problem && <p role="alert" className="mt-1 text-[12.5px] leading-snug text-danger-text">{problem}</p>}
    </div>
  );
}
