import type { ReactNode } from "react";
import { cn } from "../primitives/cn";
import Tooltip from "../primitives/Tooltip";
import Meter from "../primitives/Meter";

/**
 * Money and allowance pieces (X2.15; 28 s0): `MoneyText`, `PriceDelta`, `FeatureChip`, `AllowanceMeter`.
 * Money arrives as MINOR units (integer cents) plus an ISO currency and is formatted with `Intl.NumberFormat`; it is
 * never a float and the web never adds two prices (the backend quotes).
 */

const DEFAULT_LOCALE = "en-US";

/** Divides minor units by the currency's own minor digits (USD 2, JPY 0) using integer math on the formatter's digits. */
export function formatMinor(minor: number, currency: string, locale: string = DEFAULT_LOCALE): string | null {
  if (!Number.isSafeInteger(minor)) return null; // a float is a bug upstream: show a dash, never a rounded guess
  const fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  const factor = 10 ** digits;
  const sign = minor < 0 ? -1 : 1;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / factor);
  const frac = abs - whole * factor;
  // Format whole and fraction as a decimal string so no binary float ever carries the amount.
  const text = digits === 0 ? String(whole) : `${whole}.${String(frac).padStart(digits, "0")}`;
  return fmt.format((sign < 0 ? `-${text}` : text) as unknown as number);
}

export type MoneyTone = "default" | "positive" | "negative" | "muted";
/** Band mode (D's RateCell): non-finance viewers see a label instead of the amount. */
export type MoneyBand = "LOW" | "OK" | "GOOD";

const BAND_LABEL: Record<MoneyBand, string> = { LOW: "Low", OK: "OK", GOOD: "Good" };
const BAND_CLASS: Record<MoneyBand, string> = {
  LOW: "bg-brown-soft text-brown-deep",
  OK: "bg-paper-2 text-ink-soft",
  GOOD: "bg-accent-soft text-accent-deep",
};
const TONE_CLASS: Record<MoneyTone, string> = {
  default: "text-ink",
  positive: "text-accent-deep",
  negative: "text-danger-text",
  muted: "text-muted",
};

export interface MoneyTextProps {
  /** Integer minor units (1999 = $19.99). */
  minor: number;
  currency: string;
  locale?: string;
  tone?: MoneyTone;
  /** A superseded price: line-through. */
  strike?: boolean;
  /** Band mode: renders ONLY the band label; the amount is not in the DOM at all. */
  band?: MoneyBand;
  className?: string;
}

export function MoneyText({ minor, currency, locale, tone = "default", strike, band, className }: MoneyTextProps) {
  if (band) {
    return (
      <span data-money-band={band} className={cn("inline-flex items-center rounded-full px-2 py-[2px] text-[11.5px] font-semibold", BAND_CLASS[band], className)}>
        {BAND_LABEL[band]}
      </span>
    );
  }
  const text = formatMinor(minor, currency, locale) ?? "—";
  return <span className={cn("tabular-nums", TONE_CLASS[tone], strike && "line-through opacity-70", className)}>{text}</span>;
}

export interface PriceDeltaProps {
  /** Signed integer minor units: +1997 renders "+$19.97/mo". 0 renders "No change". */
  minor: number;
  currency: string;
  /** The cadence suffix without the slash ("mo", "qtr"). Default "mo". */
  per?: string;
  locale?: string;
  className?: string;
}

export function PriceDelta({ minor, currency, per = "mo", locale, className }: PriceDeltaProps) {
  if (minor === 0) return <span className={cn("text-[13px] text-muted", className)}>No change</span>;
  const amount = formatMinor(Math.abs(minor), currency, locale) ?? "—";
  const up = minor > 0;
  return (
    <span data-price-delta={up ? "up" : "down"} className={cn("tabular-nums text-[13px] font-semibold", up ? "text-ink" : "text-accent-deep", className)}>
      {up ? "+" : "−"}
      {amount}/{per}
    </span>
  );
}

export type FeatureChipState = "active" | "pending-removal" | "pending-add";

const FEATURE_CLASS: Record<FeatureChipState, string> = {
  active: "border-accent bg-accent-soft text-accent-deep",
  "pending-removal": "border-dashed border-brown bg-transparent text-brown-deep",
  "pending-add": "border-dotted border-accent-deep bg-transparent text-accent-deep",
};
const FEATURE_NOTE: Record<FeatureChipState, string> = { active: "", "pending-removal": "Removed at period end", "pending-add": "Added at period end" };

export interface FeatureChipProps {
  name: string;
  state?: FeatureChipState;
  /** "40 a month": shown in the tooltip (and read by screen readers). */
  allowance?: ReactNode;
  className?: string;
}

export function FeatureChip({ name, state = "active", allowance, className }: FeatureChipProps) {
  const note = FEATURE_NOTE[state];
  const chip = (
    <span
      data-feature-chip={state}
      tabIndex={allowance != null ? 0 : undefined}
      aria-label={allowance != null ? `${name}${note ? `, ${note.toLowerCase()}` : ""}` : undefined}
      className={cn("inline-flex items-center rounded-full border px-2.5 py-[3px] text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", FEATURE_CLASS[state], className)}
    >
      {name}
    </span>
  );
  if (allowance == null) return chip;
  return (
    <Tooltip
      content={
        <>
          {allowance}
          {note ? ` · ${note}` : ""}
        </>
      }
    >
      {chip}
    </Tooltip>
  );
}

export interface AllowanceMeterProps {
  used: number;
  limit: number;
  label: string;
  /** When the allowance resets: ISO date or Date. */
  resetsAt?: string | Date | null;
  /** Time zone for the reset date (default UTC so a date never shifts by viewer). */
  timeZone?: string;
  className?: string;
}

/** "27 of 40 left · resets Dec 5". */
export function allowanceText(used: number, limit: number, resetsAt?: string | Date | null, timeZone = "UTC"): string {
  const left = Math.max(0, limit - used);
  let text = `${left} of ${limit} left`;
  if (resetsAt) {
    const d = typeof resetsAt === "string" ? new Date(resetsAt) : resetsAt;
    if (!Number.isNaN(d.getTime())) text += ` · resets ${d.toLocaleDateString(DEFAULT_LOCALE, { month: "short", day: "numeric", timeZone })}`;
  }
  return text;
}

export function AllowanceMeter({ used, limit, label, resetsAt, timeZone, className }: AllowanceMeterProps) {
  const text = allowanceText(used, limit, resetsAt, timeZone);
  return (
    <div className={cn("space-y-1.5", className)}>
      <Meter value={used} max={limit} label={label} valueText={text} />
      <p className="text-[12px] tabular-nums text-muted">{text}</p>
    </div>
  );
}
