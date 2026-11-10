"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "../primitives/cn";
import Meter from "../primitives/Meter";
import Popover from "../primitives/Popover";
import { ChevronDownIcon } from "../primitives/icons";
import Input from "../primitives/Input";
import Textarea from "../primitives/Textarea";
import { SENSITIVE_LABELS, scan } from "../sensitive-patterns";
import type { Hit } from "../sensitive-patterns";

/**
 * Talent-workspace primitives (X2.15; 38 s7): `ConsentChip`, `ReadinessRing`, `SensitiveTextField`.
 */

/* ── ConsentChip ─────────────────────────────────────────────────────────────────── */

export type ConsentLevel = "SUMMARY" | "FULL" | "NONE";

const CONSENT_LABEL: Record<ConsentLevel, string> = { SUMMARY: "Summary", FULL: "Full", NONE: "Not shared" };
const CONSENT_CLASS: Record<ConsentLevel, string> = {
  FULL: "border-transparent bg-accent-soft text-accent-deep",
  SUMMARY: "border-transparent bg-brown-soft text-brown-deep",
  NONE: "border-dashed border-line bg-transparent text-ink-soft",
};

export const ASK_COOLDOWN_LABEL = "Asked recently";

/** True while `askedAt` + `cooldownMs` is still in the future. */
export function inCooldown(askedAt: string | Date | null | undefined, cooldownMs: number, now: number = Date.now()): boolean {
  if (!askedAt) return false;
  const t = typeof askedAt === "string" ? Date.parse(askedAt) : askedAt.getTime();
  return Number.isFinite(t) && t + cooldownMs > now;
}

export interface ConsentChipProps {
  level: ConsentLevel;
  /** Shows the Ask affordance (only meaningful below FULL). */
  onAsk?: () => void;
  askedAt?: string | Date | null;
  /** How long after an ask another one is refused (the server decides; the chip only mirrors it). */
  cooldownMs?: number;
  /** Injectable clock for tests. */
  now?: number;
  /** Whose consent: "Priya" for the popover copy. */
  who?: string;
  className?: string;
}

export function ConsentChip({ level, onAsk, askedAt, cooldownMs = 0, now, who = "this consultant", className }: ConsentChipProps) {
  const label = CONSENT_LABEL[level];
  const chipClass = cn("inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold", CONSENT_CLASS[level], className);
  if (!onAsk || level === "FULL") {
    return (
      <span data-consent={level} className={chipClass}>
        {label}
      </span>
    );
  }
  const cooling = inCooldown(askedAt, cooldownMs, now);
  return (
    <Popover
      label={`Ask ${who} for more access`}
      trigger={(t) => (
        <button type="button" {...t.props} ref={t.ref} data-consent={level} className={cn(chipClass, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")}>
          {label}
          <ChevronDownIcon aria-hidden size={12} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="w-64 space-y-2 p-1 text-[13px]">
          <p className="text-ink-soft">{level === "NONE" ? `${who} has not shared this with you.` : `You see a summary. Ask ${who} to share the full detail.`}</p>
          <button
            type="button"
            disabled={cooling}
            onClick={() => {
              onAsk();
              close();
            }}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9"
          >
            {cooling ? ASK_COOLDOWN_LABEL : "Ask for access"}
          </button>
        </div>
      )}
    </Popover>
  );
}

/* ── ReadinessRing ───────────────────────────────────────────────────────────────── */

export interface ReadinessRingProps {
  /** 0 to 100. */
  value: number;
  label?: string;
  /** The one next step ("Add your last role"); shown beside the ring. */
  nextAction?: ReactNode;
  size?: number;
  className?: string;
}

export function ReadinessRing({ value, label = "Readiness", nextAction, size = 64, className }: ReadinessRingProps) {
  const pct = Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Meter variant="ring" value={pct} max={100} label={label} valueText={`${pct} percent`} size={size} neutral />
      {nextAction != null && (
        <p className="min-w-0 text-[13px] leading-snug text-ink-soft">
          <span className="block text-[11.5px] font-bold uppercase tracking-[.06em] text-muted">Next</span>
          {nextAction}
        </p>
      )}
    </div>
  );
}

/* ── SensitiveTextField ──────────────────────────────────────────────────────────── */

/** What the API's 422 says; the field shows it verbatim when the server refuses what the pre-check missed. */
export const SENSITIVE_422_MESSAGE = "This looks like it contains sensitive personal data. We never store it, so please remove it.";

/** The one-line warning for the findings of `scan`, or null when clean. */
export function sensitiveWarning(hits: Hit[]): string | null {
  if (hits.length === 0) return null;
  const kinds = [...new Set(hits.map((h) => SENSITIVE_LABELS[h.cls]))];
  return `This looks like ${kinds.join(" and ")}. We never store that, so please remove it.`;
}

interface SensitiveBase {
  value: string;
  onValueChange: (value: string) => void;
  /** The server's refusal (422) to show under the field. */
  serverError?: string | null;
  /** Called with the findings whenever the value changes (a form uses it to hold its own submit). */
  onHits?: (hits: Hit[]) => void;
  label: string;
  placeholder?: string;
  maxLength?: number;
  id?: string;
  className?: string;
}

export type SensitiveTextFieldProps = SensitiveBase & ({ multiline?: false; rows?: never } | { multiline: true; rows?: number });

export function SensitiveTextField(props: SensitiveTextFieldProps) {
  const { value, onValueChange, serverError, onHits, label, placeholder, maxLength, id, className } = props;
  const generated = useId();
  const uid = id ?? generated;
  const hits = scan(value);
  const warning = sensitiveWarning(hits);
  const message = serverError ?? warning;
  const common = {
    id: uid,
    value,
    placeholder,
    maxLength,
    "aria-label": label,
    "aria-invalid": message ? (true as const) : undefined,
    "aria-describedby": message ? `${uid}-msg` : undefined,
  };
  function change(next: string) {
    onValueChange(next);
    onHits?.(scan(next));
  }
  return (
    <div className={cn("space-y-1", className)}>
      {props.multiline ? (
        <Textarea {...common} rows={props.rows} onChange={(e) => change(e.target.value)} />
      ) : (
        <Input {...common} onChange={(e) => change(e.target.value)} />
      )}
      {message && (
        <p id={`${uid}-msg`} role="alert" className="text-[12.5px] leading-snug text-danger-text">
          {message}
        </p>
      )}
    </div>
  );
}
