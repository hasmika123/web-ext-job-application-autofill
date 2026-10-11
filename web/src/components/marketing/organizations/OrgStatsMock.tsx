import { BriefcaseIcon, ChatIcon, TrophyIcon, UsersIcon, cn } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";
import { ExampleBadge } from "./parts";

/**
 * Hero stats card: a pure-HTML mock of an organisation overview. Every figure is an
 * illustrative example, flagged by the badge, never a real result.
 */
const STATS: { label: string; value: string; family: Family; Icon: typeof UsersIcon }[] = [
  { label: "Consultants", value: "24", family: "blue", Icon: UsersIcon },
  { label: "Applications", value: "1,243", family: "coral", Icon: BriefcaseIcon },
  { label: "Interviews", value: "320", family: "violet", Icon: ChatIcon },
  { label: "Offers", value: "41", family: "green", Icon: TrophyIcon },
];

const PIPELINE: { label: string; value: string; family: Family; width: string }[] = [
  { label: "Applied", value: "1,243", family: "blue", width: "w-[58%]" },
  { label: "Interview", value: "320", family: "violet", width: "w-[28%]" },
  { label: "Offer", value: "41", family: "green", width: "w-[14%]" },
];

export default function OrgStatsMock({ className }: { className?: string }) {
  return (
    <div
      role="group"
      aria-label="Example organization overview"
      className={cn("rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-4 shadow-v2-float sm:p-5", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-v2-navy">Organization overview</p>
        <ExampleBadge />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2">
        {STATS.map(({ label, value, family, Icon }) => {
          const f = FAMILY[family];
          return (
            <div key={label} className={cn("flex items-center gap-2.5 rounded-xl p-2.5", f.soft)}>
              <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-white">
                <Icon size={16} className={f.icon} />
              </span>
              <div className="min-w-0">
                <dt className="truncate text-[11px] font-medium text-v2-ink-soft">{label}</dt>
                <dd className="text-lg font-extrabold leading-tight text-v2-navy">{value}</dd>
              </div>
            </div>
          );
        })}
      </dl>

      <div className="mt-4">
        <p className="text-xs font-bold text-v2-navy">Pipeline</p>
        <div aria-hidden className="mt-2 flex h-2.5 w-full gap-1 overflow-hidden rounded-full bg-v2-line">
          {PIPELINE.map((p) => (
            <span key={p.label} className={cn("h-full rounded-full", p.width, FAMILY[p.family].solid)} />
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-v2-ink-soft">
          {PIPELINE.map((p) => (
            <li key={p.label} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("h-2 w-2 rounded-full", FAMILY[p.family].solid)} />
              {p.label} <span className="font-semibold text-v2-navy">{p.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
