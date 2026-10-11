"use client";

import { useMemo, useState } from "react";
import {
  CompanyTile,
  DataTable,
  FilterSelect,
  InitialsAvatar,
  Pagination,
  Progress,
  SearchInput,
  StatusChip,
  ToolbarButton,
  type DataColumn,
} from "@/components/app-v2/common";
import { FilterIcon, MapPinIcon, PlusIcon, UploadIcon, UsersIcon } from "@kiwiply/ui";
import { OPPORTUNITIES, OPP_STATUS_TONE, type OpportunityRow } from "../sample-data";

const COLUMNS: DataColumn<OpportunityRow>[] = [
  {
    key: "company",
    header: "Company",
    primary: true,
    render: (r) => (
      <div className="flex items-center gap-2.5">
        <CompanyTile name={r.company} size={30} />
        <span className="text-[12.5px] font-bold text-v2-navy">{r.company}</span>
      </div>
    ),
  },
  { key: "role", header: "Role Title", render: (r) => <span className="font-medium text-v2-navy">{r.role}</span> },
  {
    key: "location",
    header: "Location",
    render: (r) => (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <MapPinIcon size={13} className="flex-none text-v2-muted" />
        {r.location}
      </span>
    ),
  },
  {
    key: "mode",
    header: "Work Mode",
    render: (r) => <StatusChip tone={r.mode === "Hybrid" ? "violet" : "blue"}>{r.mode}</StatusChip>,
  },
  { key: "assigned", header: "Assigned", render: (r) => r.assigned },
  {
    key: "match",
    header: "Match Score",
    render: (r) => (
      <div className="min-w-[78px]">
        <p className="text-[12px] font-semibold text-v2-navy">{r.match}%</p>
        <Progress value={r.match} tone={r.match >= 80 ? "green" : "amber"} label={`Match score ${r.match}%`} className="mt-1" />
      </div>
    ),
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
  { key: "status", header: "Status", render: (r) => <StatusChip tone={OPP_STATUS_TONE[r.status]}>{r.status}</StatusChip> },
];

/** The "All Opportunities" card on /org/opportunities (APP-V2-SPEC §6.8). */
export default function OpportunitiesTable() {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return OPPORTUNITIES;
    return OPPORTUNITIES.filter((r) => [r.company, r.role, r.location, r.owner].some((v) => v.toLowerCase().includes(term)));
  }, [q]);

  return (
    <section className="rounded-2xl border border-v2-line bg-white p-4 shadow-[0_2px_14px_rgba(27,31,94,0.05)] md:p-5">
      <header className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[16px] text-v2-navy" style={{ fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
          All Opportunities
        </h3>
        <div className="flex flex-wrap gap-2">
          <ToolbarButton solid icon={<PlusIcon size={14} />}>
            Add Opportunity
          </ToolbarButton>
          <ToolbarButton icon={<UsersIcon size={14} />}>Bulk Assign</ToolbarButton>
          <ToolbarButton icon={<UploadIcon size={14} />}>Export List</ToolbarButton>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <FilterSelect label="Department" options={["All Departments", "Product", "Engineering", "Design", "Data", "Marketing"]} className="flex-1 sm:flex-none" />
        <FilterSelect label="Location" options={["All Locations", "San Francisco, CA", "Seattle, WA", "New York, NY", "Austin, TX"]} className="flex-1 sm:flex-none" />
        <FilterSelect label="Work mode" options={["Remote / Hybrid", "Remote", "Hybrid"]} className="flex-1 sm:flex-none" />
        <FilterSelect label="Match score" options={["Match Score", "80% and above", "60% and above"]} className="flex-1 sm:flex-none" />
        <FilterSelect label="Stage" options={["All Stages", "Open", "In Progress", "Reviewing"]} className="flex-1 sm:flex-none" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <SearchInput
          placeholder="Search opportunities by role, company, or keyword..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          wrapperClassName="min-w-[220px] flex-[1_1_320px]"
        />
        <FilterSelect label="Sort" options={["Last Updated (Newest)", "Match Score (High to Low)", "Company (A-Z)"]} className="flex-1 sm:w-[200px] sm:flex-none" />
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
          aria-label="Opportunities"
          selectable
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          empty="No opportunities match your search."
        />
      </div>

      <Pagination
        tone="blue"
        className="pt-3.5"
        page={1}
        summary={q.trim() ? `Showing 1–${rows.length} of ${rows.length} opportunities` : "Showing 1-10 of 48 opportunities"}
        pages={q.trim() ? 1 : undefined}
      />
    </section>
  );
}
