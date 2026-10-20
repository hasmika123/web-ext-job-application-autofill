"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { MoreVerticalIcon, cn } from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { CARD, CardHead, type IconTone } from "@/components/ent/dashboard/parts";
import { initialsOf, type Tone } from "@/lib/ent/consultant-ws/home";

/**
 * The Consultant workspace's shared page pieces (extracted from the Home page so every consultant page looks the same):
 * pills, the "Sample" marker, cards, empty text, company marks, table pieces and the data hook.
 * Add to this file only by ADDING exports; do not change what a page already relies on.
 */

export const REVALIDATE_MS = 30_000;

export const PILL: Record<Tone, string> = {
  green: "bg-v2-green-soft text-v2-green-ink",
  amber: "bg-v2-amber-soft text-v2-amber-ink",
  blue: "bg-accent-soft text-accent-deep",
  red: "bg-v2-coral-soft text-v2-coral-ink",
  violet: "bg-v2-violet-soft text-v2-violet-ink",
  slate: "bg-paper-2 text-ink-soft",
};

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex min-h-6 items-center whitespace-nowrap rounded-md px-2 text-[12px] font-semibold", PILL[tone], className)}>{children}</span>;
}

export function SampleMark() {
  return (
    <span data-sample className="rounded-md bg-paper-2 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted" title="Placeholder until this module is connected">
      Sample
    </span>
  );
}

export const BASE = "/w/consultant";

/* -- data hook: one call per page, revalidated when the tab regains focus (at most every 30 s) -- */

export type Status = "loading" | "ready" | "failed" | "denied";
export interface Fetched<T> {
  kind: "OK" | "DENIED" | "FAILED";
  view?: T;
}

/** `fetcher` must be stable (wrap it in useCallback keyed by the ids it uses). */
export function useWorkspaceData<T>(fetcher: () => Promise<Fetched<T>>) {
  const [view, setView] = useState<T | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const last = useRef(0);
  const inflight = useRef(false);
  const queued = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (inflight.current) {
      queued.current = true; // a filter changed while a load was running: run again with the latest fetcher when it ends
      return;
    }
    inflight.current = true;
    const r = await fetcher();
    inflight.current = false;
    last.current = Date.now();
    if (r.kind === "OK" && r.view) {
      setView(r.view);
      setStatus("ready");
    } else if (r.kind === "DENIED") setStatus("denied");
    else setStatus((s) => (s === "ready" ? s : "failed")); // a failed refresh keeps what is on screen
    if (queued.current) {
      queued.current = false;
      void loadRef.current();
    }
  }, [fetcher]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > REVALIDATE_MS) void load();
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [load]);

  return { view, status, reload: load, setView };
}

export function Card({ id, title, icon, tone = "accent", viewAll, extra, children, className }: { id: string; title: string; icon: ComponentType<IconProps>; tone?: IconTone; viewAll?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} data-home-card={id} className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5", className)}>
      <CardHead id={id} icon={icon} title={title} tone={tone}>
        {extra}
        {viewAll ? (
          <Link href={viewAll} className="flex-none text-[13px] font-semibold text-accent-deep hover:underline">
            View All
          </Link>
        ) : null}
      </CardHead>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-[13.5px] text-muted">{children}</p>;

export function CompanyMark({ name, tone = 0 }: { name: string | null; tone?: number }) {
  const colors = ["bg-accent-soft text-accent-deep", "bg-v2-violet-soft text-v2-violet-ink", "bg-v2-amber-soft text-v2-amber-ink", "bg-v2-green-soft text-v2-green-ink", "bg-v2-pink-soft text-v2-pink-ink", "bg-v2-teal-soft text-v2-teal-ink"];
  const i = name ? [...name].reduce((a, ch) => a + ch.charCodeAt(0), tone) % colors.length : 0;
  return (
    <span aria-hidden className={cn("grid h-6 w-6 flex-none place-items-center rounded-md text-[10px] font-bold", colors[i])}>
      {initialsOf(name)}
    </span>
  );
}

export const ViewButton = ({ href, label }: { href: string; label: string }) => (
  <Link href={href} aria-label={label} className="inline-flex min-h-8 items-center rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
    View
  </Link>
);

export const MoreButton = ({ label }: { label: string }) => (
  <button type="button" aria-label={label} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
    <MoreVerticalIcon size={16} />
  </button>
);

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

export function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="text-left text-[12px] font-semibold text-muted">
        {cols.map((c, i) => (
          <th key={`${c}-${i}`} scope="col" className="whitespace-nowrap bg-paper-2/60 px-2.5 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg">
            {c || <span className="sr-only">Actions</span>}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export const TD = "px-2 py-2.5 align-middle text-[13px] text-ink";
export const TABLE = "w-full border-collapse";
