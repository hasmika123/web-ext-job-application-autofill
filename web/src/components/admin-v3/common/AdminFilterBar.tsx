"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Select, cn } from "@kiwiply/ui";
import { SearchInput } from "@/components/app-v2/common";
import type { FilterValue, Filters } from "@/lib/list-query";

/**
 * AdminFilterBar: a search box and a row of dropdown filters bound to a `useListQuery` result (E2E-A15.0;
 * ADMIN-E2E-PLAN section 3.6). Everything it changes is server-driven and URL-synced by the hook, so a filtered view is a
 * link. It never filters the loaded page itself (the old admin tables did, and lied about what existed).
 *
 *   const list = useListQuery<UserRow>("/api/admin/users", { filters: { role: undefined, plan: undefined } });
 *   <AdminFilterBar list={list} search={{ placeholder: "Search name, login or email" }}
 *                   filters={[{ name: "plan", label: "Plan", options: [{ value: "PRO", label: "Pro" }] }]} />
 *
 * Typing is debounced (`SEARCH_DEBOUNCE_MS`) and Enter sends it at once; Esc clears the box. "Clear" appears only while
 * something is applied.
 */

export const SEARCH_DEBOUNCE_MS = 300; // config-literal-ok: how long typing rests before the list is asked (UI timing)

export interface FilterDef {
  /** The filter's name on the wire (`?plan=PRO`). */
  name: string;
  /** "Plan": the accessible name, and the text of the "no filter" option unless `allLabel` is given. */
  label: string;
  options: { value: string; label: string }[];
  /** The first option, meaning "no filter" (default `Any {label}`: "Any plan"). */
  allLabel?: string;
}

/** The slice of a `useListQuery` result the bar reads and writes. */
export interface FilterableList {
  q: string;
  filters: Filters;
  setQuery(q: string): void;
  setFilter(name: string, value: FilterValue): void;
}

export interface AdminFilterBarProps {
  list: FilterableList;
  /** The search box; `false` for a bar of filters only. */
  search?: { placeholder?: string; label?: string } | false;
  filters?: FilterDef[];
  /** Extra controls at the end of the row (an export button, a view switch). */
  actions?: ReactNode;
  className?: string;
}

function current(v: FilterValue): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/** True while any search text or filter is applied (the AdminTable's "no matches" copy and Clear button key off it). */
export function hasActiveFilters(list: Pick<FilterableList, "q" | "filters">): boolean {
  return list.q.trim() !== "" || Object.values(list.filters).some((v) => current(v) !== "");
}

/** Resets the search and every filter. */
export function clearFilters(list: FilterableList): void {
  list.setQuery("");
  for (const name of Object.keys(list.filters)) list.setFilter(name, "");
}

export default function AdminFilterBar({ list, search = {}, filters = [], actions, className }: AdminFilterBarProps) {
  const [text, setText] = useState(list.q);
  // The last value this bar sent to the list: a `q` that differs came from outside (the URL on load, a Clear).
  const sent = useRef(list.q);

  useEffect(() => {
    if (list.q !== sent.current) {
      sent.current = list.q;
      setText(list.q);
    }
  }, [list.q]);

  useEffect(() => {
    if (text === sent.current) return;
    const timer = setTimeout(() => {
      if (text === sent.current) return; // Enter already sent it
      sent.current = text;
      list.setQuery(text);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `list.setQuery` is stable (useCallback in the hook); the timer restarts on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function sendNow() {
    if (text === sent.current) return;
    sent.current = text;
    list.setQuery(text);
  }

  const active = hasActiveFilters(list) || text.trim() !== "";
  return (
    <div role="search" className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {search !== false && (
        <SearchInput
          variant="grey"
          size="sm"
          value={text}
          placeholder={search.placeholder ?? "Search"}
          aria-label={search.label ?? search.placeholder ?? "Search"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sendNow();
            } else if (e.key === "Escape" && text !== "") {
              setText("");
            }
          }}
          wrapperClassName="w-full min-w-0 sm:w-72 sm:flex-none"
        />
      )}
      {filters.map((f) => (
        <div key={f.name} className="min-w-0 flex-1 basis-[calc(50%-0.3rem)] sm:w-44 sm:flex-none sm:basis-auto">
          <Select
            aria-label={f.label}
            value={current(list.filters[f.name])}
            onChange={(v) => list.setFilter(f.name, v)}
            options={[{ value: "", label: f.allLabel ?? `Any ${f.label.toLowerCase()}` }, ...f.options]}
          />
        </div>
      ))}
      {active && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 sm:min-h-0"
          onClick={() => {
            setText("");
            sent.current = "";
            clearFilters(list);
          }}
        >
          Clear filters
        </Button>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
