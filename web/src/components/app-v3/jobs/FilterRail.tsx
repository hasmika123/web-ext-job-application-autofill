"use client";

import type { ReactNode } from "react";
import { SearchIcon, cn } from "@kiwiply/ui";
import { CompanyTile } from "@/components/app-v2/common";
import { JOB_LEVELS, JOB_SALARY_MAX_K, JOB_TYPES, type JobLevel, type JobType } from "@/components/app-v3/sample-data";
import type { Filters } from "./filter";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-v2-line/70 pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-2.5 text-[13.5px] font-bold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1 text-[13.5px] text-ink-soft hover:text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 flex-none cursor-pointer rounded accent-[#1E6FF5]"
      />
      {children}
    </label>
  );
}

function toggle<T>(list: T[], v: T, on: boolean): T[] {
  return on ? (list.includes(v) ? list : [...list, v]) : list.filter((x) => x !== v);
}

/**
 * The Job Search filter rail (APP-V3-SPEC 2.2): Location, Job Type, Salary Range, Experience Level,
 * Company and "Clear all". Controlled by the page; every control filters the list in hand.
 */
export default function FilterRail({
  filters,
  onChange,
  companies,
  onClear,
  className,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  companies: string[];
  onClear: () => void;
  className?: string;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const input =
    "h-10 w-full rounded-xl border border-v2-line bg-paper px-3 text-[13.5px] text-ink outline-none placeholder:text-v2-muted focus-visible:ring-2 focus-visible:ring-v2-blue/25";
  return (
    <aside
      aria-label="Filters"
      className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft", className)}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[16px] font-bold! tracking-normal! text-ink">Filters</h2>
        <button type="button" onClick={onClear} className="text-[12.5px] font-semibold text-v2-blue-ink hover:underline">
          Clear all
        </button>
      </div>

      <Group title="Location">
        <Check checked={filters.remote} onChange={(v) => set({ remote: v })}>Remote</Check>
        <Check checked={filters.us} onChange={(v) => set({ us: v })}>United States</Check>
        <Check checked={filters.other} onChange={(v) => set({ other: v })}>Other locations</Check>
        <input
          value={filters.location}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="City or state"
          aria-label="Filter by city or state"
          className={cn(input, "mt-2")}
        />
      </Group>

      <Group title="Job Type">
        {JOB_TYPES.map((t: JobType) => (
          <Check key={t} checked={filters.types.includes(t)} onChange={(v) => set({ types: toggle(filters.types, t, v) })}>
            {t}
          </Check>
        ))}
      </Group>

      <Group title="Salary Range">
        <input
          type="range"
          min={0}
          max={JOB_SALARY_MAX_K}
          step={10}
          value={filters.minSalaryK}
          onChange={(e) => set({ minSalaryK: Number(e.target.value) })}
          aria-label="Minimum salary in thousands of dollars"
          className="w-full cursor-pointer accent-[#1E6FF5]"
        />
        <div className="mt-1 flex justify-between text-[12.5px] text-v2-muted">
          <span>${filters.minSalaryK}k</span>
          <span>${JOB_SALARY_MAX_K}k+</span>
        </div>
      </Group>

      <Group title="Experience Level">
        {JOB_LEVELS.map((l: JobLevel) => (
          <Check key={l} checked={filters.levels.includes(l)} onChange={(v) => set({ levels: toggle(filters.levels, l, v) })}>
            {l}
          </Check>
        ))}
      </Group>

      <Group title="Company">
        <label className="relative mb-1.5 block">
          <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-v2-muted" />
          <input
            value={filters.companyQuery}
            onChange={(e) => set({ companyQuery: e.target.value })}
            placeholder="Search companies"
            aria-label="Search companies"
            className={cn(input, "pl-9")}
          />
        </label>
        {companies.map((c) => (
          <Check key={c} checked={filters.companies.includes(c)} onChange={(v) => set({ companies: toggle(filters.companies, c, v) })}>
            <CompanyTile name={c} size={22} className="rounded-md" />
            {c}
          </Check>
        ))}
      </Group>
    </aside>
  );
}
