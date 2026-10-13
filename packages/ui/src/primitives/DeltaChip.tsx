import { cn } from "./cn";

/**
 * DeltaChip - the "↑ 12%" chip on a KPI tile. The number is never typed in by hand: it is computed from a real
 * `value` and a real `previous` (the same metric over the previous window), and when `previous` is not a number there
 * is nothing to compare, so `deltaOf` returns null and no chip is drawn (ADMIN-E2E-PLAN D-8: a tile without a
 * comparison shows no delta, not a made-up one).
 *
 *   const d = deltaOf(users, lastMonthUsers);              // { dir: "up", text: "12%" } | null
 *   {d && <DeltaChip delta={d} lowerIsBetter={false} />}
 */
export type DeltaDir = "up" | "down" | "flat";
export interface Delta {
  dir: DeltaDir;
  /** "12%", "3.5 pts" or "+8" (when the previous value was 0): no sign, the arrow carries it. */
  text: string;
}
export interface DeltaOptions {
  /** `relative` (default): percent change. `points`: the plain difference, for values that are already percentages. */
  mode?: "relative" | "points";
}

const PERCENT = 100; // config-literal-ok: percent conversion, not a tunable
const PERCENT_CAP = 999; // config-literal-ok: display cap, beyond this a tile reads "999%+"
const POINTS_EPSILON = 0.05; // half of the one-decimal rounding step: smaller moves read as "no change"

function trim(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.0+$/, "");
}

/** Change from `previous` to `value`, or null when either is missing or not finite. Pure. */
export function deltaOf(value: number | null | undefined, previous: number | null | undefined, opts: DeltaOptions = {}): Delta | null {
  if (typeof value !== "number" || typeof previous !== "number" || !Number.isFinite(value) || !Number.isFinite(previous)) return null;
  const diff = value - previous;
  if (opts.mode === "points") {
    if (Math.abs(diff) < POINTS_EPSILON) return { dir: "flat", text: "0 pts" };
    return { dir: diff > 0 ? "up" : "down", text: `${trim(Math.abs(diff), 1)} pts` };
  }
  if (diff === 0) return { dir: "flat", text: "0%" };
  // A percent of zero is undefined: say how many were added instead of inventing "infinity".
  if (previous === 0) return { dir: diff > 0 ? "up" : "down", text: `+${trim(Math.abs(diff), 1)}` };
  const pct = (Math.abs(diff) / Math.abs(previous)) * PERCENT;
  if (pct < POINTS_EPSILON) return { dir: "flat", text: "0%" };
  if (pct > PERCENT_CAP) return { dir: diff > 0 ? "up" : "down", text: `${PERCENT_CAP}%+` };
  return { dir: diff > 0 ? "up" : "down", text: `${trim(pct, pct >= 10 ? 0 : 1)}%` };
}

export interface DeltaChipProps {
  delta: Delta;
  /** True for metrics where down is good (failed logins, error rate, churn). Flat is always neutral. */
  lowerIsBetter?: boolean;
  className?: string;
}

const ARROW: Record<DeltaDir, string> = { up: "↑", down: "↓", flat: "→" };
const WORD: Record<DeltaDir, string> = { up: "Up", down: "Down", flat: "No change" };

export default function DeltaChip({ delta, lowerIsBetter = false, className }: DeltaChipProps) {
  const good = delta.dir === "flat" ? null : (delta.dir === "up") !== lowerIsBetter;
  return (
    <span
      data-delta={delta.dir}
      data-good={good === null ? undefined : String(good)}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-bold leading-none",
        good === null ? "bg-paper-2 text-ink-soft" : good ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-coral-soft text-v2-coral-ink",
        className,
      )}
    >
      <span aria-hidden>{ARROW[delta.dir]}</span>
      <span className="sr-only">{WORD[delta.dir]} </span>
      {delta.text}
    </span>
  );
}
