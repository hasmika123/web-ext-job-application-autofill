"use client";

import type { ComponentType, ReactNode } from "react";
import {
  CalendarIcon, CheckCircleIcon, ClockIcon, ChevronLeftIcon, ChevronRightIcon, FileTextIcon, Select, SendIcon, UsersIcon, XCircleIcon, cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import {
  APPROVAL_LABELS, PAGE_SIZES, STATUS_LABELS, logoFor, pageWindow,
  type ApprovalState, type SubStatus,
} from "@/lib/ent/marketer-ws/submissions";

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
const PAGE_BTN = "grid h-8 min-w-8 place-items-center rounded-md border border-line bg-paper px-2 text-[13px] font-semibold text-ink-soft hover:bg-paper-2 disabled:pointer-events-none disabled:opacity-50";

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
