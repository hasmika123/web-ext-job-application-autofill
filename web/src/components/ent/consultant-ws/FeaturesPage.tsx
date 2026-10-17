"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  BarChartIcon,
  ChevronRightIcon,
  CrownIcon,
  ClockIcon,
  ErrorState,
  FileTextIcon,
  FilterIcon,
  GearIcon,
  LayoutGridIcon,
  LightbulbIcon,
  MailIcon,
  MessageIcon,
  Menu,
  MoreVerticalIcon,
  ProgressBar,
  SearchIcon,
  Skeleton,
  SparklesIcon,
  VideoIcon,
  ZapIcon,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, Card, Empty, Pill, SampleMark, TABLE, TD, TableHead, useWorkspaceData } from "./parts";
import { firstName, shortDate } from "@/lib/ent/consultant-ws/home";
import {
  FILTERS,
  RECOMMENDED,
  STATUS_PILL,
  TIPS,
  allowanceText,
  fetchFeatures,
  filterFeatures,
  overviewRows,
  percentUsed,
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

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

interface TileView {
  key: string;
  title: string;
  icon: ComponentType<IconProps>;
  tone: keyof typeof TONES;
  value: string;
  sub: string;
  sample: boolean;
}

function tilesOf(view: FeaturesView): TileView[] {
  const t = view.tiles;
  const delta = t.usedDeltaPct;
  return [
    { key: "active", title: "Active Features", icon: LayoutGridIcon, tone: "accent", value: String(t.active), sub: "In your plan", sample: t.activeSample },
    {
      key: "credits",
      title: "AI Credits Left",
      icon: BarChartIcon,
      tone: "violet",
      value: t.creditsLeft === null ? "-" : String(t.creditsLeft),
      sub: t.creditsTotal === null ? "No credit allowance" : `of ${t.creditsTotal} this month`,
      sample: t.creditsSample,
    },
    {
      key: "used",
      title: "Features Used This Month",
      icon: BarChartIcon,
      tone: "green",
      value: String(t.usedThisMonth),
      sub: delta === null ? "Counted from your activity" : `${delta > 0 ? "+" : ""}${delta}% vs last month`,
      sample: false,
    },
    { key: "premium", title: "Premium Tools Enabled", icon: CrownIcon, tone: "amber", value: String(t.premium), sub: "Included in your plan", sample: t.premiumSample },
    {
      key: "expiring",
      title: "Expiring Soon",
      icon: ClockIcon,
      tone: "coral",
      value: String(t.expiringSoon),
      sub: t.renewsOn ? `Renews ${shortDate(t.renewsOn)}` : "Nothing is expiring",
      sample: t.expiringSample,
    },
  ];
}

function Tile({ tile }: { tile: TileView | null }) {
  if (!tile)
    return (
      <section className="flex min-h-[112px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5" data-state="loading">
        <Skeleton className="h-14 w-14 flex-none rounded-[14px]" />
        <div className="flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-8 w-12" />
        </div>
      </section>
    );
  const Icon = tile.icon;
  return (
    <section aria-label={tile.title} data-stat-tile={tile.key} data-tone={tile.tone} data-state="ok" className="flex min-h-[112px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5">
      <span aria-hidden className={cn("grid h-14 w-14 flex-none place-items-center rounded-[14px]", TONES[tile.tone])}>
        <Icon size={26} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-bold leading-tight text-ink">{tile.title}</h3>
        <p data-tile-value className="mt-1 text-[30px] font-extrabold leading-none tabular-nums text-ink">
          {tile.value}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted">
          <span>{tile.sub}</span>
          {tile.sample ? <SampleMark /> : null}
        </p>
      </div>
    </section>
  );
}

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
      title="Enabled Features"
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
            <TableHead cols={["Feature", "Status", "Included allowance / usage", "Renewal / availability", ""]} />
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

/* ── usage overview ─────────────────────────────────────────────────────────────────── */

function UsageOverview({ view }: { view: FeaturesView }) {
  const rows = overviewRows(view.features);
  return (
    <Card id="features-usage" title="Usage Overview" icon={BarChartIcon} extra={<span className="ml-auto text-[12.5px] font-medium text-muted">This month</span>}>
      {rows.length === 0 ? (
        <Empty>No metered features are enabled for you.</Empty>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {rows.map((f) => {
            const pct = percentUsed(f);
            return (
              <li key={f.key} data-usage-card={f.key} className="min-w-0 rounded-xl border border-line bg-paper p-3">
                <div className="flex items-start gap-2.5">
                  <FeatureTile f={f} size="sm" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[12.5px] font-bold leading-tight text-ink">{f.title}</h3>
                    {f.used === null ? (
                      <p className="mt-1 text-[12px] leading-snug text-muted">Usage tracking arrives with this tool.</p>
                    ) : (
                      <p className="mt-1 text-[22px] font-extrabold leading-none tabular-nums text-ink">
                        {f.used}
                        {f.allowance !== null ? <span className="text-[13px] font-medium text-muted"> / {f.allowance} {f.unit}</span> : <span className="text-[13px] font-medium text-muted"> {f.unit}</span>}
                      </p>
                    )}
                  </div>
                </div>
                <UsageBar f={f} />
                <p className="mt-1.5 text-[12px] text-muted">{pct === null ? (f.used === null ? "" : "This month") : `${pct}% used`}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ── recommended tools ──────────────────────────────────────────────────────────────── */

function RecommendedTools() {
  return (
    <Card id="features-recommended" title="Recommended Tools" icon={LightbulbIcon} tone="amber" extra={<span className="hidden text-[12.5px] text-muted lg:inline">Get more from your features with these popular tools and tips.</span>}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
        {RECOMMENDED.map((r) => {
          const Icon = ICONS[r.icon];
          return (
            <li key={r.key} data-recommended={r.key} className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-paper p-3.5">
              <div className="flex items-start gap-3">
                <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-[12px]", TONES[r.tone])}>
                  <Icon size={22} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[13.5px] font-bold leading-tight text-ink">{r.title}</h3>
                  <p className="mt-1 text-[12px] leading-snug text-muted">{r.body}</p>
                </div>
              </div>
              <Link href={r.href} className={cn(BTN_LINE, "self-end")}>
                {r.action}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

const QUICK: { label: string; sub: string; href: string; icon: ComponentType<IconProps>; tone: keyof typeof TONES }[] = [
  { label: "Run AI Resume Review", sub: "Get instant feedback on your resume", href: `${BASE}/resumes`, icon: FileTextIcon, tone: "accent" },
  { label: "Open Interview Prep", sub: "Practice with AI questions", href: `${BASE}/interview-prep`, icon: VideoIcon, tone: "accent" },
  { label: "View Job Matches", sub: "See your latest matched jobs", href: `${BASE}/matches`, icon: SearchIcon, tone: "accent" },
  { label: "Message My Marketer", sub: "Get personalized career support", href: `${BASE}/marketer`, icon: MailIcon, tone: "accent" },
];

function QuickActions() {
  return (
    <Card id="features-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="grid gap-2.5">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <li key={q.label}>
              <Link href={q.href} data-features-quick={q.label} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2 text-left hover:bg-accent-soft">
                <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-[10px]", TONES[q.tone])}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold leading-tight text-accent-deep">{q.label}</span>
                  <span className="block text-[12px] leading-snug text-muted">{q.sub}</span>
                </span>
                <ChevronRightIcon size={16} className="flex-none text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Tips() {
  return (
    <Card id="features-tips" title="Tips to Get More Value" icon={BarChartIcon}>
      <ol className="grid gap-2">
        {TIPS.map((t, i) => (
          <li key={t.text}>
            <Link href={t.href} className="flex min-h-11 items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-paper-2">
              <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full border border-line text-[12px] font-bold text-accent-deep">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-soft">{t.text}</span>
              <ChevronRightIcon size={15} className="flex-none text-muted" />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface FeaturesPageProps {
  orgId: number;
  firstName: string;
}

export default function FeaturesPage({ orgId, firstName: first }: FeaturesPageProps) {
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchFeatures(orgId), [orgId]));
  const tiles = view ? tilesOf(view) : null;

  if (status === "denied")
    return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-features data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="My Features" subtitle="View your enabled tools, usage, and available career support features." />
      <ClaimsMascot />
      <ClaimsHelpCard />

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
          <section aria-label="Key numbers" data-features-tiles className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
            {tiles ? tiles.map((t) => <Tile key={t.key} tile={t} />) : [0, 1, 2, 3, 4].map((i) => <Tile key={i} tile={null} />)}
          </section>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.36fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
              {view ? (
                <>
                  <FeaturesTable view={view} />
                  <UsageOverview view={view} />
                  <RecommendedTools />
                </>
              ) : (
                <div className="grid gap-4" aria-busy="true">
                  {[0, 1].map((i) => (
                    <Skeleton key={i} className="h-56 w-full" />
                  ))}
                </div>
              )}
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)]">
              <BeeCard
                name={firstName(first)}
                title="Your career companion, here to help!"
                body="You have access to powerful features to support your job search and career growth. Explore your enabled tools, track your usage, and get the most out of your benefits."
              />
              <div className="grid min-w-0 content-start gap-4 sm:gap-5">
                <QuickActions />
                <Tips />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
