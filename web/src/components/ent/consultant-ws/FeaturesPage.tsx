"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRightIcon,
  ErrorState,
  FileTextIcon,
  FilterIcon,
  GearIcon,
  MailIcon,
  MessageIcon,
  Menu,
  MoreVerticalIcon,
  ProgressBar,
  SearchIcon,
  Skeleton,
  SparklesIcon,
  VideoIcon,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES } from "@/components/ent/dashboard/parts";
import { BASE, Card, Empty, Pill, SampleMark, TABLE, TD, TableHead, useWorkspaceData } from "./parts";
import {
  FILTERS,
  STATUS_PILL,
  allowanceText,
  fetchFeatures,
  filterFeatures,
  renewalText,
  usedShare,
  type FeatureFilter,
  type FeatureIcon,
  type FeatureRow,
  type FeaturesView,
} from "@/lib/ent/consultant-ws/features";

/**
 * My Features (design/enterprise-consultant/features.webp): one call to `GET /api/orgs/{orgId}/me-workspace/features` (through the BFF) draws
 * the page for the signed-in consultant's OWN entitlements and usage. READ ONLY. Usage figures are real where the product records the action;
 * status and allowances are admin inputs in the real product, so they carry a "Sample" marker until the admin catalog and this role merge.
 * No price, margin or billing figure appears anywhere on this page.
 */

const ICONS: Record<FeatureIcon, ComponentType<IconProps>> = {
  search: SearchIcon,
  file: FileTextIcon,
  video: VideoIcon,
  mail: MailIcon,
  sparkles: SparklesIcon,
};

const BTN_LINE = "inline-flex min-h-8 items-center rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft";

/* ── enabled features table ─────────────────────────────────────────────────────────── */

function FeatureTile({ f, size = "md" }: { f: FeatureRow; size?: "sm" | "md" }) {
  const Icon = ICONS[f.icon];
  return (
    <span aria-hidden className={cn("grid flex-none place-items-center", TONES[f.tone], size === "md" ? "h-10 w-10 rounded-[11px]" : "h-9 w-9 rounded-[10px]")}>
      <Icon size={size === "md" ? 20 : 18} />
    </span>
  );
}

function UsageBar({ f }: { f: FeatureRow }) {
  const share = usedShare(f);
  if (share === null) return null;
  return <ProgressBar value={share} label={`${f.title} usage`} valueText={`${f.used} of ${f.allowance} ${f.unit} used`} className="mt-1.5 h-1.5 max-w-[150px]" />;
}

function FeaturesTable({ view }: { view: FeaturesView }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FeatureFilter>("all");
  const rows = useMemo(() => filterFeatures(view.features, filter), [view.features, filter]);
  return (
    <Card
      id="features-table"
      title="Your features"
      icon={GearIcon}
      extra={
        <>
          {view.entitlementsSample ? <SampleMark /> : null}
          <label className="ml-auto flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
            <FilterIcon size={15} className="flex-none text-accent-deep" aria-hidden />
            <select
              aria-label="Filter features"
              data-features-filter
              value={filter}
              onChange={(e) => setFilter(e.target.value as FeatureFilter)}
              className="min-h-9 rounded-lg border border-line bg-paper py-1 pl-2 pr-6 text-[13px] font-semibold text-ink"
            >
              {FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
    >
      {rows.length === 0 ? (
        <Empty>{filter === "attention" ? "Nothing needs your attention right now." : "No features match this filter."}</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={cn(TABLE, "min-w-[640px]")} data-features-table>
            <TableHead cols={["Feature", "Status", "Allowance / usage", "Renews", ""]} />
            <tbody>
              {rows.map((f) => {
                const st = STATUS_PILL[f.status];
                const al = allowanceText(f);
                return (
                  <tr key={f.key} data-feature-row={f.key} className="border-b border-line/60 last:border-0">
                    <td className={cn(TD, "min-w-[200px]")}>
                      <span className="flex items-center gap-3">
                        <FeatureTile f={f} />
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-bold leading-tight text-ink">{f.title}</span>
                          <span className="mt-0.5 block text-[12px] leading-snug text-muted">{f.description}</span>
                        </span>
                      </span>
                    </td>
                    <td className={TD}>
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </td>
                    <td className={cn(TD, "min-w-[150px]")}>
                      <span data-allowance className="block text-[13px] font-semibold text-ink">
                        {al.headline}
                      </span>
                      {al.detail ? <span className="block text-[12px] text-muted">{al.detail}</span> : null}
                      <UsageBar f={f} />
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-ink-soft")}>{renewalText(f)}</td>
                    <td className={TD}>
                      <span className="flex flex-wrap items-center justify-end gap-1.5">
                        <Link href={f.href} aria-label={`${f.actionLabel} ${f.title}`} data-feature-action className={BTN_LINE}>
                          {f.actionLabel}
                        </Link>
                        <Menu
                          trigger={
                            <button type="button" aria-label={`More actions for ${f.title}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
                              <MoreVerticalIcon size={16} />
                            </button>
                          }
                          items={[
                            { label: `${f.actionLabel} ${f.title}`, icon: <ChevronRightIcon size={15} />, onSelect: () => router.push(f.href) },
                            { label: "Ask my marketer", icon: <MessageIcon size={15} />, onSelect: () => router.push(`${BASE}/marketer`) },
                          ]}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface FeaturesPageProps {
  orgId: number;
}

/** The Plan & features tab of Settings: the consultant's features with status, allowance and renewal (read only). */
export default function FeaturesPage({ orgId }: FeaturesPageProps) {
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchFeatures(orgId), [orgId]));

  if (status === "denied")
    return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-features data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {status === "failed" ? (
        <ErrorState
          what="your features"
          description="Your features didn't load. Nothing has changed."
          onRetry={() => void reload()}
          variant="inline"
          className="rounded-[var(--radius-lg)] border border-line bg-paper"
        />
      ) : (
        <>
          {view ? (
            <FeaturesTable view={view} />
          ) : (
            <div className="grid gap-4" aria-busy="true">
              <Skeleton className="h-56 w-full" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
