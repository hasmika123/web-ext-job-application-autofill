import type { ComponentType } from "react";
import { BriefcaseIcon, ChatIcon, TrendingUpIcon, TrophyIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";
import { Container, ExampleBadge, SectionHeading, StatusChip } from "./parts";

/**
 * Block 5: reporting and insights. Analytics is a "Coming" feature (spec section 9), so the
 * block says so, and every number is marked as an example.
 */
const TILES: { label: string; value: string; delta: string; Icon: ComponentType<IconProps>; family: Family }[] = [
  { label: "Applications", value: "1,243", delta: "+24%", Icon: BriefcaseIcon, family: "blue" },
  { label: "Interviews", value: "320", delta: "+18%", Icon: ChatIcon, family: "violet" },
  { label: "Offers", value: "41", delta: "+32%", Icon: TrophyIcon, family: "green" },
  { label: "Placements", value: "28", delta: "+12%", Icon: TrendingUpIcon, family: "amber" },
];

/** Weekly applications, as bar heights (percent of the chart). */
const WEEKS = [34, 42, 38, 55, 48, 62, 58, 71, 66, 80, 74, 92];

const STAGES: { label: string; pct: number; family: Family }[] = [
  { label: "Applied", pct: 100, family: "blue" },
  { label: "Interview", pct: 26, family: "violet" },
  { label: "Offer", pct: 9, family: "green" },
  { label: "Placed", pct: 6, family: "amber" },
];

export default function OrgReporting() {
  return (
    <section id="reporting" aria-labelledby="org-reporting-title" className="scroll-mt-24 py-16 md:py-24">
      <Container className="flex flex-col gap-10 md:gap-12">
        <div className="flex flex-col items-center gap-4">
          <SectionHeading
            id="org-reporting-title"
            eyebrow="Reporting & insights"
            family="pink"
            before="Turn progress into"
            accent="measurable impact."
            lede="See applications, interviews and offers across your bench, and show what your support is achieving. Reporting is on its way, and the numbers below are examples."
          />
          <StatusChip status="coming" />
        </div>

        <div className="rounded-[var(--radius-v2-card)] border border-v2-line/70 bg-white p-4 shadow-v2-float sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-v2-navy">Last 90 days</p>
            <ExampleBadge />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {TILES.map(({ label, value, delta, Icon, family }) => {
              const f = FAMILY[family];
              return (
                <div key={label} className={cn("flex items-center gap-3 rounded-2xl p-4", f.soft)}>
                  <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white">
                    <Icon size={20} className={f.icon} />
                  </span>
                  <div className="min-w-0">
                    <dt className="truncate text-xs font-medium text-v2-ink-soft">{label}</dt>
                    <dd className="flex flex-wrap items-baseline gap-x-2 text-2xl font-extrabold leading-tight text-v2-navy">
                      {value}
                      <span className="text-xs font-semibold text-[#14702A]">{delta}</span>
                    </dd>
                  </div>
                </div>
              );
            })}
          </dl>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <figure className="rounded-2xl border border-v2-line/70 bg-v2-canvas p-4">
              <figcaption className="text-xs font-bold text-v2-navy">Applications per week</figcaption>
              <div role="img" aria-label="Example bar chart: weekly applications rising over twelve weeks" className="mt-4 flex h-36 items-end gap-1.5 sm:gap-2">
                {WEEKS.map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}%` }}
                    className={cn("w-full rounded-t-md", i === WEEKS.length - 1 ? "bg-v2-blue" : "bg-v2-blue/35")}
                  />
                ))}
              </div>
              <div aria-hidden className="mt-2 flex justify-between text-[11px] text-v2-muted">
                <span>Week 1</span>
                <span>Week 12</span>
              </div>
            </figure>

            <div className="rounded-2xl border border-v2-line/70 bg-v2-canvas p-4">
              <p className="text-xs font-bold text-v2-navy">Where applications stand</p>
              <ul className="mt-4 flex flex-col gap-3">
                {STAGES.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 text-[13px]">
                    <span className="w-16 flex-none text-v2-ink-soft">{s.label}</span>
                    <span aria-hidden className="h-2.5 flex-1 overflow-hidden rounded-full bg-v2-line">
                      <span style={{ width: `${s.pct}%` }} className={cn("block h-full rounded-full", FAMILY[s.family].solid)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
