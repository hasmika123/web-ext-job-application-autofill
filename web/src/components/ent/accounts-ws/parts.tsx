"use client";

import type { ReactNode } from "react";
import { PRIORITY_TONE, STATUS_TONE, priorityLabel, statusLabel } from "@/lib/ent/accounts-ws/requirements";

/**
 * Small pieces shared by the Account Manager pages (Home, Requirements, Contacts). The cards, tiles and card headers are the Marketing boards'
 * (`../marketer-ws/parts`), so the workspaces stay one design; only what is specific to a requirement lives here.
 */

export interface AccountsPageProps {
  orgId: number;
  orgName: string;
  firstName: string;
  /** Menu hrefs of this member's Accounts workspace by nav key (`home`, `clients`, `contacts`, `requirements`, ...); null/absent hides a link. */
  hrefs: Record<string, string | null>;
  selfMemberId?: number | null;
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span data-req-status={status} className="ent-pill ent-pill-lg justify-center" data-tone={STATUS_TONE[status] ?? "grey"} data-shape="round">
      {statusLabel(status)}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: string }) {
  return (
    <span data-req-priority={priority} className="ent-pill justify-center" data-tone={PRIORITY_TONE[priority] ?? "grey"} data-shape="round">
      {priorityLabel(priority)}
    </span>
  );
}

/** A labelled fact of the detail drawer. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] font-semibold leading-snug text-ink">{children}</dd>
    </div>
  );
}
