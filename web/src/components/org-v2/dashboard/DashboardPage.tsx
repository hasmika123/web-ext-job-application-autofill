import {
  BriefcaseIcon,
  CalendarIcon,
  ChartIcon,
  FileTextIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import {
  ActivityTimeline,
  CompanyTile,
  Progress,
  QuickActionTiles,
  SectionCard,
  StatRow,
  TONE,
  type QuickAction,
} from "@/components/app-v2/common";
import OrgPageHero from "../shell/OrgPageHero";
import {
  DASHBOARD_QUICK_ACTIONS,
  DASHBOARD_STATS,
  OPPORTUNITIES,
  PLACEMENT_PIPELINE,
  TIMELINE,
  UPCOMING_INTERVIEWS,
} from "../sample-data";

const QUICK_ICONS = {
  user: <UserIcon size={20} />,
  briefcase: <BriefcaseIcon size={20} />,
  calendar: <CalendarIcon size={20} />,
  chart: <ChartIcon size={20} />,
} as const;

const QUICK: QuickAction[] = DASHBOARD_QUICK_ACTIONS.map((a) => ({
  id: a.id,
  label: a.label,
  icon: QUICK_ICONS[a.icon],
  href: a.href,
}));

/** /org (APP-V2-SPEC §6.9; no board, composed in the same system). */
export default function DashboardPage() {
  const total = PLACEMENT_PIPELINE.reduce((a, s) => a + s.value, 0);

  return (
    <div className="space-y-4">
      <OrgPageHero
        title="Dashboard"
        icon={<ChartIcon className="h-8 w-8" />}
        subtitle="Your team's placement activity at a glance."
        note="Support your people. Brighter futures together."
      />
      <StatRow
        stats={DASHBOARD_STATS}
        icons={{
          employees: <UsersIcon size={24} />,
          applications: <FileTextIcon size={24} />,
          interviews: <CalendarIcon size={24} />,
          placements: <TrophyIcon size={24} />,
        }}
      />

      <SectionCard title="Placement Pipeline">
        <div
          className="flex h-4 gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={`Placement pipeline: ${PLACEMENT_PIPELINE.map((s) => `${s.label} ${s.value}`).join(", ")}`}
        >
          {PLACEMENT_PIPELINE.map((s) => (
            <span key={s.label} className={cn("h-full", TONE[s.tone].solid)} style={{ width: `${(s.value / total) * 100}%` }} />
          ))}
        </div>
        <ul className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
          {PLACEMENT_PIPELINE.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 flex-none rounded-full", TONE[s.tone].solid)} />
              <span className="text-[13px] text-v2-ink-soft">{s.label}</span>
              <span className="text-[14px] font-extrabold text-v2-navy">{s.value}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SectionCard title="Recent Activity" action={{ label: "View all", href: "/org/applications" }}>
          <ActivityTimeline items={TIMELINE} />
        </SectionCard>

        <SectionCard title="Upcoming Interviews" action={{ label: "View all", href: "/org/interviews" }}>
          <ul className="space-y-3">
            {UPCOMING_INTERVIEWS.slice(0, 4).map((u) => (
              <li key={u.id} className="flex items-center gap-3">
                <CompanyTile name={u.company} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold leading-tight text-v2-navy">{u.name}</p>
                  <p className="truncate text-[12px] leading-tight text-v2-muted">
                    {u.role} · {u.company}
                  </p>
                </div>
                <span className="max-w-[88px] flex-none text-right text-[11.5px] leading-snug text-v2-muted">{u.when}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Top Opportunities" action={{ label: "View all", href: "/org/opportunities" }} className="lg:col-span-2 xl:col-span-1">
          <ul className="space-y-3">
            {OPPORTUNITIES.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center gap-3">
                <CompanyTile name={o.company} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold leading-tight text-v2-navy">{o.role}</p>
                  <p className="truncate text-[12px] leading-tight text-v2-muted">
                    {o.company} · {o.location}
                  </p>
                </div>
                <div className="w-14 flex-none">
                  <p className="text-right text-[12px] font-semibold text-v2-navy">{o.match}%</p>
                  <Progress value={o.match} tone={o.match >= 80 ? "green" : "amber"} className="mt-1" label={`${o.company} match`} />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Quick Actions">
        <QuickActionTiles items={QUICK} compact cols="grid-cols-2 sm:grid-cols-4" />
      </SectionCard>
    </div>
  );
}
