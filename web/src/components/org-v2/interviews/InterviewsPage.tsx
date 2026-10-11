import { BriefcaseIcon, CalendarIcon, ChartIcon, CheckCircleIcon, MailIcon, UsersIcon } from "../common-local/icons";
import {
  CompanyTile,
  DataTable,
  Donut,
  InitialsAvatar,
  Progress,
  QuickActionTiles,
  RailLayout,
  SectionCard,
  StatRow,
  StatusChip,
  type Column,
  type QuickAction,
} from "../common-local";
import OrgPageHero from "../shell/OrgPageHero";
import {
  INTERVIEWS_STATS,
  INTERVIEW_OUTCOMES,
  INTERVIEW_QUICK_ACTIONS,
  PREP_CHECKLIST,
  PREP_STATUS,
  UPCOMING_INTERVIEWS,
  type UpcomingInterview,
} from "../sample-data";
import InterviewCalendar from "./InterviewCalendar";

const UPCOMING_COLUMNS: Column<UpcomingInterview>[] = [
  {
    key: "employee",
    header: "Employee",
    mobile: "title",
    cell: (r) => (
      <div className="flex min-w-[120px] items-center gap-2.5">
        <InitialsAvatar name={r.name} size={32} />
        <span className="truncate text-[12.5px] font-bold text-v2-navy">{r.name}</span>
      </div>
    ),
  },
  {
    key: "company",
    header: "Company",
    cell: (r) => (
      <div className="flex items-center gap-2">
        <CompanyTile name={r.company} size={26} />
        <span className="text-[12.5px] font-medium text-v2-navy">{r.company}</span>
      </div>
    ),
  },
  { key: "role", header: "Role", cell: (r) => r.role },
  { key: "type", header: "Interview Type", cell: (r) => r.type },
  { key: "when", header: "Date & Time", cell: (r) => <span className="whitespace-nowrap">{r.when}</span> },
  { key: "interviewer", header: "Interviewer", cell: (r) => <span className="whitespace-nowrap">{r.interviewer}</span> },
  { key: "status", header: "Status", cell: (r) => <StatusChip tone="blue">{r.status}</StatusChip> },
];

const PREP_COLUMNS: Column<(typeof PREP_STATUS)[number]>[] = [
  {
    key: "employee",
    header: "Employee",
    mobile: "title",
    cell: (r) => (
      <div className="flex items-center gap-2.5">
        <InitialsAvatar name={r.name} size={30} />
        <span className="text-[12.5px] font-bold text-v2-navy">{r.name}</span>
      </div>
    ),
  },
  { key: "upcoming", header: "Upcoming Interviews", cell: (r) => r.upcoming },
  {
    key: "progress",
    header: "Prep Progress",
    cell: (r) => (
      <div className="flex min-w-[130px] items-center gap-2.5">
        <Progress value={r.progress} tone={r.tone} label={`${r.name} prep progress`} className="flex-1" />
        <span className="w-9 flex-none text-right text-[12px] font-semibold text-v2-navy">{r.progress}%</span>
      </div>
    ),
  },
  { key: "status", header: "Status", cell: (r) => <StatusChip tone={r.tone}>{r.status}</StatusChip> },
];

const QUICK_ICONS: Record<(typeof INTERVIEW_QUICK_ACTIONS)[number]["icon"], React.ReactNode> = {
  calendar: <CalendarIcon size={20} />,
  users: <UsersIcon size={20} />,
  mail: <MailIcon size={20} />,
  chart: <ChartIcon size={20} />,
};
const QUICK: QuickAction[] = INTERVIEW_QUICK_ACTIONS.map((a) => ({
  id: a.id,
  label: a.label,
  sub: a.sub,
  icon: QUICK_ICONS[a.icon],
  href: a.icon === "chart" ? "/org/analytics" : a.icon === "calendar" ? "/org/interviews" : undefined,
}));

/** /org/interviews (APP-V2-SPEC §6.5). */
export default function InterviewsPage() {
  return (
    <div className="space-y-4">
      <OrgPageHero
        title="Interviews"
        icon={<CalendarIcon className="h-8 w-8" />}
        subtitle="Schedule, prepare, and track interview progress for your employees."
        note="Confident employees. Stronger career outcomes."
      />
      <StatRow
        stats={INTERVIEWS_STATS}
        icons={{
          week: <CalendarIcon size={24} />,
          mock: <UsersIcon size={24} />,
          employer: <BriefcaseIcon size={24} />,
          offer: <CheckCircleIcon size={24} />,
        }}
      />

      <RailLayout
        main={
          <>
            <InterviewCalendar />
            <SectionCard title="Upcoming Interviews" action={{ label: "View all", href: "/org/interviews" }}>
              <DataTable
                label="Upcoming interviews"
                columns={UPCOMING_COLUMNS}
                rows={UPCOMING_INTERVIEWS}
                rowKey={(r) => r.id}
                minWidth={820}
              />
            </SectionCard>
            <SectionCard title="Employee Interview Prep Status" action={{ label: "View all", href: "/org/interviews" }}>
              <DataTable
                label="Employee interview prep status"
                columns={PREP_COLUMNS}
                rows={PREP_STATUS}
                rowKey={(r) => r.id}
                actions={false}
                minWidth={560}
              />
            </SectionCard>
          </>
        }
        rail={
          <>
            <SectionCard title="Interview Prep Checklist" action={{ label: "View all", href: "/org/interviews" }}>
              <div className="flex justify-center">
                <Donut
                  legend={false}
                  centerValue={`${PREP_CHECKLIST.percent}%`}
                  centerLabel="Prep Complete"
                  segments={[
                    { label: "Prep complete", value: PREP_CHECKLIST.percent, tone: "green" },
                    { label: "Remaining", value: 100 - PREP_CHECKLIST.percent, tone: "slate" },
                  ]}
                />
              </div>
              <ul className="mt-4 space-y-2.5">
                {PREP_CHECKLIST.items.map((it) => (
                  <li key={it.label} className="flex items-center gap-3">
                    <span className="w-[120px] flex-none text-[12.5px] text-v2-ink-soft">{it.label}</span>
                    <Progress value={(it.done / it.total) * 100} tone={it.tone} label={it.label} className="flex-1" />
                    <span className="w-8 flex-none text-right text-[12px] font-semibold tabular-nums text-v2-navy">
                      {it.done}/{it.total}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mb-2 mt-5 text-[13px] font-bold text-v2-navy">Upcoming Tasks</p>
              <ul className="space-y-2">
                {PREP_CHECKLIST.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      defaultChecked={t.done}
                      aria-label={t.text}
                      className="h-4 w-4 flex-none rounded border-v2-line accent-[#1E6FF5]"
                    />
                    <span className="min-w-0 flex-1 text-[12.5px] text-v2-navy">{t.text}</span>
                    <span className="flex-none text-[11.5px] text-v2-muted">{t.date}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Recent Interview Outcomes" action={{ label: "View all", href: "/org/interviews" }}>
              <ul className="space-y-3">
                {INTERVIEW_OUTCOMES.map((o) => (
                  <li key={o.id} className="flex items-center gap-3">
                    <CompanyTile name={o.company} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold leading-tight text-v2-navy">
                        {o.company} · {o.role}
                      </p>
                      <p className="truncate text-[12px] leading-tight text-v2-muted">{o.name}</p>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1">
                      <span className="text-[11.5px] text-v2-muted">{o.date}</span>
                      <StatusChip tone={o.tone}>{o.outcome}</StatusChip>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Quick Actions" className="md:col-span-2 xl:col-span-1">
              <QuickActionTiles items={QUICK} />
            </SectionCard>
          </>
        }
      />
    </div>
  );
}
