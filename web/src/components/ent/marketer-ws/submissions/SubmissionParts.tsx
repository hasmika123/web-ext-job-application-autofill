"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  CalendarIcon, CheckCircleIcon, CheckIcon, ChevronRightIcon, ClockIcon, ChevronLeftIcon, DonutChart, FileTextIcon, Select, SendIcon, SparklesIcon, UsersIcon, XCircleIcon, chartColor, cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { openHelpPanel } from "@/components/ent/shell/ShellContext";
import { relativeTime } from "@/lib/ent/dashboard";
import {
  APPROVAL_LABELS, BUCKET_LABELS, HELP_BANNER, PAGE_SIZES, PERIODS, STATUS_LABELS, logoFor, pageWindow,
  type ActivityKind, type ActivityRow, type ApprovalState, type Breakdown, type BucketKey, type SubStatus,
} from "@/lib/ent/marketer-ws/submissions";
import { VIEW_ALL } from "../parts";

/** Chips, side cards and the pager of the Submissions board. Colours are tenant tokens only. */

const CHIP = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] font-semibold";
const TONE = {
  green: "bg-v2-green-soft text-v2-green-ink",
  amber: "bg-v2-amber-soft text-v2-amber-ink",
  pink: "bg-v2-pink-soft text-v2-pink-ink",
  violet: "bg-v2-violet-soft text-v2-violet-ink",
  blue: "bg-accent-soft text-accent-deep",
  grey: "bg-paper-2 text-ink-soft",
} as const;

const APPROVAL_CHIP: Record<ApprovalState, { icon: ComponentType<IconProps>; tone: keyof typeof TONE; label: string }> = {
  APPROVED: { icon: CheckCircleIcon, tone: "green", label: APPROVAL_LABELS.APPROVED },
  AWAITING_APPROVAL: { icon: ClockIcon, tone: "amber", label: APPROVAL_LABELS.AWAITING_APPROVAL },
  REJECTED: { icon: XCircleIcon, tone: "pink", label: APPROVAL_LABELS.REJECTED },
  DRAFT: { icon: FileTextIcon, tone: "grey", label: "Not Requested" },
};
const STATUS_CHIP: Record<SubStatus, { icon: ComponentType<IconProps>; tone: keyof typeof TONE }> = {
  SUBMITTED: { icon: SendIcon, tone: "blue" },
  DRAFT: { icon: FileTextIcon, tone: "grey" },
  CLIENT_REVIEW: { icon: UsersIcon, tone: "violet" },
  INTERVIEW_REQUESTED: { icon: CalendarIcon, tone: "amber" },
  REJECTED: { icon: XCircleIcon, tone: "pink" },
};

export function ApprovalChip({ state }: { state: ApprovalState }) {
  const c = APPROVAL_CHIP[state];
  const Icon = c.icon;
  return (
    <span data-approval-chip={state} className={cn(CHIP, TONE[c.tone])}>
      <Icon size={14} aria-hidden />
      {c.label}
    </span>
  );
}

export function StatusChip({ status }: { status: SubStatus }) {
  const c = STATUS_CHIP[status];
  const Icon = c.icon;
  return (
    <span data-status-chip={status} className={cn(CHIP, TONE[c.tone])}>
      <Icon size={14} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** The client's logo cropped from the board when we have it, else a letter tile. */
export function ClientLogo({ name }: { name: string }) {
  const src = logoFor(name);
  // eslint-disable-next-line @next/next/no-img-element -- the approved board art, served as is
  if (src) return <img src={src} alt="" aria-hidden width={24} height={24} className="h-6 w-6 flex-none object-contain" />;
  return (
    <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-md bg-accent-soft text-[12px] font-bold text-accent-deep">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** The bee help card of the board ("Need help with submissions?"): banner cropped from the board, copy, "Ask a question" opens the shared help panel. */
export function SubmissionsHelpCard() {
  return (
    <section aria-label="Help" data-submissions-card="help" className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper">
      {/* eslint-disable-next-line @next/next/no-img-element -- the approved board art, served as is */}
      <img src={HELP_BANNER} alt="" className="block w-full object-cover" />
      <div className="p-4">
        <h2 className="text-[19px] font-extrabold leading-tight text-ink">Need help with submissions?</h2>
        <p className="mt-1.5 text-[13.5px] leading-snug text-muted">
          Get the right consultant profiles to the right opportunities. I can help you create submissions, track status, and follow up.
        </p>
        <button
          type="button"
          onClick={openHelpPanel}
          className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft/70"
        >
          <SparklesIcon size={17} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">Ask a question</span>
          <ChevronRightIcon size={16} className="flex-none" />
        </button>
      </div>
    </section>
  );
}

const ACTIVITY_ICON: Record<ActivityKind, { icon: ComponentType<IconProps>; tone: keyof typeof TONE }> = {
  SUBMITTED: { icon: SendIcon, tone: "green" },
  CLIENT_REVIEW: { icon: UsersIcon, tone: "violet" },
  INTERVIEW: { icon: CalendarIcon, tone: "amber" },
  REJECTED: { icon: XCircleIcon, tone: "pink" },
  APPROVAL: { icon: CheckIcon, tone: "blue" },
  DRAFT: { icon: FileTextIcon, tone: "grey" },
};

export function ActivityCard({ rows, viewAll, loading, now }: { rows: ActivityRow[]; viewAll: string | null; loading: boolean; now: number }) {
  return (
    <section data-submissions-card="activity" className="min-w-0 rounded-[var(--radius-lg)] border border-line bg-paper p-4">
      <header className="mb-3 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[16.5px] font-bold text-ink">Recent Submission Activity</h2>
        {viewAll ? (
          <Link href={viewAll} className={VIEW_ALL}>
            View all
          </Link>
        ) : null}
      </header>
      {loading ? (
        <div aria-busy="true" className="py-6 text-center text-[13.5px] text-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[13.5px] text-muted">Nothing recorded yet.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((a) => {
            const i = ACTIVITY_ICON[a.kind];
            const Icon = i.icon;
            return (
              <li key={a.id} data-activity-row={a.id} className="flex items-start gap-2.5 border-b border-line py-2.5 last:border-0">
                <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-full", TONE[i.tone])}>
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold leading-snug text-ink">{a.text}</span>
                  {a.detail ? <span className="block truncate text-[12.5px] text-muted">{a.detail}</span> : null}
                  <span className="block text-[12.5px] text-muted">{relativeTime(a.at, now)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Donut slice colours: tenant/status CSS variables, never hex. */
const SLICE_COLOR: Record<BucketKey, string> = {
  DRAFT: "var(--color-v2-muted)",
  AWAITING_APPROVAL: "var(--color-v2-amber)",
  SUBMITTED: chartColor(0),
  CLIENT_REVIEW: "var(--color-v2-violet)",
  INTERVIEW_REQUESTED: "var(--color-v2-coral)",
  REJECTED: "var(--color-v2-danger-text)",
};

export function StatusDonutCard({ breakdown, loading, period, onPeriod }: { breakdown: Breakdown | null; loading: boolean; period: string; onPeriod: (p: string) => void }) {
  return (
    <section data-submissions-card="status" className="min-w-0 rounded-[var(--radius-lg)] border border-line bg-paper p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[16.5px] font-bold text-ink">Submissions by Status</h2>
        <Select variant="pill" aria-label="Submissions by status period" value={period} onChange={onPeriod} options={PERIODS} />
      </header>
      {loading ? (
        <div aria-busy="true" className="py-8 text-center text-[13.5px] text-muted">Loading…</div>
      ) : !breakdown || breakdown.total === 0 ? (
        <p className="py-6 text-center text-[13.5px] text-muted">Nothing recorded yet.</p>
      ) : (
        <DonutChart
          label="Submissions by status"
          total={breakdown.total}
          totalLabel="Total"
          size={112}
          className="gap-x-3"
          slices={breakdown.buckets.map((b) => ({ key: b.key, label: BUCKET_LABELS[b.key], value: b.count, color: SLICE_COLOR[b.key] }))}
        />
      )}
    </section>
  );
}

const PAGE_BTN = "grid h-8 min-w-8 place-items-center rounded-md border border-line bg-paper px-2 text-[13px] font-semibold text-ink-soft hover:bg-paper-2 disabled:pointer-events-none disabled:opacity-50";

/** "Showing 1–10 of 86 submissions", « 1 2 3 4 5 … 9 », "Rows per page 10". */
export function Pager({ page, size, total, onPage, onSize }: { page: number; size: number; total: number; onPage: (p: number) => void; onSize: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <p data-showing className="text-[13px] text-ink-soft">
        Showing {from}–{to} of {total.toLocaleString("en-US")} submissions
      </p>
      <nav aria-label="Pages" className="flex items-center gap-1.5">
        <button type="button" aria-label="Previous page" className={PAGE_BTN} disabled={page <= 0} onClick={() => onPage(page - 1)}>
          <ChevronLeftIcon size={15} />
        </button>
        {pageWindow(page, pages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} aria-hidden className="px-1 text-[13px] text-muted">…</span>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={`Page ${p + 1}`}
              aria-current={p === page ? "page" : undefined}
              className={cn(PAGE_BTN, p === page && "border-accent bg-accent text-on-accent hover:bg-accent")}
              onClick={() => onPage(p)}
            >
              {p + 1}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" className={PAGE_BTN} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          <ChevronRightIcon size={15} />
        </button>
      </nav>
      <label className="flex items-center gap-2 text-[13px] text-ink-soft">
        <span>Rows per page</span>
        <Select variant="pill" aria-label="Rows per page" value={String(size)} onChange={(v) => onSize(Number(v))} options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))} />
      </label>
    </footer>
  );
}

export const SectionNote = ({ children }: { children: ReactNode }) => <p className="py-8 text-center text-[13.5px] text-muted">{children}</p>;
