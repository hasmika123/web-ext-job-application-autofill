import type { ComponentType } from "react";
import { BriefcaseIcon, CalendarIcon, ChevronDownIcon, TrophyIcon, UserIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY } from "./family";
import { OVERVIEW } from "./placeholder-data";

const ICONS: Record<string, ComponentType<IconProps>> = {
  Organizations: UserIcon,
  Applications: BriefcaseIcon,
  Interviews: CalendarIcon,
  Placements: TrophyIcon,
};

/**
 * The hero's "Organization Overview" card: four stat tiles and the "Placement Pipeline" bar.
 * Decorative product mock (aria-hidden); every number comes from `placeholder-data.ts`.
 */
export default function OrgStatsMock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-4 shadow-v2-float sm:p-5", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] font-bold text-v2-navy">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-v2-blue-soft text-v2-blue">
            <UserIcon className="h-3.5 w-3.5" />
          </span>
          {OVERVIEW.title}
        </p>
        <span className="inline-flex items-center gap-1 rounded-lg border border-v2-line px-2 py-1 text-[11px] font-medium text-v2-muted">
          {OVERVIEW.range}
          <ChevronDownIcon className="h-3 w-3" />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        {OVERVIEW.stats.map((s) => {
          const f = FAMILY[s.tone];
          const Icon = ICONS[s.label] ?? UserIcon;
          return (
            <div key={s.label} className={cn("flex items-center gap-2.5 rounded-xl p-2.5", f.soft)}>
              <span className={cn("grid h-8 w-8 flex-none place-items-center rounded-lg bg-white/80", f.icon)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-medium text-v2-ink-soft">{s.label}</p>
                <p className="text-lg font-extrabold leading-tight text-v2-navy">{s.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[13px] font-bold text-v2-navy">{OVERVIEW.pipelineTitle}</p>
      <div className="mt-2 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {OVERVIEW.pipeline.map((p) => (
          <span key={p.label} className={cn("h-full", FAMILY[p.tone].solid)} style={{ flexGrow: p.weight, flexBasis: 0 }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-x-2 gap-y-2 sm:grid-cols-5">
        {OVERVIEW.pipeline.map((p) => (
          <li key={p.label} className="flex flex-col">
            <span className="flex items-center gap-1 text-[10.5px] font-medium text-v2-ink-soft">
              <span className={cn("h-1.5 w-1.5 rounded-full", FAMILY[p.tone].solid)} />
              {p.label}
            </span>
            <span className="text-[12px] font-bold text-v2-navy">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
