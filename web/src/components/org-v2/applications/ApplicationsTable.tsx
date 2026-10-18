"use client";

import { useMemo, useState } from "react";
import {
  CompanyTile,
  DataTable,
  InitialsAvatar,
  PillTabs,
  Pagination,
  SearchInput,
  StatusChip,
  FilterSelect,
  ToolbarButton,
  type DataColumn,
} from "@/components/app-v2/common";
import { FilterIcon, PlusIcon, SendIcon, UploadIcon } from "@kiwiply/ui";
import {
  APPLICATIONS,
  APPLICATION_TABS,
  STAGE_TONE,
  type ApplicationRow,
} from "../sample-data";

const COLUMNS: DataColumn<ApplicationRow>[] = [
  {
    key: "employee",
    header: "Employee",
    primary: true,
    render: (r) => (
      <div className="flex min-w-[130px] items-center gap-2.5">
        <InitialsAvatar name={r.name} size={34} />
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-bold leading-tight text-v2-navy">{r.name}</p>
          <p className="truncate text-[11.5px] leading-tight text-v2-muted">{r.title}</p>
        </div>
      </div>
    ),
  },
  {
    key: "company",
    header: "Company",
    render: (r) => (
      <div className="flex items-center gap-2">
        <CompanyTile name={r.company} size={26} />
        <span className="text-[12.5px] font-medium text-v2-navy">{r.company}</span>
      </div>
    ),
  },
  { key: "position", header: "Role / Position", render: (r) => r.position },
  { key: "date", header: "Application Date", render: (r) => <span className="whitespace-nowrap">{r.date}</span> },
  {
    key: "stage",
    header: "Current Stage",
    render: (r) => <StatusChip tone={STAGE_TONE[r.stage]}>{r.stage}</StatusChip>,
  },
  {
    key: "owner",
    header: "Support Owner",
    render: (r) => (
      <div className="flex items-center gap-2 whitespace-nowrap">
        <InitialsAvatar name={r.owner} size={26} />
        <span>{r.owner}</span>
      </div>
    ),
  },
  {
    key: "resume",
    header: "Resume Status",
    render: (r) => <StatusChip tone={r.resume === "Submitted" ? "green" : "coral"}>{r.resume}</StatusChip>,
  },
  {
    key: "next",
    header: "Next Action",
    render: (r) => (
      <div className="leading-tight">
        <p>{r.nextAction}</p>
        <p className="text-v2-muted">{r.nextDate}</p>
      </div>
    ),
  },
];

/** The "Applications" card: toolbar, tabs, filters, table, pagination (APP-V2-SPEC §6.1). */
export default function ApplicationsTable() {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return APPLICATIONS.filter(
      (r) =>
        (tab === "all" || r.stage === tab) &&
        (!term || [r.name, r.company, r.position].some((v) => v.toLowerCase().includes(term))),
    );
  }, [tab, q]);

  const active = APPLICATION_TABS.find((t) => t.id === tab) ?? APPLICATION_TABS[0];
  // The boards page through 8 sample rows; the full counts come from the tab badges.
  const total = q.trim() ? rows.length : active.count;
  const pages = Math.max(1, Math.ceil(total / 8));
  const first = rows.length ? 1 : 0;

  return (
    <section className="rounded-2xl border border-v2-line bg-white p-4 shadow-[0_2px_14px_rgba(27,31,94,0.05)] md:p-5">
      <header className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[16px] text-v2-navy" style={{ fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
          Applications
        </h3>
        <div className="flex flex-wrap gap-2">
          <ToolbarButton solid icon={<PlusIcon size={14} />}>
            Add Application
          </ToolbarButton>
          <ToolbarButton icon={<UploadIcon size={14} />}>Bulk Update</ToolbarButton>
          <ToolbarButton icon={<SendIcon size={14} />}>Send Reminder</ToolbarButton>
        </div>
      </header>

      <PillTabs ariaLabel="Application stage" tabs={APPLICATION_TABS} value={tab} onChange={setTab} />

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <SearchInput
          placeholder="Search applications by employee name, company, or role..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          wrapperClassName="min-w-[220px] flex-[1_1_320px]"
        />
        <FilterSelect label="Status" options={["All Statuses", "Applied", "In Review", "Interviewing", "Offer", "Rejected"]} className="min-w-[calc(50%-4px)] flex-1 sm:min-w-0 sm:flex-none sm:w-[140px]" />
        <FilterSelect label="Job role" options={["All Job Roles", "Product Designer", "Software Engineer", "Data Analyst", "Product Manager"]} className="min-w-[calc(50%-4px)] flex-1 sm:min-w-0 sm:flex-none sm:w-[140px]" />
        <FilterSelect label="Date range" options={["Last 30 days", "Last 7 days", "Last 90 days"]} className="min-w-[calc(50%-4px)] flex-1 sm:min-w-0 sm:flex-none sm:w-[130px]" />
        <button
          type="button"
          aria-label="More filters"
          className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-v2-line bg-[#F1F4FA] text-v2-ink-soft hover:bg-white"
        >
          <FilterIcon size={17} />
        </button>
      </div>

      <div className="mt-3.5">
        <DataTable inCard
          aria-label="Applications"
          selectable
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          empty="No applications match your filters."
        />
      </div>

      <Pagination
        tone="blue"
        className="pt-3.5"
        page={1}
        pages={pages}
        summary={`Showing ${first}–${rows.length} of ${total} applications`}
      />
    </section>
  );
}
