import { cn } from "../primitives/cn";

/**
 * StatePill - ONE status chip for every enterprise domain (X2.15; replaces C's `StatusPill` and D's `PipelineBadge`).
 * A domain registers its state -> tone map once (`registerStateMap("billing", {...})`); the pill looks the state up.
 * Tone maps are data: the billing map is registered here (28 s0), the pipeline map is registered by X8.10 from the
 * `PipelineTransitions` state list.
 *
 *   <StatePill domain="billing" state="PAST_DUE" />        // red "Past due"
 *
 * Tones: green, amber, red, purple, blue, grey (+ two outlined billing tones). Inside a tenant page the colours are the boards'
 * pill tokens (`--ent-pill-*`, theme-tenant.css): a soft tint, bold coloured text, no border.
 *
 * An unknown state (or domain) renders the neutral grey tone and warns once in development; it never throws.
 * Registering two maps under one domain key throws at module load, so a copy-paste can not silently win.
 */
export type StateTone = "green" | "amber" | "red" | "purple" | "blue" | "grey" | "amber-outline" | "grey-outline";

export type StateMap = Readonly<Record<string, StateTone>>;

const REGISTRY = new Map<string, StateMap>();
const WARNED = new Set<string>();

export function registerStateMap(domain: string, map: StateMap): void {
  if (REGISTRY.has(domain)) throw new Error(`StatePill: a state map is already registered for domain "${domain}"`);
  REGISTRY.set(domain, Object.freeze({ ...map }));
}

export function hasStateMap(domain: string): boolean {
  return REGISTRY.has(domain);
}

export function stateMapOf(domain: string): StateMap | undefined {
  return REGISTRY.get(domain);
}

/** The tone of `state` in `domain`; "grey" (the neutral tone) when either is unknown. */
export function toneOf(domain: string, state: string): StateTone {
  const tone = REGISTRY.get(domain)?.[state];
  if (tone) return tone;
  const key = `${domain}:${state}`;
  if (!WARNED.has(key)) {
    WARNED.add(key);
    if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      console.warn(`StatePill: unknown state "${state}" in domain "${domain}" (rendered neutral)`);
    }
  }
  return "grey";
}

/** "CANCEL_AT_PERIOD_END" -> "Cancel at period end". */
export function stateLabel(state: string): string {
  const words = state.toLowerCase().split(/[_\s]+/).filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** 28 s0: ACTIVE green, PENDING amber, SUSPENDED grey, CANCEL_AT_PERIOD_END amber-outline, ENDED grey, PAST_DUE red, NONE grey. */
export const BILLING_STATE_MAP: StateMap = {
  ACTIVE: "green",
  PENDING: "amber",
  SUSPENDED: "grey",
  CANCEL_AT_PERIOD_END: "amber-outline",
  ENDED: "grey",
  PAST_DUE: "red",
  NONE: "grey",
};
registerStateMap("billing", BILLING_STATE_MAP);

const TONE_CLASS: Record<StateTone, string> = {
  green: "bg-accent-soft text-accent-deep border-transparent",
  amber: "bg-brown-soft text-brown-deep border-transparent",
  red: "bg-danger/10 text-danger-text border-transparent",
  purple: "bg-v2-violet-soft text-v2-violet-ink border-transparent",
  blue: "bg-v2-blue-soft text-v2-blue-ink border-transparent",
  grey: "bg-paper-2 text-ink-soft border-transparent",
  "amber-outline": "bg-transparent text-brown-deep border-brown",
  "grey-outline": "bg-transparent text-ink-soft border-line",
};

export interface StatePillProps {
  domain: string;
  state: string;
  /** Overrides the label derived from the state ("Cancels at period end"). */
  label?: string;
  className?: string;
}

export default function StatePill({ domain, state, label, className }: StatePillProps) {
  const tone = toneOf(domain, state);
  return (
    <span
      data-state-pill={domain}
      data-tone={tone}
      className={cn("inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-[3px] text-[11.5px] font-semibold leading-none", TONE_CLASS[tone], className)}
    >
      {label ?? stateLabel(state)}
    </span>
  );
}
