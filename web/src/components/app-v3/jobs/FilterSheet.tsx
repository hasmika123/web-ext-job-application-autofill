"use client";

import type { RefObject } from "react";
import { BottomSheet, Button } from "@kiwiply/ui";
import type { JobFacets, JobFilters } from "@/lib/jobs";
import FilterPanel from "./FilterPanel";

/**
 * The phone's filters: a bottom sheet over the results (the desktop shows the same panel as a rail). Filters apply as
 * you set them, so the one button is "Show N jobs", not a Save: it just closes the sheet.
 */
export default function FilterSheet({
  open,
  onClose,
  filters,
  facets,
  total,
  onChange,
  onClear,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  filters: JobFilters;
  facets: JobFacets | undefined;
  total: number;
  onChange: (patch: Partial<JobFilters>) => void;
  onClear: () => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  return (
    <BottomSheet
      id="job-filters"
      open={open}
      title="Filters"
      description="The list updates as you choose."
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      footer={
        <Button type="button" className="w-full" onClick={onClose}>
          {total === 1 ? "Show 1 job" : `Show ${total.toLocaleString("en-US")} jobs`}
        </Button>
      }
    >
      <FilterPanel filters={filters} facets={facets} onChange={onChange} onClear={onClear} heading={false} className="px-1 pb-2" />
    </BottomSheet>
  );
}
