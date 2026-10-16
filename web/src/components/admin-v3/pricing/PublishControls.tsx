"use client";

import { useState } from "react";
import { Button, ClockIcon } from "@kiwiply/ui";
import { adminFetch } from "@/lib/admin-client";
import type { AdminHistoryRow, AdminResult } from "@/lib/admin-client";
import { failingChecks, type CatalogVersionRow, type Plan, type PlanVersion } from "@/lib/admin-plans";
import { HistoryDrawer } from "../common";
import type { PlanPreviewState } from "./usePlanPreview";
import PublishSheet from "./PublishSheet";

/** The publishes of THIS plan, newest first: one `catalog_publish` row per plan publish, its summary reads "Published PRO v3 (...)". */
export function publishHistoryLoader(planKey: string) {
  return async (limit: number): Promise<AdminResult<AdminHistoryRow[]>> => {
    const res = await adminFetch<CatalogVersionRow[]>("GET", "/catalog/versions");
    if (!res.ok) return res;
    const mine = res.data.filter((r) => (r.summary ?? "").toLowerCase().startsWith(`published ${planKey.toLowerCase()} v`));
    const rows: AdminHistoryRow[] = mine
      .sort((a, b) => b.version - a.version)
      .slice(0, limit)
      .map((r) => ({
        id: r.version,
        key: `PLAN_PUBLISHED · catalog v${r.version}`,
        oldValue: null,
        newValue: r.summary,
        actorLogin: r.publishedBy,
        reason: null,
        changedAt: r.publishedAt ?? new Date(0).toISOString(),
      }));
    return { ok: true, data: rows };
  };
}

/**
 * The header actions of the editor that touch publishing: History (the plan's publishes), the Stripe-off notice and `Publish…`.
 * The button shows how many checks fail; it opens the typed-confirm sheet. A published version has no Publish button.
 */
export default function PublishControls({
  plan,
  version,
  preview,
  onPublished,
}: {
  plan: Plan;
  version: PlanVersion;
  preview: PlanPreviewState;
  onPublished: (v: PlanVersion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(false);
  const isDraft = version.status === "DRAFT";
  const failing = failingChecks(preview.preview);
  const liveVersion = plan.versions.find((v) => v.status === "PUBLISHED")?.version ?? null;
  const stripeOff = preview.preview?.impact ? !preview.preview.impact.stripeEnabled : false;

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setHistory(true)} className="min-h-11 gap-1 sm:min-h-0">
        <ClockIcon size={14} /> History
      </Button>
      {isDraft && (
        <Button type="button" variant="primary" onClick={() => setOpen(true)} disabled={!preview.preview} className="min-h-11 sm:min-h-0" data-stripe-off={stripeOff || undefined}>
          Publish…{failing > 0 ? ` (${failing} failing)` : ""}
        </Button>
      )}
      <PublishSheet open={open} onClose={() => setOpen(false)} plan={plan} version={version} preview={preview.preview} liveVersion={liveVersion} onPublished={onPublished} />
      <HistoryDrawer
        open={history}
        onClose={() => setHistory(false)}
        load={publishHistoryLoader(plan.planKey)}
        id="plan-history-drawer"
        title={`${plan.name} history`}
        description="Each publish of this plan: the catalog version it created, who published it and when."
        formatKey={(k) => k}
        emptyTitle="Never published"
        emptyDescription="A publish shows up here as PLAN_PUBLISHED."
        what="the plan history"
        events
      />
    </>
  );
}
