"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Input, MemberAvatar, SEARCH_DEBOUNCE_MS, SearchIcon, Select, StatePill, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { PRIORITY_LABEL, STATUS_LABEL, type Person } from "@/lib/ent/marketing-assignments";

/** One chip for the assignment status and one for the priority (the StatePill's tones: green, amber, red, grey). */
if (!hasStateMap("assignment")) registerStateMap("assignment", { ACTIVE: "green", PAUSED: "grey" });
if (!hasStateMap("assignment-priority")) registerStateMap("assignment-priority", { HIGH: "red", MEDIUM: "amber", LOW: "grey" });

export function AssignmentStatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted">{"—"}</span>;
  return <StatePill domain="assignment" state={status} label={STATUS_LABEL[status] ?? status} />;
}

export function PriorityPill({ priority }: { priority: string | null }) {
  if (!priority) return <span className="text-muted">{"—"}</span>;
  return <StatePill domain="assignment-priority" state={priority} label={PRIORITY_LABEL[priority] ?? priority} />;
}

/** A marketer as an initials circle and a name; none reads as a dash (never a made-up face: the platform keeps no photos). */
export function PersonChip({ person, size = 22, none = "—" }: { person: Person | null; size?: number; none?: string }) {
  if (!person) return <span className="text-muted">{none}</span>;
  return (
    <span className="flex min-w-0 max-w-[8.5rem] items-center gap-1.5" title={person.name}>
      <MemberAvatar name={person.name} size={size} />
      <span className="truncate text-[12.5px] text-ink">{person.name}</span>
    </span>
  );
}

/**
 * A search box and a row of dropdown filters that fits a half-width panel: the search takes what is left, each dropdown is narrow, and
 * the row wraps only when it must. Typing rests 300 ms before the list is asked; "Clear filters" shows only while something is applied.
 */
export function CompactFilters({
  query,
  onQuery,
  placeholder,
  label,
  filters,
  values,
  onFilter,
  actions,
  active,
  onClear,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  label: string;
  filters: { name: string; label: string; allLabel: string; options: { value: string; label: string }[] }[];
  values: Record<string, string>;
  onFilter: (name: string, value: string) => void;
  actions?: ReactNode;
  active: boolean;
  onClear: () => void;
}) {
  const [text, setText] = useState(query);
  const sent = useRef(query);
  useEffect(() => {
    if (query !== sent.current) {
      sent.current = query;
      setText(query);
    }
  }, [query]);
  useEffect(() => {
    if (text === sent.current) return;
    const t = setTimeout(() => {
      sent.current = text;
      onQuery(text);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[9rem] flex-1">
        <SearchIcon aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          value={text}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sent.current = text;
              onQuery(text);
            } else if (e.key === "Escape" && text !== "") setText("");
          }}
          className="pl-9"
        />
      </div>
      {filters.map((f) => (
        <div key={f.name} className="w-[7.75rem] flex-none">
          <Select aria-label={f.label} value={values[f.name] ?? ""} onChange={(v) => onFilter(f.name, v)} options={[{ value: "", label: f.allLabel }, ...f.options]} />
        </div>
      ))}
      {actions}
      {active && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** The checkbox of the table and the pickers: a real input, 44 px tap target through its padding on a phone. */
export function Check({ checked, indeterminate, onChange, label, disabled }: { checked: boolean; indeterminate?: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded border-line accent-[var(--brand-primary,var(--color-accent))] disabled:cursor-not-allowed"
    />
  );
}
