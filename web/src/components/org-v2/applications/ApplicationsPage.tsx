import {
  BriefcaseIcon,
  CalendarIcon,
  ChartIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SendIcon,
  ShareNodesIcon,
  UploadIcon,
} from "../common-local/icons";
import {
  ActivityTimeline,
  CompanyTile,
  Donut,
  DonutLegend,
  QuickActionTiles,
  RailLayout,
  SectionCard,
  StatRow,
  StatusChip,
  type QuickAction,
} from "../common-local";
import OrgPageHero from "../shell/OrgPageHero";
import {
  APPLICATIONS_STATS,
  FOLLOW_UP_TASKS,
  PRIORITY_TONE,
  RECENT_RESPONSES,
  STAGE_BREAKDOWN,
  TIMELINE,
} from "../sample-data";
import ApplicationsTable from "./ApplicationsTable";

const STAT_ICONS = {
  total: <FileTextIcon size={24} />,
  review: <ClockIcon size={24} />,
  interviews: <CalendarIcon size={24} />,
  offers: <BriefcaseIcon size={24} />,
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: "add", label: "Add Application", icon: <PlusIcon size={22} /> },
  { id: "bulk", label: "Bulk Update", icon: <UploadIcon size={22} /> },
  { id: "remind", label: "Send Reminder", icon: <SendIcon size={22} /> },
  { id: "reports", label: "View Reports", icon: <ChartIcon size={22} />, href: "/org/analytics" },
  { id: "export", label: "Export Data", icon: <DownloadIcon size={22} /> },
  { id: "integrations", label: "Manage Integrations", icon: <ShareNodesIcon size={22} />, href: "/org/integrations" },
];

/** /org/applications (APP-V2-SPEC §6.1). */
export default function ApplicationsPage() {
  return (
    <div className="space-y-4">
      <OrgPageHero
        title="Application"
        icon={<FileTextIcon className="h-8 w-8" />}
        subtitle="Track employee job applications and outcomes, and provide the right support at every step."
        note="Support your people. Brighter futures together."
      />
      <StatRow
        stats={APPLICATIONS_STATS}
        icons={STAT_ICONS}
      />

      <RailLayout
        main={
          <>
            <ApplicationsTable />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionCard title="Follow-up Tasks" action={{ label: "View all", href: "/org/applications" }}>
                <ul className="divide-y divide-v2-line/70">
                  {FOLLOW_UP_TASKS.map((t) => (
                    <li key={t.id} className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0">
                      <input type="checkbox" aria-label={t.text} className="h-4 w-4 flex-none rounded border-v2-line accent-[#1E6FF5]" />
                      <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-v2-navy">{t.text}</span>
                      <span className={`flex-none text-[11.5px] ${t.date === "Today" ? "font-semibold text-v2-coral" : "text-v2-muted"}`}>{t.date}</span>
                      <StatusChip tone={PRIORITY_TONE[t.priority]} className="flex-none">{t.priority}</StatusChip>
                    </li>
                  ))}
                </ul>
              </SectionCard>
              <SectionCard title="Application Activity Timeline" action={{ label: "View all", href: "/org/applications" }}>
                <ActivityTimeline items={TIMELINE} />
              </SectionCard>
            </div>
          </>
        }
        rail={
          <>
            <SectionCard title="Application Stage Breakdown" action={{ label: "View all", href: "/org/applications" }}>
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <Donut
                  centerValue="124"
                  centerLabel="Applications"
                  legend={false}
                  segments={STAGE_BREAKDOWN.map((s) => ({ label: s.label, value: s.value, tone: s.tone }))}
                />
                <DonutLegend items={STAGE_BREAKDOWN} className="self-stretch" />
              </div>
            </SectionCard>
            <SectionCard title="Recent Responses" action={{ label: "View all", href: "/org/applications" }}>
              <ul className="space-y-3">
                {RECENT_RESPONSES.map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <CompanyTile name={r.company} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold leading-tight text-v2-navy">{r.title}</p>
                      <p className="truncate text-[12px] leading-tight text-v2-muted">{r.sub}</p>
                    </div>
                    <span className="flex-none text-[11.5px] text-v2-muted">{r.ago}</span>
                    {r.isNew && <StatusChip tone="green" className="flex-none">New</StatusChip>}
                    <button type="button" aria-label="More" className="flex-none px-1 text-v2-muted">
                      <MoreHorizontalIcon size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard title="Quick Actions" className="md:col-span-2 xl:col-span-1">
              <QuickActionTiles items={QUICK_ACTIONS} compact />
            </SectionCard>
          </>
        }
      />
    </div>
  );
}
