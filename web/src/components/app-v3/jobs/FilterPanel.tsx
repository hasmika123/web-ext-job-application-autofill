"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import {
  JOB_TYPES,
  TYPE_LABELS,
  WORKPLACES,
  WORKPLACE_LABELS,
  postedLabel,
  type JobFacets,
  type JobFilters,
  type JobTypeValue,
  type Workplace,
} from "@/lib/jobs";

/** How long typing in a text filter waits before the search runs. */
const TEXT_DEBOUNCE_MS = 450; // config-literal-ok: UI typing delay, not a product limit

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-v2-line/70 pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-2 text-[13.5px] font-bold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

function Choice({
  type,
  name,
  checked,
  onChange,
  count,
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  checked: boolean;
  onChange: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 py-0.5 text-[14px] text-ink-soft hover:text-ink sm:min-h-9">
      <input type={type} name={name} checked={checked} onChange={onChange} className="h-4 w-4 flex-none cursor-pointer accent-[#1E6FF5]" />
      <span className="min-w-0 flex-1">{children}</span>
      {count !== undefined && <span className="flex-none text-[12.5px] tabular-nums text-v2-muted">{count.toLocaleString("en-US")}</span>}
    </label>
  );
}

/** A text filter that tells the page after you pause typing (or press Enter / leave the field). */
function TextFilter({ value, onCommit, label, placeholder }: { value: string; onCommit: (v: string) => void; label: string; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  const last = useRef(value);
  // Follow the page when it changes the value itself (Clear all, a suggestion).
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setDraft(value);
    }
  }, [value]);
  useEffect(() => {
    if (draft === last.current) return;
    const t = setTimeout(() => {
      last.current = draft;
      onCommit(draft);
    }, TEXT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, onCommit]);
  const commit = () => {
    if (draft !== last.current) {
      last.current = draft;
      onCommit(draft);
    }
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      placeholder={placeholder}
      aria-label={label}
      maxLength={80}
      className="h-11 w-full rounded-xl border border-v2-line bg-paper px-3 text-[14px] text-ink outline-none placeholder:text-v2-muted focus-visible:ring-2 focus-visible:ring-v2-blue/25 sm:h-10"
    />
  );
}

/**
 * The search filters (U4.3): where it is worked, job type, how recently it was posted, a place and a company. One panel,
 * two homes: the desktop rail and the phone's bottom sheet. Counts come from the server's facets (each ignores its own
 * filter, so the alternatives stay visible); nothing here invents a number.
 */
export default function FilterPanel({
  filters,
  facets,
  onChange,
  onClear,
  heading = true,
  className,
}: {
  filters: JobFilters;
  facets: JobFacets | undefined;
  onChange: (patch: Partial<JobFilters>) => void;
  onClear: () => void;
  /** Show the "Filters" title (the sheet already has one in its header). */
  heading?: boolean;
  className?: string;
}) {
  const buckets = facets ? Object.keys(facets.postedBuckets).sort((a, b) => Number(a) - Number(b)) : [];
  const toggleType = (t: JobTypeValue) =>
    onChange({ types: filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t] });
  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className={cn("flex items-center", heading ? "justify-between" : "justify-end")}>
        {heading && <h2 className="font-display text-[16px] font-bold! tracking-normal! text-ink">Filters</h2>}
        <button type="button" onClick={onClear} className="min-h-11 text-[13px] font-semibold text-v2-blue-ink hover:underline sm:min-h-0">
          Clear all
        </button>
      </div>

      <Group title="Workplace">
        <Choice type="radio" name="workplace" checked={filters.remote === ""} onChange={() => onChange({ remote: "" })}>
          Any
        </Choice>
        {WORKPLACES.map((w: Workplace) => (
          <Choice key={w} type="radio" name="workplace" checked={filters.remote === w} onChange={() => onChange({ remote: w })} count={facets?.remote[w]}>
            {WORKPLACE_LABELS[w]}
          </Choice>
        ))}
      </Group>

      <Group title="Job type">
        {JOB_TYPES.map((t) => (
          <Choice key={t} type="checkbox" name={`type-${t}`} checked={filters.types.includes(t)} onChange={() => toggleType(t)} count={facets?.type[t]}>
            {TYPE_LABELS[t]}
          </Choice>
        ))}
      </Group>

      <Group title="Posted">
        <Choice type="radio" name="posted" checked={filters.posted === ""} onChange={() => onChange({ posted: "" })}>
          Any time
        </Choice>
        {buckets.map((d) => (
          <Choice key={d} type="radio" name="posted" checked={filters.posted === d} onChange={() => onChange({ posted: d })} count={facets?.postedBuckets[d]}>
            {postedLabel(Number(d))}
          </Choice>
        ))}
      </Group>

      <Group title="Location">
        <TextFilter value={filters.loc} onCommit={(v) => onChange({ loc: v.trim() })} label="Filter by city or state" placeholder="City, state or country" />
      </Group>

      <Group title="Company">
        <TextFilter value={filters.company} onCommit={(v) => onChange({ company: v.trim() })} label="Filter by company" placeholder="Company name" />
      </Group>
    </div>
  );
}
