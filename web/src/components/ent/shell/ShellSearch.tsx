"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, cn } from "@kiwiply/ui";
import type { MeTenant } from "@/lib/ent/workspaces";
import { searchPages } from "@/lib/ent/shell";

export const SEARCH_PLACEHOLDER = "Search people, applications, jobs, clients, and more...";
/** Said out loud in the results: the people / application / job / client search API is a later story. */
export const SEARCH_HONESTY = "Showing pages you can open. Searching people, applications, jobs and clients is coming soon.";

/**
 * The global search box (16 s2.1). Command-palette behaviour over the member's permitted menu pages for now: type, arrow keys,
 * Enter to go, Esc to close. The placeholder is the board's; the results footer is honest about what is searched today.
 */
export default function ShellSearch({
  me,
  inputId,
  autoFocus,
  onDone,
  className,
}: {
  me: MeTenant;
  inputId?: string;
  autoFocus?: boolean;
  /** Called after a result is chosen or Esc closes it (the phone overlay closes itself). */
  onDone?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const hits = useMemo(() => searchPages(me, q), [me, q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
    onDone?.();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setIndex((i) => (hits.length ? (i + 1) % hits.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0));
    } else if (e.key === "Enter") {
      const hit = hits[index];
      if (open && hit) {
        e.preventDefault();
        go(hit.href);
      }
    } else if (e.key === "Escape") {
      if (open) e.stopPropagation();
      setOpen(false);
      onDone?.();
    }
  };

  const active = hits[index];
  return (
    <div ref={root} className={cn("relative w-full", className)} data-shell-search>
      <div className="flex h-12 items-center gap-2.5 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft/40 px-3.5 transition-colors focus-within:border-accent focus-within:bg-paper">
        <SearchIcon size={18} className="flex-none text-accent" />
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-label="Search"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active ? `${listId}-${index}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={SEARCH_PLACEHOLDER}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-soft focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="hidden flex-none rounded-md border border-line bg-paper px-1.5 py-0.5 font-body text-[11px] font-semibold text-muted 2xl:inline">Ctrl K</kbd>
      </div>
      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-line bg-paper shadow-[var(--shadow-lg,0_12px_40px_rgb(0_0_0/0.14))]">
          <ul id={listId} role="listbox" aria-label="Pages" className="max-h-72 overflow-y-auto scroll-slim p-1.5">
            {hits.length === 0 ? (
              <li role="presentation" className="px-3 py-4 text-center text-[13px] text-muted">
                No page matches &ldquo;{q}&rdquo;.
              </li>
            ) : (
              hits.map((h, i) => (
                <li
                  key={h.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(h.href)}
                  className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-[14px]", i === index ? "bg-accent-soft text-accent-deep" : "text-ink")}
                >
                  <span className="truncate font-medium">{h.label}</span>
                  <span className="flex-none text-[12px] text-muted">{h.workspace}</span>
                </li>
              ))
            )}
          </ul>
          <p data-search-note className="border-t border-line bg-paper-2 px-3 py-2 text-[12px] leading-snug text-muted">
            {SEARCH_HONESTY}
          </p>
        </div>
      ) : null}
    </div>
  );
}
