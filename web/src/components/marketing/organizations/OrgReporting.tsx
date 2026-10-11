import type { ComponentType, CSSProperties } from "react";
import { BriefcaseIcon, CalendarIcon, ChevronDownIcon, ShieldCheckIcon, TrophyIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, HEADLINE_GREEN } from "./family";
import Eyebrow from "../Eyebrow";
import { Container } from "./parts";
import { OUTCOMES, REPORT_RANGE, REPORT_TILES, VELOCITY } from "./placeholder-data";

/** Block 5: "Reporting & Insights". Pure HTML/CSS charts; every value comes from `placeholder-data.ts`. */

const TILE_ICONS: Record<string, ComponentType<IconProps>> = {
  Applications: BriefcaseIcon,
  Interviews: CalendarIcon,
  Offers: ShieldCheckIcon,
  Placements: TrophyIcon,
};

/** Delta colour per tile, as on the board (green, blue, lime, green). */
const DELTA: Record<string, string> = {
  Applications: "text-[#14702A]",
  Interviews: "text-[#1349B5]",
  Offers: "text-[#3E7A0A]",
  Placements: "text-[#14702A]",
};

/** Points of the trend line as CSS percentages (x across, y down from the top of the plot). */
function linePoints(): { x: number; y: number }[] {
  const n = VELOCITY.line.length;
  return VELOCITY.line.map((v, i) => ({ x: (i / (n - 1)) * 100, y: 100 - (v / VELOCITY.max) * 100 }));
}

function polygon(points: string[]): CSSProperties {
  return { clipPath: `polygon(${points.join(", ")})` };
}

function VelocityChart() {
  const pts = linePoints();
  const fwd = pts.map((p) => `${p.x}% ${p.y}%`);
  const band = [...fwd, ...[...pts].reverse().map((p) => `${p.x}% ${Math.min(p.y + 3, 100)}%`)];
  const area = [...fwd, "100% 100%", "0% 100%"];
  const barMax = Math.max(...VELOCITY.bars);
  return (
    <div className="rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-4 shadow-v2-card md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-bold text-v2-navy">{VELOCITY.title}</p>
        <ul className="flex items-center gap-3 text-[11px] text-v2-muted">
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-v2-blue" />
            {VELOCITY.legend[0]}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#8FBBF5]" />
            {VELOCITY.legend[1]}
          </li>
        </ul>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="flex h-40 flex-none flex-col justify-between pb-0.5 text-[10px] text-v2-muted md:h-44">
          {VELOCITY.axis.map((a) => (
            <span key={a}>{a}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-40 border-b border-v2-line md:h-44">
            {/* gridlines */}
            <span className="absolute inset-x-0 top-0 border-t border-v2-line/60" />
            <span className="absolute inset-x-0 top-1/3 border-t border-v2-line/60" />
            <span className="absolute inset-x-0 top-2/3 border-t border-v2-line/60" />
            {/* weekly bars */}
            <div className="absolute inset-x-0 bottom-0 top-0 flex items-end gap-[3px]">
              {VELOCITY.bars.map((b, i) => (
                <span
                  key={i}
                  className={cn("flex-1 rounded-t-[2px]", i % 3 === 0 ? "bg-[#8FBBF5]" : "bg-[#BCD6F8]")}
                  style={{ height: `${(b / barMax) * 36}%` }}
                />
              ))}
            </div>
            {/* trend line: soft area under it, then the line itself */}
            <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-v2-blue/15 to-transparent" style={polygon(area)} />
            <span aria-hidden className="absolute inset-0 bg-v2-blue" style={polygon(band)} />
            {pts.map((p, i) => (
              <span
                key={i}
                aria-hidden
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-v2-blue"
                style={{ left: `${p.x}%`, top: `${p.y + 1.5}%` }}
              />
            ))}
            <div className="absolute left-[52%] top-[4%] rounded-xl border border-v2-line/60 bg-white px-3 py-2 shadow-v2-card">
              <p className="text-[14px] font-extrabold leading-tight text-v2-navy">{VELOCITY.tooltip.value}</p>
              <p className="text-[10.5px] leading-tight text-v2-ink-soft">{VELOCITY.tooltip.label}</p>
            </div>
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] text-v2-muted">
            {VELOCITY.months.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** `conic-gradient` for the donut, from the arc shares in the data. */
function ringGradient(): string {
  const total = OUTCOMES.ring.reduce((s, r) => s + r.share, 0);
  let at = 0;
  const stops = OUTCOMES.ring.map((r) => {
    const from = (at / total) * 360;
    at += r.share;
    const to = (at / total) * 360;
    return `${r.color} ${from}deg ${to}deg`;
  });
  return `conic-gradient(from 0deg, ${stops.join(", ")})`;
}

function OutcomesChart() {
  return (
    <div className="rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-4 shadow-v2-card md:p-5">
      <p className="text-[14px] font-bold text-v2-navy">{OUTCOMES.title}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-4 sm:flex-nowrap">
        <div className="relative h-32 w-32 flex-none rounded-full" style={{ background: ringGradient() }}>
          <div className="absolute inset-[16px] grid place-items-center rounded-full bg-white text-center">
            <div className="leading-tight">
              <p className="text-[26px] font-extrabold text-v2-navy">{OUTCOMES.centerValue}</p>
              <p className="text-[11px] text-v2-ink-soft">{OUTCOMES.centerLabel}</p>
            </div>
          </div>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-2 text-[12px]">
          {OUTCOMES.legend.map((l) => (
            <li key={l.label} className="flex items-center gap-2">
              <span aria-hidden className={cn("h-2 w-2 flex-none rounded-full", l.dot)} />
              <span className="text-v2-ink-soft">{l.label}</span>
              <span className="ml-auto flex-none font-bold text-v2-navy">
                {l.value} <span className="font-normal text-v2-muted">({l.pct})</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function OrgReporting() {
  return (
    <section id="reporting" aria-labelledby="org-reporting-title" className="scroll-mt-20 py-12 md:py-16">
      <Container className="grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] md:gap-5 lg:gap-8">
        <div className="flex flex-col items-start gap-5 md:pt-6">
          <Eyebrow family="green">Reporting &amp; Insights</Eyebrow>
          <h2 id="org-reporting-title" className="text-[28px] leading-[1.08] text-v2-navy md:text-[clamp(22px,2.9vw,40px)]">
            Turn progress into
            <br />
            measurable <span className={HEADLINE_GREEN}>impact.</span>
          </h2>
          <p className="max-w-md text-base leading-relaxed text-v2-ink-soft md:text-[clamp(13.5px,1.3vw,17px)]">
            Track key metrics, understand what&apos;s working, and demonstrate the value of your program with powerful
            analytics.
          </p>
        </div>

        <div aria-hidden className="flex min-w-0 flex-col gap-4">
          <div className="flex justify-end">
            <span className="inline-flex items-center gap-2 rounded-lg border border-v2-line bg-white px-3 py-2 text-[12px] text-v2-ink-soft">
              {REPORT_RANGE}
              <ChevronDownIcon className="h-3 w-3" />
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {REPORT_TILES.map((t) => {
              const f = FAMILY[t.tone];
              const Icon = TILE_ICONS[t.label] ?? BriefcaseIcon;
              return (
                <li key={t.label} className={cn("flex items-center gap-3 rounded-[var(--radius-v2-card)] p-3.5", f.soft)}>
                  <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-full bg-white/80", f.icon)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] text-v2-ink-soft">{t.label}</p>
                    <p className="text-[22px] font-extrabold leading-tight text-v2-navy">{t.value}</p>
                    <p className={cn("text-[12px] font-bold", DELTA[t.label])}>↑ {t.delta}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <VelocityChart />
            <OutcomesChart />
          </div>
        </div>
      </Container>
    </section>
  );
}
