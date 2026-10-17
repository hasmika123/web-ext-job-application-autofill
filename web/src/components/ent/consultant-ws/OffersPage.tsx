"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  BarChartIcon,
  Button,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  Dialog,
  ErrorState,
  FileTextIcon,
  InfoIcon,
  Menu,
  MessageIcon,
  MoreVerticalIcon,
  SearchIcon,
  SendIcon,
  SideSheet,
  Skeleton,
  Sparkline,
  UsersIcon,
  XCircleIcon,
  ZapIcon,
  chartColor,
  cn,
  useToast,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { CARD, TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, Card, CompanyMark, Empty, Pill, SampleMark, TABLE, TD, useWorkspaceData } from "./parts";
import { deltaText, firstName } from "@/lib/ent/consultant-ws/home";
import {
  ACCEPT_COPY,
  EMPTY_QUERY,
  MAX_COMPARE,
  MAX_NOTE,
  MODE_FILTERS,
  SORT_OPTIONS,
  STATUS_FILTERS,
  acceptOffer,
  compareLabel,
  comparedRows,
  dateLabel,
  deadlineInfo,
  declineOffer,
  fetchOfferDetail,
  fetchOfferList,
  fetchOffers,
  formatMoney,
  isDefaultQuery,
  negotiateOffer,
  noteProblem,
  rangeText,
  relativeTime,
  stampLabel,
  statusInfo,
  toggleSelection,
  workModeInfo,
  type Fetched,
  type OfferActivity,
  type OfferDetail,
  type OfferPage,
  type OfferQuery,
  type OfferRow,
  type OfferTile,
  type OffersView,
  type SortKey,
  type WriteResult,
} from "@/lib/ent/consultant-ws/offers";

/**
 * Consultant Offers (design/enterprise-consultant/offers.webp): one call to `GET /api/orgs/{orgId}/me-workspace/offers` draws the page for the
 * signed-in consultant's OWN offers; the table filters, searches, sorts and pages on the API. Accept, Decline and Negotiate only record the
 * consultant's answer (the API says "already answered" or "deadline passed" with a 409 and the page reloads): nothing is signed or sent to a
 * client from here, money is a record in minor units, and accepting does not start a placement. Rows flagged `sample` are demo stand-ins for the
 * employer side that makes offers.
 */

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

interface TileSpec {
  key: keyof OffersView["tiles"];
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
}
const TILE_SPECS: TileSpec[] = [
  { key: "total", title: "Total Offers", icon: FileTextIcon, tone: "accent" },
  { key: "pending", title: "Pending Review", icon: ClockIcon, tone: "amber" },
  { key: "accepted", title: "Accepted", icon: CheckCircleIcon, tone: "green" },
  { key: "negotiation", title: "Negotiation", icon: UsersIcon, tone: "violet" },
  { key: "declined", title: "Declined", icon: XCircleIcon, tone: "coral" },
];

function Tile({ spec, tile, index }: { spec: TileSpec; tile: OfferTile | null; index: number }) {
  const Icon = spec.icon;
  const d = tile ? deltaText(tile.deltaPct) : null;
  return (
    <section aria-label={spec.title} data-stat-tile={spec.key} data-tone={spec.tone} data-state={tile ? "ok" : "loading"} className="flex min-h-[112px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5">
      <span aria-hidden className={cn("grid h-14 w-14 flex-none place-items-center rounded-[14px]", TONES[spec.tone])}>
        <Icon size={26} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-bold leading-tight text-ink">{spec.title}</h3>
        {tile ? (
          <>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p data-tile-value className="text-[30px] font-extrabold leading-none tabular-nums text-ink">
                {tile.value}
              </p>
              {tile.sparkline.length > 1 ? (
                <div className="mb-0.5 w-[42%] max-w-[84px] flex-none">
                  <Sparkline values={tile.sparkline} color={chartColor(index)} />
                </div>
              ) : null}
            </div>
            <p className="mt-2 flex min-h-5 flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
              {d ? (
                <>
                  <span className={cn("font-bold", d.dir === "up" ? "text-v2-green-ink" : d.dir === "down" ? "text-v2-coral-ink" : "text-muted")}>
                    {d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "-"} {d.dir === "flat" ? "no change" : d.text}
                  </span>
                  {d.dir === "flat" ? null : <span>vs last month</span>}
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

const BTN_SOLID = "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-paper hover:bg-accent-deep disabled:opacity-60";
const BTN_LINE = "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft disabled:opacity-60";

const StatusPill = ({ status }: { status: OfferRow["status"] }) => {
  const s = statusInfo(status);
  return (
    <Pill tone={s.tone} className="min-h-7 rounded-lg px-3 text-[12.5px]">
      {s.label}
    </Pill>
  );
};

const ModePill = ({ mode }: { mode: OfferRow["workMode"] }) => {
  const m = workModeInfo(mode);
  return m ? (
    <Pill tone={m.tone} className="min-h-7 rounded-lg px-3 text-[12.5px]">
      {m.label}
    </Pill>
  ) : (
    <span className="text-muted">-</span>
  );
};

const CompanyCell = ({ name }: { name: string }) => (
  <span className="flex items-center gap-2">
    <CompanyMark name={name} />
    <span className="min-w-0 break-words font-semibold text-ink">{name}</span>
  </span>
);

const selectCls = "min-h-10 w-full appearance-none rounded-lg border border-line bg-paper py-1 pl-3 pr-8 text-[13px] font-semibold text-ink";

function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <span className="relative block min-w-0">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </span>
  );
}

function Panel({ id, title, subtitle, icon: Icon, extra, children }: { id: string; title: string; subtitle?: string; icon: ComponentType<IconProps>; extra?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-home-card={id} className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-[10px]", TONES.accent)}>
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <h2 id={id} className="text-[17px] font-extrabold leading-tight text-ink">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p> : null}
        </div>
        {extra}
      </header>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

/* ── your offers ────────────────────────────────────────────────────────────────────── */

interface Actions {
  view: (r: OfferRow) => void;
  respond: (r: OfferRow) => void;
  toggle: (r: OfferRow) => void;
  go: (href: string) => void;
}

const isOpen = (r: OfferRow) => r.status === "PENDING_REVIEW" || r.status === "NEGOTIATION";

function RowMenu({ row, selected, a }: { row: OfferRow; selected: boolean; a: Actions }) {
  return (
    <Menu
      trigger={
        <button type="button" aria-label={`More actions for ${row.role} at ${row.company}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
          <MoreVerticalIcon size={16} />
        </button>
      }
      items={[
        { label: "View offer details", icon: <SearchIcon size={15} />, onSelect: () => a.view(row) },
        ...(isOpen(row) ? [{ label: "Respond to offer", icon: <SendIcon size={15} />, onSelect: () => a.respond(row) }] : []),
        { label: selected ? "Remove from compare" : "Add to compare", icon: <BarChartIcon size={15} />, onSelect: () => a.toggle(row) },
        { label: "Ask my marketer", icon: <MessageIcon size={15} />, onSelect: () => a.go(`${BASE}/marketer`) },
      ]}
    />
  );
}

const CHECK = "h-4 w-4 flex-none rounded accent-[var(--brand-600)]";

function OffersTable({ rows, selected, a }: { rows: OfferRow[]; selected: number[]; a: Actions }) {
  const heads = ["Company", "Role", "Package Summary", "Work Mode", "Start Date", "Offer Deadline", "Status", "Actions"];
  const wide = (c: string) => c === "Package Summary" || c === "Start Date";
  return (
    <div className="relative overflow-x-auto">
      <table className={cn(TABLE, "min-w-[620px]")}>
        <thead>
          <tr className="text-left text-[12px] font-semibold text-muted">
            <th scope="col" className="w-9 bg-paper-2/60 px-2.5 py-2 first:rounded-l-lg">
              <span className="sr-only">Select to compare</span>
            </th>
            {heads.map((c) => (
              <th key={c} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2 py-2 font-semibold last:rounded-r-lg", wide(c) && "hidden 2xl:table-cell")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const dl = deadlineInfo(r);
            const on = selected.includes(r.id);
            return (
              <tr key={r.id} data-offer={r.id} data-status={r.status}>
                <td className="px-2.5 py-2.5 align-middle">
                  <input type="checkbox" aria-label={`Select ${r.role} at ${r.company} to compare`} checked={on} onChange={() => a.toggle(r)} className={CHECK} />
                </td>
                <td className={cn(TD, "min-w-[120px]")}>
                  <CompanyCell name={r.company} />
                </td>
                <td className={cn(TD, "min-w-[120px] max-w-[190px]")}>
                  <span className="block font-medium leading-tight text-ink">{r.role}</span>
                  {/* below 2xl the package column is hidden to keep the actions reachable; it moves under the role */}
                  {r.packageSummary ? <span className="mt-1 block text-[12px] leading-snug text-ink-soft 2xl:hidden">{r.packageSummary}</span> : null}
                </td>
                <td className={cn(TD, "hidden max-w-[190px] text-[12.5px] leading-snug 2xl:table-cell")}>{r.packageSummary ?? <span className="text-muted">-</span>}</td>
                <td className={TD}>
                  <ModePill mode={r.workMode} />
                </td>
                <td className={cn(TD, "hidden whitespace-nowrap 2xl:table-cell")}>{dateLabel(r.startDate)}</td>
                <td className={cn(TD, "whitespace-nowrap")} data-deadline={dl.urgent ? "urgent" : "normal"}>
                  <span className={cn("block font-semibold", dl.urgent ? "text-v2-coral-ink" : "text-ink")}>{dl.date}</span>
                  {dl.left ? <span className={cn("block text-[12px]", dl.urgent ? "text-v2-coral-ink" : "text-muted")}>{dl.left}</span> : null}
                </td>
                <td className={TD}>
                  <StatusPill status={r.status} />
                </td>
                <td className={TD}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <button type="button" data-action="view" aria-label={`View ${r.role} at ${r.company}`} onClick={() => a.view(r)} className={BTN_LINE}>
                      View
                    </button>
                    <RowMenu row={r} selected={on} a={a} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ page, shown, loading, onPage }: { page: OfferPage; shown: number; loading: boolean; onPage: (p: number) => void }) {
  if (page.total === 0) return null;
  const btn = "grid h-8 w-8 place-items-center rounded-lg border border-line bg-paper text-accent-deep hover:bg-accent-soft disabled:opacity-50";
  return (
    <nav aria-label="Offers pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
      <span data-range>{rangeText(page, shown)}</span>
      <span className="flex items-center gap-2">
        <button type="button" aria-label="Previous page" disabled={loading || page.page <= 0} onClick={() => onPage(page.page - 1)} className={btn}>
          <ChevronLeftIcon size={15} />
        </button>
        <span className="tabular-nums">
          Page {page.page + 1} of {Math.max(1, page.totalPages)}
        </span>
        <button type="button" aria-label="Next page" disabled={loading || page.page + 1 >= page.totalPages} onClick={() => onPage(page.page + 1)} className={btn}>
          <ChevronRightIcon size={15} />
        </button>
      </span>
    </nav>
  );
}

function YourOffers({ orgId, view, selected, a, notice }: { orgId: number; view: OffersView; selected: number[]; a: Actions; notice: string }) {
  const [query, setQuery] = useState<OfferQuery>(EMPTY_QUERY);
  const [text, setText] = useState("");
  const [fetched, setFetched] = useState<{ key: string; result: Fetched<OfferPage> } | null>(null);
  const tick = view.generatedAt;
  const key = `${JSON.stringify(query)}|${tick}`;
  const isDefault = isDefaultQuery(query);

  // the search box applies to the table half a second after typing stops
  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.q === text.trim() ? q : { ...q, q: text.trim(), page: 0 })), 350);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    if (isDefault) return;
    const ctl = new AbortController();
    void fetchOfferList(orgId, query, ctl.signal).then((result) => {
      if (!ctl.signal.aborted) setFetched({ key, result });
    });
    return () => ctl.abort();
  }, [orgId, query, isDefault, key]);

  const current = !isDefault && fetched && fetched.key === key ? fetched.result : null;
  const loading = !isDefault && current === null;
  const failed = current !== null && (current.kind !== "OK" || !current.view);
  const shown: OfferPage = isDefault ? view.offers : current?.view ?? { ...view.offers, items: [], page: query.page };
  const anySample = shown.items.some((r) => r.sample) || view.compare.some((r) => r.sample);
  const total = view.tiles.total.value;
  const set = (patch: Partial<OfferQuery>) => setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 0 }));
  const filtered = !isDefault || query.sort !== "recent";

  return (
    <Panel
      id="offers-list"
      title={`Your Offers (${total})`}
      icon={FileTextIcon}
      extra={
        filtered ? (
          <button
            type="button"
            onClick={() => {
              setText("");
              setQuery(EMPTY_QUERY);
            }}
            className="flex-none text-[13px] font-semibold text-accent-deep hover:underline"
          >
            View All
          </button>
        ) : null
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)]">
        <PillSelect label="Sort offers" value={query.sort} onChange={(v) => set({ sort: v as SortKey })} options={SORT_OPTIONS.map((o, i) => ({ value: o.value, label: i === 0 ? `All Offers (${total})` : o.label }))} />
        <PillSelect label="Filter by status" value={query.status} onChange={(v) => set({ status: v })} options={STATUS_FILTERS} />
        <PillSelect label="Filter by company" value={query.company} onChange={(v) => set({ company: v })} options={[{ value: "", label: "Company" }, ...view.companies.map((c) => ({ value: c, label: c }))]} />
        <PillSelect label="Filter by work mode" value={query.workMode} onChange={(v) => set({ workMode: v })} options={MODE_FILTERS} />
        <label className="relative block min-w-0 sm:col-span-2 xl:col-span-1">
          <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            aria-label="Search offers"
            placeholder="Search offers..."
            value={text}
            maxLength={80}
            onChange={(e) => setText(e.target.value)}
            className="min-h-10 w-full rounded-lg border border-line bg-paper-2/60 py-1 pl-9 pr-3 text-[13px] text-ink"
          />
        </label>
      </div>
      {anySample ? (
        <p data-sample-note className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <SampleMark />
          Offers come from the employer side, which is not connected yet, so these are demo stand-ins. Your answers are real.
        </p>
      ) : null}
      <p role="status" aria-live="polite" data-notice className={cn("mt-2 text-[12.5px] font-medium text-v2-coral-ink", !notice && "sr-only")}>
        {notice}
      </p>
      <div className="mt-3" aria-busy={loading}>
        {failed ? (
          <ErrorState what="your offers" description="The offers didn't load. Nothing has changed." variant="inline" />
        ) : shown.items.length > 0 ? (
          <OffersTable rows={shown.items} selected={selected} a={a} />
        ) : loading ? (
          <Skeleton className="h-40 w-full" />
        ) : total === 0 ? (
          <Empty>No offers yet. When an employer makes you an offer, it will show up here.</Empty>
        ) : (
          <Empty>No offers match these filters.</Empty>
        )}
      </div>
      <Pager page={shown} shown={shown.items.length} loading={loading} onPage={(p) => set({ page: p })} />
    </Panel>
  );
}

/* ── compare ────────────────────────────────────────────────────────────────────────── */

function CompareTable({ view, selected, a }: { view: OffersView; selected: number[]; a: Actions }) {
  return (
    <div className="relative overflow-x-auto">
      <table className={cn(TABLE, "min-w-[560px]")}>
        <thead>
          <tr className="text-left text-[12px] font-semibold text-muted">
            <th scope="col" className="w-9 bg-paper-2/60 px-2.5 py-2 first:rounded-l-lg">
              <span className="sr-only">Select to compare</span>
            </th>
            {["Company", "Role", "Base Salary", "Total Compensation", "Work Mode", "Start Date"].map((c) => (
              <th key={c} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2 py-2 font-semibold last:rounded-r-lg", c === "Start Date" && "hidden 2xl:table-cell")}>
                {c === "Total Compensation" ? (
                  <span className="inline-flex items-center gap-1">
                    {c}
                    <InfoIcon size={13} aria-label="Total compensation is the figure recorded in the offer: base plus bonus and equity as the employer valued them. It is a record, not a payment." />
                  </span>
                ) : (
                  c
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {view.compare.map((r) => (
            <tr key={r.id} data-compare-row={r.id}>
              <td className="px-2.5 py-2.5 align-middle">
                <input type="checkbox" aria-label={`Compare ${r.role} at ${r.company}`} checked={selected.includes(r.id)} onChange={() => a.toggle(r)} className={CHECK} />
              </td>
              <td className={TD}>
                <CompanyCell name={r.company} />
              </td>
              <td className={TD}>{r.role}</td>
              <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatMoney(r.baseSalaryMinor, r.currency)}</td>
              <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatMoney(r.totalCompMinor, r.currency)}</td>
              <td className={TD}>
                <ModePill mode={r.workMode} />
              </td>
              <td className={cn(TD, "hidden whitespace-nowrap 2xl:table-cell")}>{dateLabel(r.startDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The side-by-side view of the chosen offers: one column per offer, one row per fact, money from minor units. */
function SideBySide({ rows, onClear }: { rows: OfferRow[]; onClear: () => void }) {
  const facts: { label: string; cell: (r: OfferRow) => ReactNode }[] = [
    { label: "Base Salary", cell: (r) => formatMoney(r.baseSalaryMinor, r.currency) },
    { label: "Total Compensation", cell: (r) => formatMoney(r.totalCompMinor, r.currency) },
    { label: "Package", cell: (r) => r.packageSummary ?? "-" },
    { label: "Work Mode", cell: (r) => <ModePill mode={r.workMode} /> },
    { label: "Start Date", cell: (r) => dateLabel(r.startDate) },
    { label: "Offer Deadline", cell: (r) => dateLabel(r.offerDeadline) },
    { label: "Status", cell: (r) => <StatusPill status={r.status} /> },
  ];
  return (
    <div data-compare-result className="mt-4 rounded-xl border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-bold text-ink">Side by side</h3>
        <button type="button" onClick={onClear} className="text-[13px] font-semibold text-accent-deep hover:underline">
          Clear selection
        </button>
      </div>
      <div className="relative overflow-x-auto">
        <table className={cn(TABLE, "min-w-[420px]")}>
          <thead>
            <tr className="text-left text-[12px] font-semibold text-muted">
              <th scope="col" className="bg-paper-2/60 px-2 py-2 first:rounded-l-lg">
                <span className="sr-only">Detail</span>
              </th>
              {rows.map((r) => (
                <th key={r.id} scope="col" className="bg-paper-2/60 px-2 py-2 font-semibold last:rounded-r-lg">
                  <span className="block text-ink">{r.company}</span>
                  <span className="block font-normal">{r.role}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {facts.map((f) => (
              <tr key={f.label} data-compare-fact={f.label}>
                <th scope="row" className="whitespace-nowrap px-2 py-2.5 text-left text-[12.5px] font-semibold text-muted">
                  {f.label}
                </th>
                {rows.map((r) => (
                  <td key={r.id} className={cn(TD, "tabular-nums")}>
                    {f.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparePanel({ view, selected, comparing, setComparing, onClear, capNotice, a }: { view: OffersView; selected: number[]; comparing: boolean; setComparing: (v: boolean) => void; onClear: () => void; capNotice: boolean; a: Actions }) {
  const chosen = comparedRows(view.compare, selected);
  const ready = chosen.length >= 2;
  return (
    <Panel
      id="offers-compare"
      title="Compare Offers"
      subtitle={`Select up to ${MAX_COMPARE} offers to compare key details side by side.`}
      icon={BarChartIcon}
      extra={
        <button type="button" data-action="compare" disabled={!ready} onClick={() => setComparing(true)} className={cn(BTN_LINE, "flex-none")}>
          {compareLabel(selected.length)}
        </button>
      }
    >
      <p role="status" aria-live="polite" data-compare-notice className={cn("mb-2 text-[12.5px] font-medium text-v2-coral-ink", !capNotice && "sr-only")}>
        {capNotice ? `You can compare up to ${MAX_COMPARE} offers. Remove one to add another.` : ""}
      </p>
      {view.compare.length === 0 ? <Empty>Nothing to compare yet.</Empty> : <CompareTable view={view} selected={selected} a={a} />}
      {!ready && selected.length === 1 ? <p className="mt-2 text-[12.5px] text-muted">Pick at least one more offer to compare.</p> : null}
      {comparing && ready ? <SideBySide rows={chosen} onClear={onClear} /> : null}
    </Panel>
  );
}

/* ── recent activity ────────────────────────────────────────────────────────────────── */

const DOT: Record<string, string> = { RECEIVED: "text-v2-amber-ink", UPDATED: "text-v2-violet-ink", NEGOTIATING: "text-v2-violet-ink", ACCEPTED: "text-v2-green-ink", DECLINED: "text-v2-coral-ink" };

function ActivityList({ items, now, withTime = true }: { items: { label: string; kind: string; occurredAt: string; sub?: string }[]; now: number; withTime?: boolean }) {
  return (
    <ol className="space-y-3.5">
      {items.map((e, i) => (
        <li key={`${e.kind}-${e.occurredAt}-${i}`} data-activity={e.kind} className="flex items-start gap-3">
          <span aria-hidden className={cn("mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-current", DOT[e.kind] ?? "text-muted")} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-bold leading-tight text-ink">{e.label}</span>
            {e.sub ? <span className="block text-[12.5px] text-muted">{e.sub}</span> : null}
          </span>
          {withTime ? <span className="flex-none text-[12px] text-muted">{relativeTime(e.occurredAt, now)}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function ActivityCard({ items, now }: { items: OfferActivity[]; now: number }) {
  return (
    <Card id="offers-activity" title="Recent Offer Activity" icon={ClockIcon}>
      {items.length === 0 ? (
        <Empty>No activity yet.</Empty>
      ) : (
        <ActivityList now={now} items={items.map((e) => ({ label: e.label, kind: e.kind, occurredAt: e.occurredAt, sub: [e.company, e.role].filter(Boolean).join(" - ") }))} />
      )}
    </Card>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

function QuickActions({ firstOpen, firstAny, a }: { firstOpen: OfferRow | null; firstAny: OfferRow | null; a: Actions }) {
  const tile = "flex h-full min-h-[64px] w-full items-center gap-2.5 rounded-xl border border-line bg-paper p-2.5 text-left hover:bg-paper-2/60 disabled:cursor-not-allowed disabled:opacity-60";
  const body = (Icon: ComponentType<IconProps>, label: string, hint: string) => (
    <>
      <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", TONES.accent)}>
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold leading-tight text-ink">{label}</span>
        <span className="block text-[11.5px] leading-snug text-muted">{hint}</span>
      </span>
    </>
  );
  return (
    <Card id="offers-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <li className="min-w-0">
          <button type="button" data-quick="details" disabled={!firstAny} onClick={() => firstAny && a.view(firstAny)} className={tile}>
            {body(FileTextIcon, "View Offer Details", "See full offer information")}
          </button>
        </li>
        <li className="min-w-0">
          <button
            type="button"
            data-quick="compare"
            onClick={() => document.getElementById("offers-compare")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={tile}
          >
            {body(SearchIcon, "Compare Offers", "Compare multiple offers")}
          </button>
        </li>
        <li className="min-w-0">
          <Link href={`${BASE}/marketer`} data-quick="marketer" className={tile}>
            {body(MessageIcon, "Ask My Marketer", "Get personalized advice")}
          </Link>
        </li>
        <li className="min-w-0">
          <button type="button" data-quick="respond" disabled={!firstOpen} onClick={() => firstOpen && a.respond(firstOpen)} className={tile}>
            {body(SendIcon, "Respond to Offer", "Accept, negotiate or decline")}
          </button>
        </li>
      </ul>
    </Card>
  );
}

/* ── the detail sheet ───────────────────────────────────────────────────────────────── */

function DetailSheet({ row, detail, busy, onClose, onRespond, now }: { row: OfferRow | null; detail: Fetched<OfferDetail> | null; busy: boolean; onClose: () => void; onRespond: (kind: Kind, r: OfferRow) => void; now: number }) {
  const live = detail?.kind === "OK" && detail.view ? detail.view : null;
  const r = live?.row ?? row;
  const dl = r ? deadlineInfo(r) : null;
  return (
    <SideSheet
      id="offer-detail-sheet"
      side="right"
      mode="overlay"
      width={560}
      open={row !== null}
      title={r ? `${r.role}` : "Offer"}
      description={r ? r.company : undefined}
      icon={<FileTextIcon size={20} />}
      onClose={onClose}
      footer={
        live?.canRespond && r ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => onRespond("decline", r)} className={BTN_LINE}>
              Decline
            </button>
            {live.canNegotiate ? (
              <button type="button" disabled={busy} onClick={() => onRespond("negotiate", r)} className={BTN_LINE}>
                Negotiate
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => onRespond("accept", r)} className={BTN_SOLID}>
              Accept Offer
            </button>
          </div>
        ) : undefined
      }
    >
      {!r ? null : detail === null ? (
        <div aria-busy="true" className="space-y-3 pt-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !live ? (
        <ErrorState what="this offer" description="The details didn't load. Nothing has changed." variant="inline" />
      ) : (
        <div data-offer-detail={r.id} className="space-y-5 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={r.status} />
            <ModePill mode={r.workMode} />
            {r.sample ? <SampleMark /> : null}
          </div>
          <dl className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <Fact label="Base Salary">{formatMoney(r.baseSalaryMinor, r.currency)}</Fact>
            <Fact label="Total Compensation">{formatMoney(r.totalCompMinor, r.currency)}</Fact>
            <Fact label="Package">{r.packageSummary ?? "-"}</Fact>
            <Fact label="Start Date">{dateLabel(r.startDate)}</Fact>
            <Fact label="Offer Deadline">
              <span className={dl?.urgent ? "font-semibold text-v2-coral-ink" : undefined}>
                {dl?.date}
                {dl?.left ? ` ${dl.left}` : ""}
              </span>
            </Fact>
          </dl>
          <section aria-label="Benefits">
            <h3 className="text-[14px] font-bold text-ink">Benefits</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{live.benefitsSummary ?? "No benefits text was recorded with this offer."}</p>
          </section>
          {live.responseNote ? (
            <section aria-label="Your note">
              <h3 className="text-[14px] font-bold text-ink">Your note</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{live.responseNote}</p>
            </section>
          ) : null}
          <section aria-label="Timeline">
            <h3 className="text-[14px] font-bold text-ink">Timeline</h3>
            {live.events.length === 0 ? (
              <p className="mt-1 text-[13px] text-muted">Nothing has happened on this offer yet.</p>
            ) : (
              <div className="mt-2">
                <ActivityList now={now} withTime={false} items={live.events.map((e) => ({ label: e.label, kind: e.kind, occurredAt: e.occurredAt, sub: stampLabel(e.occurredAt) }))} />
              </div>
            )}
          </section>
          {!live.canRespond && r.status === "EXPIRED" ? <p className="text-[13px] text-v2-coral-ink">The deadline has passed, so this offer can no longer be answered here. Ask your marketer.</p> : null}
          <p className="text-[12px] text-muted">Your answer is recorded in Kiwiply only. Nothing is signed, sent to the client or paid from here, and accepting does not start a placement.</p>
        </div>
      )}
    </SideSheet>
  );
}

/* ── the three confirmations ────────────────────────────────────────────────────────── */

type Kind = "accept" | "decline" | "negotiate";
interface Responding {
  kind: Kind;
  row: OfferRow;
}

function RespondDialog({ responding, busy, error, onCancel, onConfirm }: { responding: Responding | null; busy: boolean; error: string | null; onCancel: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const kind = responding?.kind ?? "accept";
  const required = kind === "negotiate";
  const problem = touched && kind !== "accept" ? noteProblem(note, required) : null;
  const close = () => {
    setNote("");
    setTouched(false);
    onCancel();
  };
  const row = responding?.row;
  const title = kind === "accept" ? "Accept this offer?" : kind === "decline" ? "Decline this offer?" : "Ask to negotiate?";
  const submit = kind === "accept" ? "Yes, accept offer" : kind === "decline" ? "Decline offer" : "Send request";
  return (
    <Dialog
      open={responding !== null}
      onClose={close}
      title={title}
      description={row ? `${row.role} at ${row.company}` : undefined}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setTouched(true);
              if (kind === "accept" || !noteProblem(note, required)) onConfirm(note.trim());
            }}
          >
            {submit}
          </Button>
        </div>
      }
    >
      {kind === "accept" ? (
        <p data-accept-copy className="text-[13.5px] leading-relaxed text-ink-soft">
          {ACCEPT_COPY}
        </p>
      ) : (
        <>
          <label className="block text-[13px] font-semibold text-ink">
            {kind === "decline" ? "Why are you declining? (optional)" : "What would you like to discuss?"}
            <textarea
              aria-label={kind === "decline" ? "Reason for declining" : "What you would like to negotiate"}
              value={note}
              maxLength={MAX_NOTE + 50}
              rows={4}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={problem !== null || error !== null}
              className="mt-1.5 w-full rounded-lg border border-line bg-paper p-2.5 text-[13.5px] font-normal text-ink"
              placeholder={kind === "decline" ? "For example: the role needs a daily commute." : "For example: I would like to talk about the base salary and the start date."}
            />
          </label>
          <p className="mt-1 flex justify-between gap-2 text-[12px] text-muted">
            <span role="alert" className="text-v2-coral-ink">
              {problem ?? error ?? ""}
            </span>
            <span className="tabular-nums">
              {note.trim().length}/{MAX_NOTE}
            </span>
          </p>
          <p className="mt-2 text-[12px] text-muted">Your marketer sees this. Please don&apos;t include personal identifiers such as ID or account numbers.</p>
        </>
      )}
      {kind === "accept" && error ? (
        <p role="alert" className="mt-2 text-[12.5px] text-v2-coral-ink">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

type DetailState = { id: number; result: Fetched<OfferDetail> } | null;

export interface OffersPageProps {
  orgId: number;
  firstName: string;
}

export default function ConsultantOffersPage({ orgId, firstName: first }: OffersPageProps) {
  const router = useRouter();
  const toast = useToast();
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchOffers(orgId), [orgId]));
  const loading = status === "loading";
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [capNotice, setCapNotice] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [state, setState] = useState<DetailState>(null);
  const [responding, setResponding] = useState<Responding | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  const now = view ? Date.parse(view.generatedAt) || 0 : 0; // the server clock at the time of the answer

  const knownRow = useMemo(() => {
    if (viewId === null) return null;
    return view?.compare.find((r) => r.id === viewId) ?? view?.offers.items.find((r) => r.id === viewId) ?? (state && state.id === viewId && state.result.view ? state.result.view.row : null) ?? null;
  }, [viewId, view, state]);

  useEffect(() => {
    if (viewId === null) return;
    const ctl = new AbortController();
    void fetchOfferDetail(orgId, viewId, ctl.signal).then((result) => {
      if (!ctl.signal.aborted) setState({ id: viewId, result });
    });
    return () => ctl.abort();
  }, [orgId, viewId, view?.generatedAt]);

  const toggle = (r: OfferRow) => {
    const { next, capped } = toggleSelection(selected, r.id);
    setSelected(next);
    setCapNotice(capped);
    if (next.length < 2) setComparing(false);
  };

  const finish = async (res: WriteResult, success: { title: string; description: string }) => {
    if (res.ok) {
      setResponding(null);
      setRespondError(null);
      toast({ title: success.title, description: success.description, variant: "success" });
    } else if (res.status === 409) {
      setResponding(null);
      setNotice(res.message ?? "This offer was already answered or its deadline has passed.");
    } else setRespondError(res.message ?? "We couldn't record your answer. Nothing has changed.");
    if (res.ok || res.status === 409) {
      setNotice(res.ok ? "" : res.message ?? "This offer was already answered or its deadline has passed.");
      await reload();
    }
  };

  const confirm = (note: string) => {
    const r = responding;
    if (!r) return;
    setRespondError(null);
    setNotice("");
    setBusy(true);
    const run = async () => {
      try {
        if (r.kind === "accept") await finish(await acceptOffer(orgId, r.row.id), { title: "Offer accepted", description: "Your answer is recorded. Nothing was signed or sent to the client by Kiwiply; your marketer takes the next steps." });
        else if (r.kind === "decline") await finish(await declineOffer(orgId, r.row.id, note), { title: "Offer declined", description: "Your answer is recorded." });
        else await finish(await negotiateOffer(orgId, r.row.id, note), { title: "Negotiation requested", description: "Your marketer will see what you would like to discuss." });
      } finally {
        setBusy(false);
      }
    };
    void run();
  };

  const actions: Actions = {
    view: (r) => {
      setState(null);
      setViewId(r.id);
    },
    // Accept, Decline and Negotiate live in the detail sheet, so "respond" opens it
    respond: (r) => {
      setState(null);
      setViewId(r.id);
    },
    toggle,
    go: (href) => router.push(href),
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const detail = state && state.id === viewId ? state.result : null;
  const firstOpen = view?.compare.find(isOpen) ?? null;
  const firstAny = view?.compare[0] ?? null;

  return (
    <div data-consultant-offers data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Offers" subtitle="Review and manage your job offers. Compare opportunities, get guidance, and take the next step in your career." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your offers" description="Your offers didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <section aria-label="Key numbers" data-offers-tiles className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
            {TILE_SPECS.map((s, i) => (
              <Tile key={s.key} spec={s} tile={loading || !view ? null : view.tiles[s.key]} index={i} />
            ))}
          </section>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.3fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
              {view ? (
                <YourOffers orgId={orgId} view={view} selected={selected} a={actions} notice={notice} />
              ) : (
                <div className="grid gap-4" aria-busy="true">
                  <Skeleton className="h-72 w-full" />
                </div>
              )}
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)]">
              <BeeCard
                name={firstName(first)}
                title="Review your offers with confidence!"
                body="Take time to evaluate the full offer package, including compensation, benefits, work arrangements, and growth opportunities. I'm here to help you understand your options and make the best decision for your career."
              />
              <QuickActions firstOpen={firstOpen} firstAny={firstAny} a={actions} />
            </div>
          </div>
          {view ? (
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <ComparePanel view={view} selected={selected} comparing={comparing} setComparing={setComparing} onClear={() => { setSelected([]); setComparing(false); setCapNotice(false); }} capNotice={capNotice} a={actions} />
              <ActivityCard items={view.activity} now={now} />
            </div>
          ) : null}
        </>
      )}

      <DetailSheet
        row={knownRow}
        detail={detail}
        busy={busy}
        onClose={() => setViewId(null)}
        now={now}
        onRespond={(kind, r) => {
          setRespondError(null);
          setViewId(null);
          setResponding({ kind, row: r });
        }}
      />
      <RespondDialog key={responding ? `${responding.kind}-${responding.row.id}` : "closed"} responding={responding} busy={busy} error={respondError} onCancel={() => setResponding(null)} onConfirm={confirm} />
    </div>
  );
}
