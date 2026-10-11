import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BuildingIcon, SparkBurst, cn } from "@kiwiply/ui";
import Handwritten from "@/components/marketing/Handwritten";
import { Sparkline, TONE, type Tone } from "@/components/app-v2/common";
import { areaPath, ribbonPath, type Pt } from "@/components/app-v2/common/chart-utils";

/**
 * Local copies of the spec section 2 shared primitives (same names/props) for the C2 org pages.
 * TEMP: the QA phase dedupes these into `app-v2/common` / C1's `common-local`.
 * Server-safe (no hooks); the interactive ones live in `./interactive.tsx`.
 */

/* ── PageHero ─────────────────────────────────────────────────────────────────────────── */
export function PageHero({
  title,
  icon,
  subtitle,
  note,
}: {
  title: string;
  icon: ReactNode;
  subtitle: string;
  note: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[20px] bg-[linear-gradient(100deg,#E9F1FF_0%,#F2F7FF_48%,#E6F7EE_100%)] px-5 pb-6 pt-5 shadow-v2-card sm:px-7 lg:min-h-[168px] lg:pr-[360px]">
      {/* pastel blobs */}
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-v2-blue/10 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute right-24 top-0 h-36 w-36 rounded-full bg-v2-lime/20 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-10 right-0 h-40 w-52 rounded-full bg-v2-teal/15 blur-2xl" />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-xl bg-white/70 px-3 py-1.5 text-[13px] font-semibold text-v2-navy shadow-[0_1px_0_rgba(27,31,94,.05)]">
          <BuildingIcon className="h-4 w-4 text-v2-navy" />
          Acme Corp
          <span className="font-semibold text-v2-blue">Enterprise</span>
        </span>
        <h1 className="mt-3 flex items-center gap-3 text-[28px] font-extrabold leading-none text-v2-navy sm:text-[32px]">
          {title}
          <span className="text-v2-blue [&>svg]:h-7 [&>svg]:w-7">{icon}</span>
        </h1>
        <p className="mt-2 max-w-[640px] text-[14px] leading-snug text-v2-ink-soft sm:text-[15px]">{subtitle}</p>
      </div>

      {/* art: banner + spark doodles + handwritten note (desktop only) */}
      <div aria-hidden className="pointer-events-none absolute bottom-0 right-4 hidden h-full w-[340px] lg:block">
        <Image
          src="/v2/app/org-team-banner.png"
          alt=""
          width={260}
          height={151}
          className="absolute bottom-0 right-0 h-auto w-[270px]"
        />
        <SparkBurst className="absolute left-2 top-4 h-9 w-9 text-v2-green" />
        <SparkBurst className="absolute right-3 top-5 h-8 w-8 -scale-x-100 text-v2-green" />
        <Handwritten ink="navy" className="absolute left-0 top-3 w-[170px] -rotate-6 text-[22px] leading-[1.05]">
          {note}
        </Handwritten>
      </div>
      {/* mobile/tablet: note under the subtitle */}
      <Handwritten ink="navy" className="relative mt-2 text-[19px] lg:hidden">
        {note}
      </Handwritten>
    </section>
  );
}

/* ── StatTile ─────────────────────────────────────────────────────────────────────────── */
const TILE_BG: Partial<Record<Tone, string>> = {
  blue: "bg-[linear-gradient(135deg,#EEF4FF,#F7FAFF)]",
  green: "bg-[linear-gradient(135deg,#E8F8EE,#F5FCF8)]",
  amber: "bg-[linear-gradient(135deg,#FFF3DD,#FFFAF0)]",
  violet: "bg-[linear-gradient(135deg,#F0ECFF,#F8F6FF)]",
  teal: "bg-[linear-gradient(135deg,#E3F6F4,#F3FBFA)]",
  coral: "bg-[linear-gradient(135deg,#FFECEC,#FFF7F7)]",
};

export function StatTile({
  icon,
  value,
  label,
  sublabel,
  delta,
  sparkline,
  tone,
  chip,
  compact,
}: {
  /** Narrow tile (5-up rows): the sparkline sits under the value, beside the delta chip. */
  compact?: boolean;
  icon: ReactNode;
  value: ReactNode;
  label: string;
  /** Secondary line (e.g. "Total actions"). */
  sublabel?: string;
  delta?: { value: string; up: boolean };
  sparkline?: number[];
  tone: Tone;
  /** Inline chip beside the value (e.g. "Active"). */
  chip?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className={cn("flex min-w-0 items-center gap-3.5 rounded-2xl p-4 sm:p-[18px]", TILE_BG[tone] ?? t.soft)}>
      <span className={cn("flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-white shadow-[0_2px_8px_rgba(27,31,94,.06)] [&>svg]:h-[22px] [&>svg]:w-[22px]", t.ink)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[24px] font-extrabold leading-none text-v2-navy sm:text-[26px]">{value}</span>
          {chip}
        </div>
        <div className="mt-1 text-[13px] font-medium text-v2-ink-soft">{label}</div>
        {sublabel && <div className="text-[12px] text-v2-muted">{sublabel}</div>}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold",
                delta.up ? "bg-v2-green-soft text-[#168A2E]" : "bg-v2-coral-soft text-[#D13A3A]",
              )}
            >
              <span aria-hidden>{delta.up ? "↑" : "↓"}</span>
              {delta.value}
            </span>
          )}
          {compact && sparkline && <Sparkline points={sparkline} tone={tone} width={64} height={24} />}
        </div>
      </div>
      {!compact && sparkline && <Sparkline points={sparkline} tone={tone} className="hidden lg:block" />}
    </div>
  );
}

/* ── Brand tiles ───────────────────────────────────────────────────────────────────────── */
const BRAND_TILE: Record<string, string> = {
  LinkedIn: "bg-[#0A66C2] text-white",
  Indeed: "bg-[#2557A7] text-white",
  Greenhouse: "bg-[#24A47F] text-white",
  Workday: "bg-[#F5A623] text-white",
  Gmail: "bg-[#EA4335] text-white",
  Outlook: "bg-[#0F78D4] text-white",
  Slack: "bg-[#4A154B] text-white",
  "Google Calendar": "bg-[#4285F4] text-white",
  "Google Drive": "bg-[#0F9D58] text-white",
};

/** Lettered tile in a third-party brand colour (spec: third-party marks are initial tiles). */
export function BrandTile({ name, size = 40 }: { name: string; size?: number }) {
  const label = name === "Google Calendar" ? "31" : name === "Google Drive" ? "D" : name[0];
  return (
    <span
      aria-hidden
      className={cn("inline-flex flex-none items-center justify-center rounded-xl font-extrabold", BRAND_TILE[name] ?? "bg-v2-navy text-white")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {label}
    </span>
  );
}

/* ── SectionCard ──────────────────────────────────────────────────────────────────────── */
export function SectionCard({
  title,
  action,
  children,
  className,
  headerExtra,
  bodyClassName,
}: {
  title?: ReactNode;
  action?: { label: string; href: string };
  children: ReactNode;
  className?: string;
  /** Extra header content right of the title (buttons, selects). Replaces `action`. */
  headerExtra?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl bg-white p-4 shadow-v2-card sm:p-5", className)}>
      {(title || action || headerExtra) && (
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {title && <h2 className="text-[16px] font-bold leading-tight tracking-normal text-v2-navy">{title}</h2>}
          {headerExtra}
          {!headerExtra && action && (
            <Link href={action.href} className="text-[13px] font-semibold text-v2-blue hover:underline">
              {action.label}
            </Link>
          )}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ── Legend (dots) ────────────────────────────────────────────────────────────────────── */
export function LegendDots({ series, className }: { series: { label: string; tone: Tone }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-v2-ink-soft", className)}>
      {series.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", TONE[s.tone].solid)} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/* ── LineChart ────────────────────────────────────────────────────────────────────────── */
export function LineChart({
  series,
  xLabels,
  yLabels,
  height = 190,
  endLabels,
}: {
  /** `points` are values on the same scale as the y axis (`yMin`..`yMax`). */
  series: { label: string; tone: Tone; points: number[] }[];
  xLabels: string[];
  /** Axis labels, bottom to top, evenly spaced. */
  yLabels: string[];
  height?: number;
  /** Chip shown at the end of each series (same order as `series`). */
  endLabels?: string[];
}) {
  const n = series[0]?.points.length ?? 0;
  // x spans 5%..95% of the plot so the end dots / chips are never clipped.
  const xs = Array.from({ length: n }, (_, i) => (n < 2 ? 50 : 5 + (i * 90) / (n - 1)));
  return (
    <div>
      <LegendDots series={series} className="mb-3" />
      <div className="flex gap-2">
        <div className="relative w-8 flex-none text-right text-[11px] text-v2-muted" style={{ height }}>
          {yLabels.map((l, i) => (
            <span key={l} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${100 - (i / (yLabels.length - 1)) * 100}%` }}>
              {l}
            </span>
          ))}
        </div>
        <div className={cn("min-w-0 flex-1", endLabels && "pr-11")}>
          <div className="relative" style={{ height }}>
            {yLabels.map((l, i) => (
              <span key={l} aria-hidden className="absolute inset-x-0 border-t border-dashed border-[#E6EAF3]" style={{ top: `${100 - (i / (yLabels.length - 1)) * 100}%` }} />
            ))}
            {series.map((s, si) => {
              const pts: Pt[] = s.points.map((v, i) => ({ x: xs[i], y: 100 - v }));
              const ys = pts.map((p) => p.y);
              const c = TONE[s.tone].color;
              return (
                <div key={s.label} className="absolute inset-0" style={{ ["--tone" as string]: c }}>
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(to bottom, color-mix(in srgb, var(--tone) 16%, transparent), transparent 85%)",
                      clipPath: areaPath(pts),
                    }}
                  />
                  <span aria-hidden className="absolute inset-0" style={{ background: "var(--tone)", clipPath: ribbonPath(pts, 1.8) }} />
                  {ys.map((y, i) => (
                    <span
                      key={i}
                      aria-hidden
                      title={`${s.label}: ${s.points[i]}%`}
                      className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_var(--tone)]"
                      style={{ left: `${xs[i]}%`, top: `${y}%`, background: "var(--tone)" }}
                    />
                  ))}
                  {endLabels?.[si] && (
                    <span
                      className="absolute -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                      style={{ left: `calc(${xs[n - 1]}% + 8px)`, top: `${ys[n - 1]}%`, background: "var(--tone)" }}
                    >
                      {endLabels[si]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="relative mt-2 h-4">
            {xLabels.map((l, i) => (
              <span key={l} className="absolute -translate-x-1/2 text-[11.5px] text-v2-muted" style={{ left: `${xs[i]}%` }}>
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Funnel (stacked trapezoids) ──────────────────────────────────────────────────────── */
export function Funnel({ stages }: { stages: { label: string; value: number; tone: Tone }[] }) {
  const max = stages[0]?.value || 1;
  // Visual width is eased (a true 124 -> 12 funnel would be a needle); the legend carries the true %.
  const widths = stages.map((s) => 30 + 70 * Math.pow(s.value / max, 0.6));
  const bottoms = widths.map((w, i) => (i < widths.length - 1 ? widths[i + 1] : Math.max(w - 14, 18)));
  return (
    <div className="mx-auto flex w-full max-w-[210px] flex-col gap-[3px]" role="img" aria-label={`Funnel: ${stages.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
      {stages.map((s, i) => {
        const t = widths[i];
        const b = bottoms[i];
        return (
          <div
            key={s.label}
            className="flex h-[46px] items-center justify-center text-[15px] font-extrabold text-white"
            style={{
              background: TONE[s.tone].color,
              clipPath: `polygon(${(100 - t) / 2}% 0, ${(100 + t) / 2}% 0, ${(100 + b) / 2}% 100%, ${(100 - b) / 2}% 100%)`,
            }}
          >
            {s.value}
          </div>
        );
      })}
    </div>
  );
}
