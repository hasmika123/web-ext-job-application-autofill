"use client";

import { useMemo, useState } from "react";
import {
  DataTable,
  FilterSelect,
  InitialsAvatar,
  Pagination,
  PillTabs,
  SearchInput,
  StatusChip,
  ToolbarButton,
  type DataColumn,
} from "@/components/app-v2/common";
import { FilterIcon, PlusIcon, UploadIcon, UsersIcon } from "@kiwiply/ui";
import { EMPLOYEES, STAGE_TONE, TEAM_TABS, type EmployeeRow } from "../sample-data";

const COLUMNS: DataColumn<EmployeeRow>[] = [
  {
    key: "name",
    header: "Name",
    primary: true,
    render: (r) => (
      <div className="flex min-w-[130px] items-center gap-2.5">
        <InitialsAvatar name={r.name} size={34} />
        <span className="truncate text-[12.5px] font-bold text-v2-navy">{r.name}</span>
      </div>
    ),
  },
  { key: "role", header: "Current Role", render: (r) => r.role },
  { key: "dept", header: "Department", render: (r) => r.department },
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
  { key: "stage", header: "Placement Stage", render: (r) => <StatusChip tone={STAGE_TONE[r.stage]}>{r.stage}</StatusChip> },
  { key: "last", header: "Last Activity", render: (r) => <span className="whitespace-nowrap">{r.last}</span> },
];

/** The employee table card on /org/team (APP-V2-SPEC §6.9). */
export default function TeamTable() {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return EMPLOYEES.filter(
      (r) =>
        (tab === "all" || r.groups.includes(tab as "active" | "attention" | "placed")) &&
        (!term || [r.name, r.role, r.department, r.owner].some((v) => v.toLowerCase().includes(term))),
    );
  }, [tab, q]);

  const active = TEAM_TABS.find((t) => t.id === tab) ?? TEAM_TABS[0];
  const total = q.trim() ? rows.length : active.count;

  return (
    <section className="rounded-2xl border border-v2-line bg-white p-4 shadow-[0_2px_14px_rgba(27,31,94,0.05)] md:p-5">
      <header className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[16px] text-v2-navy" style={{ fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
          Employees
        </h3>
        <div className="flex flex-wrap gap-2">
          <ToolbarButton solid icon={<PlusIcon size={14} />}>
            Add Employee
          </ToolbarButton>
          <ToolbarButton icon={<UploadIcon size={14} />}>Import CSV</ToolbarButton>
          <ToolbarButton icon={<UsersIcon size={14} />}>Bulk Assign</ToolbarButton>
        </div>
      </header>

      <PillTabs ariaLabel="Employee group" tabs={TEAM_TABS} value={tab} onChange={setTab} />

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <SearchInput
          placeholder="Search employees by name, role, or department..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          wrapperClassName="min-w-[220px] flex-[1_1_320px]"
        />
        <FilterSelect label="Department" options={["All Departments", "Engineering", "Product", "Design", "Data", "Marketing", "Sales"]} className="flex-1 sm:w-[160px] sm:flex-none" />
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
          aria-label="Employees"
          selectable
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          minWidth={760}
          empty="No employees match your filters."
        />
      </div>

      <Pagination
        tone="blue"
        className="pt-3.5"
        page={1}
        pages={Math.max(1, Math.ceil(total / 8))}
        summary={`Showing ${rows.length ? 1 : 0}–${rows.length} of ${total} employees`}
      />
    </section>
  );
}
