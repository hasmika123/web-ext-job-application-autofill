"use client";

import { useMemo, useState } from "react";
import {
  ChevronRightIcon,
  ClipboardIcon,
  CheckCircleIcon,
  FileTextIcon,
  FunnelIcon,
  SparklesIcon,
  TargetIcon,
  TrendingUpIcon,
  UploadIcon,
  AlertIcon,
  cn,
  ChevronDownIcon,
} from "@kiwiply/ui";
import type { ReactNode } from "react";
import {
  InitialsAvatar,
  StatusChip,
  TONE,
  type Tone,
  SectionCard,
  StatTile,
  DataTable,
  FilterSelect,
  IconSquareButton,
  ToolbarButton,
  Pagination,
  PillTabs,
  SearchInput,
  UnderlineTabs,
  type DataColumn,
} from "@/components/app-v2/common";
import OrgPageHero from "../shell/OrgPageHero";
import {
  EMPLOYEE_RESUMES,
  RESUME_STATS,
  RESUME_SUGGESTIONS,
  RESUME_TABS,
  RESUME_TOOLS,
  type EmployeeResume,
  type ResumeStatus,
} from "../sample-data";

const STAT_ICONS = [<FileTextIcon key="a" />, <CheckCircleIcon key="b" />, <SparklesIcon key="c" />, <AlertIcon key="d" />];

/** Score chip tone: >= 85 green, 70-84 amber, < 70 coral (spec 6.7). */
function scoreTone(n: number): Tone {
  if (n >= 85) return "green";
  if (n >= 70) return "amber";
  return "coral";
}

const STATUS_TONE: Record<ResumeStatus, Tone> = {
  "ATS Ready": "green",
  "Needs Review": "coral",
  "Needs Attention": "coral",
  "Review Suggested": "amber",
};

const COLUMNS: DataColumn<EmployeeResume>[] = [
  {
    key: "name",
    header: "Name",
    primary: true,
    render: (r) => (
      <span className="flex items-center gap-2.5">
        <InitialsAvatar name={r.name} size={30} />
        <span className="font-semibold text-v2-navy">{r.name}</span>
      </span>
    ),
  },
  { key: "cur", header: "Current Role", render: (r) => r.currentRole },
  { key: "tgt", header: "Target Role", render: (r) => r.targetRole },
  { key: "rs", header: "Resume Score", render: (r) => <StatusChip tone={scoreTone(r.resumeScore)}>{r.resumeScore}</StatusChip> },
  { key: "ats", header: "ATS Score", render: (r) => <StatusChip tone={scoreTone(r.atsScore)}>{r.atsScore}</StatusChip> },
  { key: "ver", header: "Latest Version", render: (r) => <span className="whitespace-nowrap">{r.latestVersion}</span> },
  { key: "st", header: "Status", render: (r) => <StatusChip tone={STATUS_TONE[r.status]}>{r.status}</StatusChip> },
];

const SORTS = ["Last Updated (Newest)", "Last Updated (Oldest)", "Name (A-Z)", "Resume Score (High-Low)"];

function SuggestionIcon({ id }: { id: string }) {
  switch (id) {
    case "keywords":
      return <ClipboardIcon />;
    case "bullets":
      return <TrendingUpIcon />;
    case "summary":
      return <FileTextIcon />;
    default:
      return <TargetIcon />;
  }
}

const SUGGESTION_TABS = [
  { id: "key", label: "Key Suggestions" },
  { id: "role", label: "Role Alignment" },
  { id: "ats", label: "ATS Insights" },
];

function SuggestionsRail() {
  const [tab, setTab] = useState("key");
  const s = RESUME_SUGGESTIONS;
  const items = s.items.filter((i) => (tab === "key" ? true : tab === "role" ? ["alignment", "summary"].includes(i.id) : ["keywords", "bullets"].includes(i.id)));
  return (
    <SectionCard title="AI Resume Suggestions" action={{ label: "View all", href: "/org/resumes" }}>
      <div className="flex items-center gap-3">
        <InitialsAvatar name={s.name} size={42} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-v2-navy">{s.name}</div>
          <div className="text-[12.5px] text-v2-muted">{s.role}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusChip tone="amber" className="px-3 py-1.5">
          Resume Score <b className="font-extrabold">{s.resumeScore}/100</b>
        </StatusChip>
        <StatusChip tone="amber" className="px-3 py-1.5">
          ATS Score <b className="font-extrabold">{s.atsScore}/100</b>
        </StatusChip>
      </div>
      <UnderlineTabs tone="blue" padded tabs={SUGGESTION_TABS} value={tab} onChange={setTab} ariaLabel="Suggestion type" className="mt-3" />
      <ul className="mt-2 divide-y divide-[#EEF1F7]">
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" className="flex w-full cursor-pointer items-start gap-3 py-3 text-left hover:bg-[#F9FBFF]">
              <span className={cn("flex h-9 w-9 flex-none items-center justify-center rounded-[10px] [&>svg]:h-[18px] [&>svg]:w-[18px]", TONE[i.tone].soft, TONE[i.tone].ink)}>
                <SuggestionIcon id={i.id} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-v2-navy">{i.title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-v2-ink-soft">{i.body}</span>
              </span>
              <ChevronRightIcon className="mt-2 h-4 w-4 flex-none text-v2-muted" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ToolbarButton size="md" variant="outline" icon={<SparklesIcon />}>
          Generate Suggestions
        </ToolbarButton>
        <ToolbarButton size="md" variant="solid">Tailor for Job</ToolbarButton>
      </div>
    </SectionCard>
  );
}

function ToolCard({ title, body, tone, icon }: { title: string; body: string; tone: Tone; icon: ReactNode }) {
  return (
    <button
      type="button"
      className={cn("flex w-full cursor-pointer items-center gap-4 rounded-2xl p-5 text-left transition hover:brightness-[.98]", TONE[tone].soft)}
    >
      <span className={cn("flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-white shadow-[0_2px_8px_rgba(27,31,94,.06)] [&>svg]:h-5 [&>svg]:w-5", TONE[tone].ink)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-v2-navy">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-v2-ink-soft">{body}</span>
      </span>
      <ChevronRightIcon className={cn("h-5 w-5 flex-none", TONE[tone].ink)} />
    </button>
  );
}

const TOOL_ICONS = [<SparklesIcon key="a" />, <TrendingUpIcon key="b" />, <FileTextIcon key="c" />];

/** AI Resume Support body (spec 6.7). Renders inside the org shell. */
export default function ResumesPage() {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(SORTS[0]);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = EMPLOYEE_RESUMES.filter((r) => (tab === "attention" || tab === "ready" ? r.tab === tab : tab === "none" ? false : true));
    if (term) out = out.filter((r) => [r.name, r.currentRole, r.targetRole].some((v) => v.toLowerCase().includes(term)));
    if (sort === "Name (A-Z)") out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "Resume Score (High-Low)") out = [...out].sort((a, b) => b.resumeScore - a.resumeScore);
    if (sort === "Last Updated (Oldest)") out = [...out].reverse();
    return out;
  }, [tab, q, sort]);

  return (
    <div className="space-y-4">
      <OrgPageHero
        title="AI Resume Support"
        icon={<SparklesIcon />}
        subtitle="Optimize employee resumes and application materials with AI-powered insights."
        note="Stronger resumes. Brighter opportunities together."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {RESUME_STATS.map((s, i) => (
          <StatTile key={s.label} icon={STAT_ICONS[i]} value={s.value} label={s.label} delta={s.delta} sparkline={s.spark} tone={s.tone} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
        <SectionCard
          title="Employee Resumes"
          headerExtra={
            <div className="flex flex-wrap gap-2">
              <ToolbarButton size="md" variant="solid" icon={<UploadIcon />}>
                Upload Resume
              </ToolbarButton>
              <ToolbarButton size="md" variant="outline">
                Bulk Actions <ChevronDownIcon size={14} />
              </ToolbarButton>
            </div>
          }
        >
          <PillTabs tabs={RESUME_TABS} value={tab} onChange={setTab} ariaLabel="Employee resume filters" />
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <SearchInput variant="grey" placeholder="Search employees by name, role, or department..." value={q} onChange={(e) => setQ(e.target.value)} wrapperClassName="min-w-[220px] flex-1" />
            <FilterSelect label="Sort" value={sort} onChange={setSort} options={SORTS} className="w-[200px]" />
            <IconSquareButton label="More filters">
              <FunnelIcon />
            </IconSquareButton>
          </div>
          <div className="mt-3.5">
            {rows.length === 0 ? (
              <p className="rounded-xl bg-[#F6F8FC] px-4 py-8 text-center text-[13px] text-v2-ink-soft">No employees match this view.</p>
            ) : (
              <DataTable inCard
                aria-label="Employee resumes"
                columns={COLUMNS}
                rows={rows}
                rowKey={(r) => r.name}
                minWidth={860}
                footer={
                  <Pagination
                    tone="blue"
                    className="mt-3 border-t border-[#EEF1F7] pt-3"
                    page={page}
                    pages={11}
                    onPageChange={setPage}
                    summary={`Showing 1-${rows.length} of ${tab === "all" || tab === "dept" ? 85 : rows.length} employees`}
                  />
                }
              />
            )}
          </div>
        </SectionCard>

        <SuggestionsRail />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {RESUME_TOOLS.map((t, i) => (
          <ToolCard key={t.title} title={t.title} body={t.body} tone={t.tone} icon={TOOL_ICONS[i]} />
        ))}
      </div>
    </div>
  );
}
