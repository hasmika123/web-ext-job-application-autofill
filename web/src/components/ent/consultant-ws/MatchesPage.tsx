"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  AlertIcon,
  BarChartIcon,
  BellIcon,
  BookmarkIcon,
  BookmarkOutlineIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ErrorState,
  EyeIcon,
  FunnelIcon,
  LightbulbIcon,
  MapPinIcon,
  ShieldCheckIcon,
  Skeleton,
  Sparkline,
  StarIcon,
  SwapIcon,
  TargetIcon,
  TrophyIcon,
  UsersIcon,
  XIcon,
  chartColor,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, Card, CompanyMark, Empty, Pill, TABLE, TD, useWorkspaceData } from "./parts";
import JobLinkButton, { QuickInfo } from "./JobLinkButton";
import { APPLY_HELPER } from "@/lib/ent/consultant-ws/jobSource";
import { deltaText, employmentLabel, firstName, initialsOf, matchTone, placeLabel } from "@/lib/ent/consultant-ws/home";
import {
  MAX_COMPARE,
  NO_FILTERS,
  SORT_OPTIONS,
  activeFilterCount,
  alertAgo,
  distinct,
  expressInterest,
  fetchDetail,
  fetchMatches,
  filterMatches,
  fitTone,
  postedAgo,
  rateText,
  recordView,
  setSaved,
  sortMatches,
  toggleCompare,
  type AlertKind,
  type Fetched,
  type Filters,
  type MatchDetail,
  type MatchRow,
  type MatchTile,
  type MatchesView,
  type SortKey,
} from "@/lib/ent/consultant-ws/matches";

/**
 * Consultant Job Matches (design/enterprise-consultant/matches.webp): one call to `GET /api/orgs/{orgId}/me-workspace/matches` draws the
 * page for the signed-in consultant's OWN matches; the selected match's insights come from `GET .../matches/{matchId}`. Express Interest
 * only records the wish (no application, nothing is submitted). Skill bars are present / missing, not proficiency levels. Empty blocks say
 * so in a sentence; there is no made-up number.
 */

const BAR: Record<"green" | "amber" | "red", string> = { green: "bg-v2-green-ink", amber: "bg-v2-amber-ink", red: "bg-v2-coral-ink" };

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

interface TileSpec {
  key: keyof MatchesView["tiles"];
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
}
const TILE_SPECS: TileSpec[] = [
  { key: "total", title: "Total Job Matches", icon: TargetIcon, tone: "accent" },
  { key: "high", title: "High Match (80%+)", icon: TrophyIcon, tone: "amber" },
  { key: "fresh", title: "New Matches", icon: UsersIcon, tone: "violet" },
  { key: "saved", title: "Saved Jobs", icon: BookmarkIcon, tone: "amber" },
  { key: "viewed", title: "Viewed Matches", icon: EyeIcon, tone: "accent" },
];

function Tile({ spec, tile, index }: { spec: TileSpec; tile: MatchTile | null; index: number }) {
  const Icon = spec.icon;
  const d = tile ? deltaText(tile.deltaPct) : null;
  return (
    <section aria-label={spec.title} data-stat-tile={spec.key} data-state={tile ? "ok" : "loading"} className="flex min-h-[112px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5">
      <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-[12px]", TONES[spec.tone])}>
        <Icon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold leading-tight text-ink-soft">{spec.title}</h3>
        {tile ? (
          <>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p data-tile-value className="text-[28px] font-extrabold leading-none tabular-nums text-ink">
                {tile.value}
              </p>
              {tile.sparkline.length > 1 ? (
                <div className="mb-0.5 w-[42%] max-w-[72px] flex-none">
                  <Sparkline values={tile.sparkline} color={chartColor(index)} />
                </div>
              ) : null}
            </div>
            <p className="mt-2 flex min-h-5 flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
              {d ? (
                <>
                  <span className={cn("font-bold", d.dir === "up" ? "text-v2-green-ink" : d.dir === "down" ? "text-v2-coral-ink" : "text-muted")}>
                    {d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "→"} {d.text}
                  </span>
                  <span>vs last week</span>
                </>
              ) : null}
            </p>
          </>
        ) : (
          <>
            <Skeleton className="mt-2 h-8 w-16" />
            <Skeleton className="mt-2 h-4 w-24" />
          </>
        )}
      </div>
    </section>
  );
}

/* ── small pieces ───────────────────────────────────────────────────────────────────── */

function FitBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[12px] text-muted" title="This job lists no skills">-</span>;
  return (
    <span className="flex items-center gap-1.5" title={`${pct}% of the job's skills are on your profile`}>
      <span role="img" aria-label={`Skill fit ${pct}%`} className="h-1.5 w-16 flex-none overflow-hidden rounded-full bg-paper-2">
        <span className={cn("block h-full rounded-full", BAR[fitTone(pct)])} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

const iconBtn = "grid h-8 w-8 flex-none place-items-center rounded-lg border border-line bg-paper text-accent-deep hover:bg-accent-soft disabled:opacity-60";

function SaveButton({ row, onToggle }: { row: MatchRow; onToggle: (r: MatchRow) => void }) {
  return (
    <button type="button" aria-pressed={row.saved} aria-label={row.saved ? `Remove ${row.title} from saved jobs` : `Save ${row.title}`} data-action="save" onClick={() => onToggle(row)} className={iconBtn}>
      {row.saved ? <BookmarkIcon size={15} /> : <BookmarkOutlineIcon size={15} />}
    </button>
  );
}

function CompareButton({ row, on, full, onToggle }: { row: MatchRow; on: boolean; full: boolean; onToggle: (r: MatchRow) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${row.title} from compare` : full ? `Compare is full (up to ${MAX_COMPARE} jobs)` : `Compare ${row.title}`}
      data-action="compare"
      disabled={!on && full}
      onClick={() => onToggle(row)}
      className={cn(iconBtn, on && "bg-accent-soft")}
    >
      <SwapIcon size={15} />
    </button>
  );
}

function InterestButton({ row, busy, onSend, className }: { row: MatchRow; busy: boolean; onSend: (r: MatchRow) => void; className?: string }) {
  if (row.interestSent)
    return (
      <span data-action="interest-sent" className={cn("inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-lg bg-v2-green-soft px-3 text-[13px] font-semibold text-v2-green-ink", className)}>
        <CheckCircleIcon size={14} />
        Interest sent
      </span>
    );
  return (
    <button
      type="button"
      data-action="interest"
      disabled={busy}
      aria-label={`Express interest in ${row.title}`}
      onClick={() => onSend(row)}
      className={cn("inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-paper hover:bg-accent-deep disabled:opacity-60", className)}
    >
      Express Interest
    </button>
  );
}

/* ── the matched jobs table ─────────────────────────────────────────────────────────── */

interface Actions {
  open: (r: MatchRow) => void;
  toggleSave: (r: MatchRow) => void;
  toggleCompare: (r: MatchRow) => void;
  interest: (r: MatchRow) => void;
}

function MatchedJobs({ view, selected, compare, busy, a, notice }: { view: MatchesView; selected: number | null; compare: number[]; busy: Set<number>; a: Actions; notice: string }) {
  const [sort, setSort] = useState<SortKey>("score");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => sortMatches(filterMatches(view.matches, filters), sort), [view.matches, filters, sort]);
  const n = activeFilterCount(filters);
  const types = useMemo(() => distinct(view.matches, (m) => m.employment), [view.matches]);
  const modes = useMemo(() => distinct(view.matches, (m) => m.workMode), [view.matches]);
  const sel = "min-h-9 w-full rounded-lg border border-line bg-paper px-2 text-[13px] text-ink";
  return (
    <Card
      id="matches-list"
      title="Your Matched Jobs"
      icon={StarIcon}
      extra={
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
            Sort by
            <span className="relative">
              <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="min-h-9 appearance-none rounded-lg border border-line bg-paper py-1 pl-3 pr-8 text-[13px] font-semibold text-ink">
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
            </span>
          </label>
          <button type="button" aria-expanded={open} aria-controls="matches-filters" onClick={() => setOpen((v) => !v)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
            <FunnelIcon size={14} />
            Filters{n > 0 ? ` (${n})` : ""}
          </button>
        </div>
      }
    >
      <p className="-mt-1 mb-2 text-[12.5px] text-muted">Ranked by match score based on your skills, experience and preferences.</p>
      {open ? (
        <div id="matches-filters" className="mb-3 grid gap-3 rounded-xl border border-line bg-paper-2/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[12px] font-semibold text-muted">
            Match score
            <select aria-label="Minimum match score" className={sel} value={filters.minScore} onChange={(e) => setFilters({ ...filters, minScore: Number(e.target.value) })}>
              <option value={0}>Any</option>
              <option value={80}>80% and up</option>
              <option value={90}>90% and up</option>
            </select>
          </label>
          <label className="text-[12px] font-semibold text-muted">
            Type
            <select aria-label="Job type" className={sel} value={filters.employment} onChange={(e) => setFilters({ ...filters, employment: e.target.value })}>
              <option value="">Any</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {employmentLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-semibold text-muted">
            Work mode
            <select aria-label="Work mode" className={sel} value={filters.workMode} onChange={(e) => setFilters({ ...filters, workMode: e.target.value })}>
              <option value="">Any</option>
              {modes.map((m) => (
                <option key={m} value={m}>
                  {m.charAt(0) + m.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end justify-between gap-3">
            <label className="flex min-h-9 items-center gap-2 text-[13px] font-medium text-ink">
              <input type="checkbox" checked={filters.savedOnly} onChange={(e) => setFilters({ ...filters, savedOnly: e.target.checked })} className="h-4 w-4 accent-[var(--brand-600)]" />
              Saved only
            </label>
            {n > 0 ? (
              <button type="button" onClick={() => setFilters(NO_FILTERS)} className="min-h-9 text-[13px] font-semibold text-accent-deep hover:underline">
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <p role="status" aria-live="polite" data-notice className={cn("mb-2 text-[12.5px] font-medium text-v2-coral-ink", !notice && "sr-only")}>
        {notice}
      </p>
      {view.matches.length === 0 ? (
        <Empty>No matches yet. Keeping your profile and resume current helps us find roles that fit.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No matches fit these filters.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={cn(TABLE, "min-w-[640px] 2xl:min-w-[860px]")}>
            {/* Type and Posted only from 2xl: below it the card is too narrow and would clip the actions */}
            <thead>
              <tr className="text-left text-[12px] font-semibold text-muted">
                {["#", "Job Title", "Company", "Location", "Match", "Skill Fit", "Type", "Posted", "Actions"].map((c) => (
                  <th key={c} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg", (c === "Type" || c === "Posted") && "hidden 2xl:table-cell")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m, i) => (
                <tr key={m.matchId} data-match={m.matchId} aria-selected={selected === m.matchId} className={cn(selected === m.matchId && "bg-accent-soft/40")}>
                  <td className={TD}>
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-paper-2 text-[12.5px] font-bold text-ink-soft">{i + 1}</span>
                  </td>
                  <td className={cn(TD, "max-w-[170px] font-semibold")}>{m.title}</td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5">
                      <CompanyMark name={m.company} />
                      <span className="truncate">{m.company ?? "-"}</span>
                    </span>
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1 whitespace-nowrap text-ink-soft">
                      <MapPinIcon size={13} className="flex-none text-muted" />
                      {placeLabel(m.location, m.workMode)}
                    </span>
                  </td>
                  <td className={TD}>
                    <Pill tone={matchTone(m.score)}>{m.score}%</Pill>
                  </td>
                  <td className={TD}>
                    <FitBar pct={m.skillFit} />
                  </td>
                  <td className={cn(TD, "hidden 2xl:table-cell")}>{employmentLabel(m.employment) ? <Pill tone="blue">{employmentLabel(m.employment)}</Pill> : null}</td>
                  <td className={cn(TD, "hidden whitespace-nowrap text-ink-soft 2xl:table-cell")}>{postedAgo(m.postedAt)}</td>
                  <td className={TD}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <button type="button" data-action="view" aria-label={`View match for ${m.title}`} onClick={() => a.open(m)} className="inline-flex min-h-8 items-center whitespace-nowrap rounded-lg bg-accent-soft px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft/70">
                        View Match
                      </button>
                      <SaveButton row={m} onToggle={a.toggleSave} />
                      <CompareButton row={m} on={compare.includes(m.matchId)} full={compare.length >= MAX_COMPARE} onToggle={a.toggleCompare} />
                      <InterestButton row={m} busy={busy.has(m.matchId)} onSend={a.interest} />
                      <JobLinkButton title={m.title} source={m} variant="ghost" className="!min-h-8" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── compare sheet ──────────────────────────────────────────────────────────────────── */

function CompareSheet({ rows, onRemove, onClear }: { rows: MatchRow[]; onRemove: (r: MatchRow) => void; onClear: () => void }) {
  const lines: { label: string; value: (m: MatchRow) => ReactNode }[] = [
    { label: "Company", value: (m) => m.company ?? "-" },
    { label: "Location", value: (m) => placeLabel(m.location, m.workMode) },
    { label: "Match", value: (m) => <Pill tone={matchTone(m.score)}>{m.score}%</Pill> },
    { label: "Skill fit", value: (m) => (m.skillFit === null ? "Not listed" : `${m.skillFit}%`) },
    { label: "Type", value: (m) => employmentLabel(m.employment) ?? "-" },
    { label: "Rate", value: (m) => rateText(m) ?? "Not listed" },
    { label: "Posted", value: (m) => postedAgo(m.postedAt) || "-" },
  ];
  return (
    <Card id="matches-compare" title="Compare Jobs" icon={SwapIcon} extra={<button type="button" onClick={onClear} className="ml-auto text-[13px] font-semibold text-accent-deep hover:underline">Clear all</button>}>
      {rows.length < 2 ? <p className="mb-2 text-[13px] text-muted">Choose at least one more job to compare side by side (up to {MAX_COMPARE}).</p> : null}
      <div className="relative overflow-x-auto">
        <table className={cn(TABLE, "min-w-[520px]")} data-compare-sheet>
          <thead>
            <tr>
              <th scope="col" className="w-24 px-2 py-2 text-left text-[12px] font-semibold text-muted">
                <span className="sr-only">Detail</span>
              </th>
              {rows.map((m) => (
                <th key={m.matchId} scope="col" className="px-2 py-2 text-left align-top text-[13.5px] font-bold text-ink">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">{m.title}</span>
                    <button type="button" aria-label={`Remove ${m.title} from compare`} onClick={() => onRemove(m)} className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted hover:bg-paper-2">
                      <XIcon size={13} />
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <tr key={l.label}>
                <th scope="row" className="px-2 py-2 text-left text-[12.5px] font-semibold text-muted">
                  {l.label}
                </th>
                {rows.map((m) => (
                  <td key={m.matchId} className={TD}>
                    {l.value(m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── match details and insights ─────────────────────────────────────────────────────── */

type DetailState = { id: number; result: Fetched<MatchDetail> } | null;

function Details({ row, detail, loading, comparing, full, busy, a }: { row: MatchRow | null; detail: Fetched<MatchDetail> | null; loading: boolean; comparing: boolean; full: boolean; busy: boolean; a: Actions }) {
  return (
    <Card id="matches-detail" title="Match Details & Insights" icon={BarChartIcon}>
      <p className="-mt-1 mb-3 text-[12.5px] text-muted">See why you&apos;re a great fit and how to make your match even stronger.</p>
      {!row ? (
        <Empty>Pick a match above to see how your profile lines up with it.</Empty>
      ) : (
        <div data-detail={row.matchId}>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
            <span aria-hidden className="grid h-14 w-14 flex-none place-items-center rounded-xl bg-accent-soft text-[17px] font-extrabold text-accent-deep">
              {initialsOf(row.company)}
            </span>
            <div className="min-w-0 flex-1 basis-56">
              <h3 className="text-[19px] font-extrabold leading-tight text-ink">{row.title}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft">
                <span>{row.company ?? "-"}</span>
                <span className="inline-flex items-center gap-1">
                  <MapPinIcon size={13} className="text-muted" />
                  {placeLabel(row.location, row.workMode)}
                </span>
                {employmentLabel(row.employment) ? <Pill tone="blue">{employmentLabel(row.employment)}</Pill> : null}
                {postedAgo(row.postedAt) ? <span className="text-muted">Posted {postedAgo(row.postedAt)}</span> : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span data-detail-score className="inline-flex min-h-10 items-center rounded-full bg-v2-green-soft px-4 text-[15px] font-extrabold text-v2-green-ink">
                {row.score}% Match
              </span>
              <InterestButton row={row} busy={busy} onSend={a.interest} className="min-h-10 px-4 text-[14px]" />
              <JobLinkButton title={row.title} source={row} variant="ghost" />
              <button type="button" aria-pressed={row.saved} onClick={() => a.toggleSave(row)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
                {row.saved ? <BookmarkIcon size={14} /> : <BookmarkOutlineIcon size={14} />}
                {row.saved ? "Saved" : "Save Job"}
              </button>
              <button type="button" aria-pressed={comparing} disabled={!comparing && full} onClick={() => a.toggleCompare(row)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft disabled:opacity-60">
                <SwapIcon size={14} />
                {comparing ? "In compare" : "Compare"}
              </button>
            </div>
          </div>
          <QuickInfo source={row} className="mt-3 rounded-xl border border-line p-3" />
          <p data-apply-helper className="mt-2 text-[12.5px] text-muted">
            {APPLY_HELPER}
          </p>
          {row.interestSent ? <p className="mt-2 text-[12.5px] text-muted">Your interest is recorded. Your marketer can see it and will follow up. Nothing has been submitted for you.</p> : null}

          {loading || !detail ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : detail.kind !== "OK" || !detail.view ? (
            <ErrorState what="this match" description="The details didn't load. Nothing has changed." variant="inline" />
          ) : (
            <DetailBody d={detail.view} />
          )}
        </div>
      )}
    </Card>
  );
}

function DetailBody({ d }: { d: MatchDetail }) {
  const head = "flex items-center gap-2 text-[15px] font-bold text-ink";
  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-3">
      <section aria-labelledby="skill-align" data-block="skills" className="min-w-0">
        <h4 id="skill-align" className={head}>
          <UsersIcon size={17} className="text-v2-green-ink" />
          Skill Alignment
        </h4>
        {d.skills.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">This job doesn&apos;t list skills yet, so there is nothing to compare.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-2.5">
              {d.skills.map((s) => (
                <li key={s.skill} data-skill={s.skill} data-present={s.present} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_2.6rem] items-center gap-2 text-[13px]">
                  <span className="truncate font-medium text-ink">{s.skill}</span>
                  <span role="img" aria-label={s.present ? `${s.skill}: on your profile` : `${s.skill}: missing from your profile`} className="h-2 overflow-hidden rounded-full bg-paper-2">
                    <span className={cn("block h-full rounded-full", s.present ? BAR.green : BAR.red)} style={{ width: `${s.present ? 100 : 4}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums text-ink-soft">{s.percent}%</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] text-muted">Shows whether a skill is on your profile; levels are not tracked.</p>
          </>
        )}
      </section>

      <section aria-labelledby="match-expl" data-block="explanation" className="min-w-0">
        <h4 id="match-expl" className={head}>
          <ShieldCheckIcon size={17} className="text-accent-deep" />
          Match Explanation
        </h4>
        {d.reason ? <p className="mt-3 text-[13px] leading-snug text-ink-soft">{d.reason}</p> : null}
        {d.explanation.length === 0 && !d.reason ? <p className="mt-3 text-[13px] text-muted">No further detail is available for this match.</p> : null}
        <ul className="mt-3 space-y-2.5">
          {d.explanation.map((b) => (
            <li key={b.key} data-bullet={b.key} data-ok={b.ok} className="flex items-start gap-2 text-[13px] leading-snug text-ink">
              {b.ok ? <CheckCircleIcon size={18} className="mt-px flex-none text-v2-green-ink" /> : <AlertIcon size={18} className="mt-px flex-none text-v2-amber-ink" />}
              <span className="min-w-0">{b.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="improve" data-block="improve" className="min-w-0">
        <h4 id="improve" className={head}>
          <LightbulbIcon size={17} className="text-v2-amber-ink" />
          Areas to Improve
        </h4>
        {d.improvements.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">Nothing to improve for this match. You have what it asks for.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {d.improvements.map((x) => (
              <li key={`${x.tag}-${x.title}`} data-improve={x.tag} className="text-[13px] leading-snug">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink">{x.title}</span>
                  <Pill tone={x.tag === "GAP" ? "red" : "amber"} className="min-h-5 text-[11px]">
                    {x.tag === "GAP" ? "Gap" : "Suggested"}
                  </Pill>
                </span>
                <span className="mt-0.5 block text-ink-soft">{x.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

function MatchQuality({ view }: { view: MatchesView }) {
  return (
    <Card id="matches-quality" title="Improve Your Match Quality" icon={BarChartIcon}>
      <p className="-mt-1 mb-3 text-[12.5px] text-muted">Complete these steps to get better, more relevant job matches.</p>
      <ul className="space-y-2.5" aria-label="Match quality checklist">
        {view.quality.checks.map((c) => (
          <li key={c.key} data-check={c.key} data-done={c.done} className="flex items-center gap-2.5 text-[13.5px] text-ink">
            {c.done ? <CheckCircleIcon size={20} className="flex-none text-v2-green-ink" /> : <span aria-hidden className="h-5 w-5 flex-none rounded-full border-2 border-line" />}
            <span className="min-w-0 flex-1">{c.label}</span>
            <span className="sr-only">{c.done ? "done" : "to do"}</span>
          </li>
        ))}
      </ul>
      <Link href={`${BASE}/profile`} className="mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-[14px] font-semibold text-accent-deep hover:bg-accent-soft/70">
        <ShieldCheckIcon size={17} className="flex-none" />
        <span className="min-w-0 flex-1 truncate">Improve My Profile</span>
        <ChevronRightIcon size={16} className="flex-none" />
      </Link>
    </Card>
  );
}

const ALERT_TONE: Record<AlertKind, string> = {
  NEW_MATCHES: "bg-v2-green-soft text-v2-green-ink",
  ROLE_UPDATED: "bg-v2-amber-soft text-v2-amber-ink",
  APPLICATION_UPDATE: "bg-v2-violet-soft text-v2-violet-ink",
};

function Alerts({ view }: { view: MatchesView }) {
  return (
    <Card id="matches-alerts" title="Personalized Alerts" icon={BellIcon} viewAll={`${BASE}/notifications`}>
      {view.alerts.length === 0 ? (
        <Empty>No alerts right now. New matches and updates to your roles will show up here.</Empty>
      ) : (
        <ul className="space-y-3">
          {view.alerts.map((x) => (
            <li key={x.key} data-alert={x.kind} className="flex items-start gap-2.5">
              <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-full text-[12px] font-bold", ALERT_TONE[x.kind])}>
                {initialsOf(x.title).charAt(0)}
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-snug">
                <span className="block font-semibold text-ink">{x.title}</span>
                <span className="block text-muted">{x.detail}</span>
              </span>
              <span className="flex-none whitespace-nowrap text-[11.5px] text-muted">{alertAgo(x.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface MatchesPageProps {
  orgId: number;
  firstName: string;
}

export default function ConsultantMatchesPage({ orgId, firstName: first }: MatchesPageProps) {
  const { view, status, reload, setView } = useWorkspaceData(useCallback(() => fetchMatches(orgId), [orgId]));
  const loading = status === "loading";
  const [picked, setPicked] = useState<number | null>(null);
  const [compare, setCompare] = useState<number[]>([]);
  const [busy, setBusy] = useState<Set<number>>(() => new Set());
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<DetailState>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // the selection: the one the consultant picked while it still exists, else the best-scoring match
  const selectedRow = useMemo(() => {
    if (!view || view.matches.length === 0) return null;
    return view.matches.find((m) => m.matchId === picked) ?? sortMatches(view.matches, "score")[0];
  }, [view, picked]);
  const selectedId = selectedRow?.matchId ?? null;

  useEffect(() => {
    if (selectedId === null) return;
    const ctl = new AbortController();
    void fetchDetail(orgId, selectedId, ctl.signal).then((result) => {
      if (!ctl.signal.aborted) setState({ id: selectedId, result });
    });
    return () => ctl.abort();
  }, [orgId, selectedId]);

  const patch = useCallback(
    (matchId: number, change: Partial<MatchRow>) => setView((v) => (v ? { ...v, matches: v.matches.map((m) => (m.matchId === matchId ? { ...m, ...change } : m)) } : v)),
    [setView],
  );
  const withBusy = async (id: number, fn: () => Promise<void>) => {
    setBusy((s) => new Set(s).add(id));
    try {
      await fn();
    } finally {
      setBusy((s) => new Set([...s].filter((x) => x !== id)));
    }
  };

  const actions: Actions = {
    open: (r) => {
      setPicked(r.matchId);
      detailRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      if (!r.viewed) {
        void recordView(orgId, r.matchId).then((res) => {
          if (res.ok) {
            patch(r.matchId, { viewed: true });
            void reload();
          }
        });
      }
    },
    toggleSave: (r) => {
      const next = !r.saved;
      setNotice("");
      patch(r.matchId, { saved: next });
      void setSaved(orgId, r.matchId, next).then((res) => {
        if (res.ok) void reload();
        else {
          patch(r.matchId, { saved: !next });
          setNotice(res.message ?? "That didn't save. Nothing has changed.");
        }
      });
    },
    toggleCompare: (r) => setCompare((ids) => toggleCompare(ids, r.matchId)),
    interest: (r) => {
      setNotice("");
      void withBusy(r.matchId, async () => {
        const res = await expressInterest(orgId, r.matchId);
        if (res.ok) {
          patch(r.matchId, { interestSent: true });
          void reload();
        } else setNotice(res.message ?? "We couldn't record your interest. Nothing has changed.");
      });
    },
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const compareRows = view ? view.matches.filter((m) => compare.includes(m.matchId)) : [];
  const detail = state && state.id === selectedId ? state.result : null;

  return (
    <div data-consultant-matches data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Job Matches" subtitle="Roles your marketer matched to your skills, experience and career goals. Open the job link to read the posting and apply on the source site with the Kiwiply extension." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your job matches" description="Your matches didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.36fr)]">
          <div className="grid min-w-0 content-start gap-4 sm:gap-5">
            <section aria-label="Key numbers" data-matches-tiles className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 2xl:grid-cols-5">
              {TILE_SPECS.map((s, i) => (
                <Tile key={s.key} spec={s} tile={loading || !view ? null : view.tiles[s.key]} index={i} />
              ))}
            </section>
            {view ? (
              <>
                <MatchedJobs view={view} selected={selectedId} compare={compare} busy={busy} a={actions} notice={notice} />
                {compare.length > 0 ? <CompareSheet rows={compareRows} onRemove={actions.toggleCompare} onClear={() => setCompare([])} /> : null}
                <div ref={detailRef} className="scroll-mt-20">
                  <Details row={selectedRow} detail={detail} loading={detail === null} comparing={selectedId !== null && compare.includes(selectedId)} full={compare.length >= MAX_COMPARE} busy={selectedId !== null && busy.has(selectedId)} a={actions} />
                </div>
              </>
            ) : (
              <div className="grid gap-4" aria-busy="true">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-56 w-full" />
                ))}
              </div>
            )}
          </div>
          <div className="grid min-w-0 content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-1">
            <BeeCard
              name={firstName(first)}
              body="Get personalized job matches, improve your skills, track your applications and more. I'm here whenever you need support on your journey."
            />
            {view ? (
              <>
                <MatchQuality view={view} />
                <Alerts view={view} />
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
