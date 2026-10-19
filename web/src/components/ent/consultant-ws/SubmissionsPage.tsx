"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  AlertIcon,
  Button,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  Dialog,
  ErrorState,
  FileTextIcon,
  MessageIcon,
  Menu,
  MoreVerticalIcon,
  SearchIcon,
  BriefcaseIcon,
  CalendarCheckIcon,
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
import { deltaText, employmentLabel, firstName, placeLabel } from "@/lib/ent/consultant-ws/home";
import type { Viewer } from "@/lib/actors";
import { UpdatedMeta, seatViewer } from "@/components/ent/applications/changeAudit";
import {
  APPROVE_COPY,
  CHECKLIST,
  DUE_TEXT,
  MAX_REASON,
  SORT_OPTIONS,
  STATUS_FILTERS,
  approveSubmission,
  declineSubmission,
  dueOf,
  fetchDetail,
  fetchPast,
  fetchSubmissions,
  reasonProblem,
  rangeText,
  shortDate,
  sortPending,
  statusInfo,
  submittedStamp,
  versionText,
  whenOf,
  type Fetched,
  type PastPage,
  type StatusIcon,
  type SortKey,
  type SubDetail,
  type SubRow,
  type SubTile,
  type SubmissionsView,
} from "@/lib/ent/consultant-ws/submissions";

/**
 * Consultant Submissions & Approvals (design/enterprise-consultant/submissions.webp): one call to
 * `GET /api/orgs/{orgId}/me-workspace/submissions` draws the page for the signed-in consultant's OWN submissions. Approve and Decline only
 * record the consultant's decision (the API says "already decided" with a 409 and the page reloads); nothing is sent to a client from
 * here and Kiwiply never submits. Rows flagged `sample` are demo stand-ins for the marketer / client side, and say so.
 */

const PAGE_SIZE = 5;

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

interface TileSpec {
  key: keyof SubmissionsView["tiles"];
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
}
const TILE_SPECS: TileSpec[] = [
  { key: "pending", title: "Pending Approvals", icon: FileTextIcon, tone: "accent" },
  { key: "approved", title: "Approved Submissions", icon: CheckCircleIcon, tone: "green" },
  { key: "submitted", title: "Submitted to Client", icon: SendIcon, tone: "accent" },
  { key: "attention", title: "Needs Attention", icon: AlertIcon, tone: "amber" },
];

function Tile({ spec, tile, index }: { spec: TileSpec; tile: SubTile | null; index: number }) {
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
                    {d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "→"} {d.text}
                  </span>
                  <span>vs last {tile.vs}</span>
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

const STATUS_ICON: Record<StatusIcon, ComponentType<IconProps> | null> = { send: SendIcon, check: CheckCircleIcon, x: XCircleIcon, users: UsersIcon, clock: ClockIcon, none: null };

function StatusPill({ status }: { status: SubRow["status"] }) {
  const s = statusInfo(status);
  const Icon = STATUS_ICON[s.icon];
  return (
    <Pill tone={s.tone} className="min-h-7 gap-1.5 rounded-full px-3 text-[12.5px]">
      {Icon ? <Icon size={14} /> : null}
      {s.label}
    </Pill>
  );
}

function JobCell({ row, children }: { row: SubRow; children?: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-lg", TONES.accent)}>
        <FileTextIcon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold leading-tight text-ink">{row.title}</span>
        <span className="block text-[12px] text-muted">{employmentLabel(row.employment) ?? "-"}</span>
        {children}
      </span>
    </span>
  );
}

const ClientCell = ({ name }: { name: string | null }) => (
  <span className="flex items-center gap-1.5">
    <CompanyMark name={name} />
    <span className="min-w-0 truncate">{name ?? "-"}</span>
  </span>
);

const selectCls = "min-h-9 appearance-none rounded-lg border border-line bg-paper py-1 pl-3 pr-8 text-[13px] font-semibold text-ink";

function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <span className="relative">
        <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}

/** A card whose heading wraps instead of truncating (the board's two long titles), with its sentence under it. */
function Panel({ id, title, subtitle, extra, children, note }: { id: string; title: string; subtitle: string; extra?: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <section aria-labelledby={id} data-home-card={id} className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-[10px]", TONES.accent)}>
          <FileTextIcon size={19} />
        </span>
        <div className="min-w-0 flex-1 basis-60">
          <h2 id={id} className="text-[17px] font-extrabold leading-tight text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>
        </div>
        {extra}
      </header>
      {note}
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

const SampleNote = () => (
  <p data-sample-note className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
    <SampleMark />
    Marketer notes and client updates are demo stand-ins until those roles are connected.
  </p>
);

const BTN_SOLID = "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-paper hover:bg-accent-deep disabled:opacity-60";
const BTN_LINE = "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft disabled:opacity-60";

/* ── awaiting your approval ─────────────────────────────────────────────────────────── */

interface Actions {
  approve: (r: SubRow) => void;
  decline: (r: SubRow) => void;
  review: (r: SubRow) => void;
  go: (href: string) => void;
}

function PendingTable({ rows, busy, a, now }: { rows: SubRow[]; busy: Set<number>; a: Actions; now: number }) {
  return (
    <div className="relative overflow-x-auto">
      <table className={cn(TABLE, "min-w-[660px]")}>
        <thead>
          <tr className="text-left text-[12px] font-semibold text-muted">
            {["Job Title", "Client / Company", "Resume Version", "Marketer Note", "Due Time", "Actions"].map((c) => (
              <th key={c} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2.5 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg", c === "Marketer Note" && "hidden 2xl:table-cell")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const due = dueOf(r.dueAt, now);
            const off = busy.has(r.id);
            return (
              <tr key={r.id} data-submission={r.id} data-attention={r.attention}>
                <td className={cn(TD, "max-w-[220px]")}>
                  <JobCell row={r}>
                    {/* below 2xl the note column is hidden to keep the actions reachable; the note moves under the title */}
                    {r.marketerNote ? <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink-soft 2xl:hidden">{r.marketerNote}</span> : null}
                  </JobCell>
                </td>
                <td className={TD}>
                  <ClientCell name={r.company} />
                </td>
                <td className={TD}>
                  {r.resumeVersion !== null || r.resumeId !== null ? (
                    <Link href={`${BASE}/resumes`} aria-label={`Open resume ${versionText(r.resumeVersion)} in My Resumes`} className="block font-semibold text-accent-deep hover:underline">
                      {versionText(r.resumeVersion) || "Resume"}
                      <span className="block text-[12px] font-normal text-muted">{shortDate(r.resumeUpdatedAt)}</span>
                    </Link>
                  ) : (
                    <span className="text-[12px] text-muted">No resume attached</span>
                  )}
                </td>
                <td className={cn(TD, "hidden max-w-[220px] text-[12.5px] leading-snug text-ink-soft 2xl:table-cell")}>{r.marketerNote ?? <span className="text-muted">-</span>}</td>
                <td className={cn(TD, "whitespace-nowrap")}>
                  <span data-due={due.kind} className={cn("block font-semibold", DUE_TEXT[due.kind])}>
                    {due.head}
                  </span>
                  {due.sub ? <span className={cn("block text-[12px]", due.kind === "later" ? "text-ink-soft" : DUE_TEXT[due.kind])}>{due.sub}</span> : null}
                </td>
                <td className={TD}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <button type="button" data-action="approve" disabled={off} aria-label={`Approve ${r.title}`} onClick={() => a.approve(r)} className={BTN_SOLID}>
                      Approve
                    </button>
                    <button type="button" data-action="decline" disabled={off} aria-label={`Decline ${r.title}`} onClick={() => a.decline(r)} className={BTN_LINE}>
                      Decline
                    </button>
                    <button type="button" data-action="review" aria-label={`Review ${r.title}`} onClick={() => a.review(r)} className={BTN_LINE}>
                      Review
                    </button>
                    <RowMenu row={r} a={a} />
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

function RowMenu({ row, a }: { row: SubRow; a: Actions }) {
  return (
    <Menu
      trigger={
        <button type="button" aria-label={`More actions for ${row.title}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
          <MoreVerticalIcon size={16} />
        </button>
      }
      items={[
        { label: "View details", icon: <SearchIcon size={15} />, onSelect: () => a.review(row) },
        { label: "Open My Resumes", icon: <FileTextIcon size={15} />, onSelect: () => a.go(`${BASE}/resumes`) },
        { label: "Contact my marketer", icon: <MessageIcon size={15} />, onSelect: () => a.go(`${BASE}/marketer`) },
      ]}
    />
  );
}

function Awaiting({ view, busy, a, notice, now }: { view: SubmissionsView; busy: Set<number>; a: Actions; notice: string; now: number }) {
  const [sort, setSort] = useState<SortKey>("due");
  const rows = useMemo(() => sortPending(view.pending, sort), [view.pending, sort]);
  const anySample = view.pending.some((r) => r.sample);
  return (
    <Panel
      id="subs-pending"
      title="Submissions Awaiting Your Approval"
      subtitle="Review the details below and approve or decline submissions from your marketer."
      extra={<PillSelect label="Sort by" value={sort} onChange={(v) => setSort(v as SortKey)} options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />}
      note={anySample ? <SampleNote /> : null}
    >
      <p role="status" aria-live="polite" data-notice className={cn("mb-2 text-[12.5px] font-medium text-v2-coral-ink", !notice && "sr-only")}>
        {notice}
      </p>
      {rows.length === 0 ? <Empty>Nothing is waiting for your approval. When your marketer prepares a submission for you, it will show up here.</Empty> : <PendingTable rows={rows} busy={busy} a={a} now={now} />}
    </Panel>
  );
}

/* ── past submissions ───────────────────────────────────────────────────────────────── */

function PastTable({ page, a }: { page: PastPage; a: Actions }) {
  return (
    <div className="relative overflow-x-auto">
      <table className={cn(TABLE, "min-w-[640px]")}>
        <thead>
          <tr className="text-left text-[12px] font-semibold text-muted">
            {["Job Title", "Client / Company", "Submitted On", "Status", "Client Update", "Actions"].map((c) => (
              <th key={c} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2.5 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg", c === "Client Update" && "hidden 2xl:table-cell")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {page.items.map((r) => {
            const when = whenOf(submittedStamp(r));
            const upd = r.clientUpdate;
            return (
              <tr key={r.id} data-past={r.id} data-status={r.status}>
                <td className={cn(TD, "max-w-[200px]")}>
                  <span className="block font-semibold leading-tight text-ink">{r.title}</span>
                  <span className="block text-[12px] text-muted">{employmentLabel(r.employment) ?? "-"}</span>
                </td>
                <td className={TD}>
                  <ClientCell name={r.company} />
                </td>
                <td className={cn(TD, "whitespace-nowrap")}>
                  {when.date ? (
                    <>
                      <span className="block text-ink">{when.date}</span>
                      <span className="block text-[12px] text-muted">{r.submittedOn ? when.time : "Decided"}</span>
                    </>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td className={TD}>
                  <StatusPill status={r.status} />
                  {upd ? (
                    <span className="mt-1 block text-[12px] text-ink-soft 2xl:hidden">
                      {upd}
                      {r.clientUpdateAt ? <span className="text-muted">{` - ${shortDate(r.clientUpdateAt)}`}</span> : null}
                    </span>
                  ) : null}
                </td>
                <td className={cn(TD, "hidden whitespace-nowrap 2xl:table-cell")}>
                  {upd ? (
                    <>
                      <span className="block text-ink">{upd}</span>
                      <span className="block text-[12px] text-muted">{shortDate(r.clientUpdateAt)}</span>
                    </>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td className={TD}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <button type="button" data-action="details" aria-label={`View details of ${r.title}`} onClick={() => a.review(r)} className={BTN_LINE}>
                      View Details
                    </button>
                    <RowMenu row={r} a={a} />
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

function Pager({ page, shown, loading, onPage }: { page: PastPage; shown: number; loading: boolean; onPage: (p: number) => void }) {
  if (page.total === 0) return null;
  const btn = "grid h-8 w-8 place-items-center rounded-lg border border-line bg-paper text-accent-deep hover:bg-accent-soft disabled:opacity-50";
  return (
    <nav aria-label="Past submissions pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
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

function Past({ orgId, view, a, tick }: { orgId: number; view: SubmissionsView; a: Actions; tick: string }) {
  const [filter, setFilter] = useState("");
  const [pageNo, setPageNo] = useState(0);
  const [fetched, setFetched] = useState<{ key: string; result: Fetched<PastPage> } | null>(null);
  const key = `${filter}|${pageNo}|${tick}`;
  const isDefault = filter === "" && pageNo === 0;

  useEffect(() => {
    if (isDefault) return;
    const ctl = new AbortController();
    void fetchPast(orgId, filter, pageNo, PAGE_SIZE, ctl.signal).then((result) => {
      if (!ctl.signal.aborted) setFetched({ key, result });
    });
    return () => ctl.abort();
  }, [orgId, filter, pageNo, isDefault, key]);

  const current = !isDefault && fetched && fetched.key === key ? fetched.result : null;
  const loading = !isDefault && current === null;
  const failed = current !== null && (current.kind !== "OK" || !current.view);
  const shown: PastPage = isDefault ? view.past : current?.view ?? { ...view.past, items: [], page: pageNo, status: filter || null };
  const anySample = shown.items.some((r) => r.sample);

  return (
    <Panel
      id="subs-past"
      title="Past Submissions"
      subtitle="Track the status of your previous submissions and what happens next."
      extra={
        <PillSelect
          label="Status"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPageNo(0);
          }}
          options={STATUS_FILTERS}
        />
      }
      note={anySample ? <SampleNote /> : null}
    >
      {loading ? (
        <div aria-busy="true" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : failed ? (
        <ErrorState what="your past submissions" description="They didn't load. Nothing has changed." variant="inline" onRetry={() => setFetched(null)} />
      ) : shown.items.length === 0 ? (
        <Empty>{filter ? "No past submissions have this status." : "No past submissions yet. Once you approve or decline one, it will be listed here."}</Empty>
      ) : (
        <>
          <PastTable page={shown} a={a} />
          <Pager page={shown} shown={shown.items.length} loading={loading} onPage={setPageNo} />
        </>
      )}
    </Panel>
  );
}

/* ── review sheet ───────────────────────────────────────────────────────────────────── */

type DetailState = { id: number; result: Fetched<SubDetail> } | null;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

function ReviewSheet({ row, detail, busy, onClose, a, me }: { row: SubRow | null; detail: Fetched<SubDetail> | null; busy: boolean; onClose: () => void; a: Actions; me: Viewer }) {
  const live = detail?.kind === "OK" && detail.view ? detail.view : null;
  const [now] = useState(() => Date.now());
  const r = live?.row ?? row;
  const pending = r?.status === "PENDING_APPROVAL";
  const due = r ? dueOf(r.dueAt) : null;
  return (
    <SideSheet
      id="submission-review-sheet"
      side="right"
      mode="overlay"
      width={560}
      open={row !== null}
      title={r?.title ?? "Submission"}
      description={r ? [r.company, employmentLabel(r.employment)].filter(Boolean).join(" - ") : undefined}
      icon={<FileTextIcon size={20} />}
      onClose={onClose}
      footer={
        pending && r ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => a.decline(r)} className={BTN_LINE}>
              Decline
            </button>
            <button type="button" disabled={busy} onClick={() => a.approve(r)} className={BTN_SOLID}>
              Approve
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
        <ErrorState what="this submission" description="The details didn't load. Nothing has changed." variant="inline" />
      ) : (
        <div data-review={r.id} className="space-y-5 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={r.status} />
            {pending && due ? <span className={cn("text-[13px] font-semibold", DUE_TEXT[due.kind])}>{`Due ${due.head.toLowerCase() === due.head ? due.head : due.head}${due.sub ? `, ${due.sub}` : ""}`}</span> : null}
            {r.sample ? <SampleMark /> : null}
          </div>
          <UpdatedMeta updatedAt={live.updatedAt} updatedBy={live.updatedBy} createdAt={live.createdAt} createdBy={live.createdBy} me={me} now={now} />
          <dl className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <Fact label="Client">{r.company ?? "-"}</Fact>
            <Fact label="Location">{placeLabel(live.location, live.workMode)}</Fact>
            <Fact label="From">{r.marketerName ?? "Your marketer"}</Fact>
            <Fact label="Prepared">{whenOf(live.createdAt).date || "-"}</Fact>
          </dl>

          <section aria-label="Marketer note">
            <h3 className="text-[14px] font-bold text-ink">Marketer note</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{r.marketerNote ?? "Your marketer left no note."}</p>
          </section>

          <section aria-label="Resume">
            <h3 className="text-[14px] font-bold text-ink">Resume</h3>
            {live.resume ? (
              <div className="mt-1 rounded-xl border border-line p-3">
                <p className="text-[13.5px] font-semibold text-ink">
                  {live.resume.name}
                  {r.resumeVersion !== null ? <span className="ml-2 text-accent-deep">{versionText(r.resumeVersion)}</span> : null}
                </p>
                {live.resume.headline ? <p className="text-[12.5px] text-muted">{live.resume.headline}</p> : null}
                {live.resume.summary ? <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{live.resume.summary}</p> : null}
                <Link href={`${BASE}/resumes`} className="mt-2 inline-block text-[13px] font-semibold text-accent-deep hover:underline">
                  Open in My Resumes
                </Link>
              </div>
            ) : (
              <p className="mt-1 text-[13px] text-muted">No resume is attached to this submission.</p>
            )}
          </section>

          {live.description ? (
            <section aria-label="Job description">
              <h3 className="text-[14px] font-bold text-ink">About the role</h3>
              <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft">{live.description}</p>
            </section>
          ) : null}

          {!pending ? (
            <section aria-label="Outcome">
              <h3 className="text-[14px] font-bold text-ink">What happened</h3>
              <ul className="mt-1 space-y-1 text-[13.5px] text-ink-soft">
                {r.decidedAt ? <li>{r.status === "DECLINED" ? "You declined it" : "You approved it"} on {whenOf(r.decidedAt).date}.</li> : null}
                {live.declineReason ? <li>Your reason: {live.declineReason}</li> : null}
                {r.submittedOn ? <li>Your marketer submitted it on {whenOf(r.submittedOn).date}.</li> : null}
                {r.clientUpdate ? <li>Client update: {r.clientUpdate}{r.clientUpdateAt ? ` (${shortDate(r.clientUpdateAt)})` : ""}.</li> : null}
              </ul>
            </section>
          ) : (
            <section aria-label="Submission checklist">
              <h3 className="text-[14px] font-bold text-ink">Submission checklist</h3>
              <Checklist className="mt-2" />
            </section>
          )}
          <p className="text-[12px] text-muted">Approving only records that you agree. Nothing is ever submitted for you.</p>
        </div>
      )}
    </SideSheet>
  );
}

function Checklist({ className }: { className?: string }) {
  return (
    <ul aria-label="Submission checklist" className={cn("space-y-2.5", className)}>
      {CHECKLIST.map((c) => (
        <li key={c} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink">
          <CheckCircleIcon size={19} className="mt-px flex-none text-accent-deep" />
          <span className="min-w-0">{c}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── the two confirmations ──────────────────────────────────────────────────────────── */

function ApproveDialog({ row, busy, onCancel, onConfirm }: { row: SubRow | null; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog
      open={row !== null}
      onClose={onCancel}
      title="Approve this submission?"
      description={row ? `${row.title}${row.company ? ` at ${row.company}` : ""}` : undefined}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            Yes, approve
          </Button>
        </div>
      }
    >
      <p data-approve-copy className="text-[13.5px] leading-relaxed text-ink-soft">
        {APPROVE_COPY}
      </p>
    </Dialog>
  );
}

function DeclineDialog({ row, busy, error, onCancel, onConfirm }: { row: SubRow | null; busy: boolean; error: string | null; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const problem = touched ? reasonProblem(reason) : null;
  const close = () => {
    setReason("");
    setTouched(false);
    onCancel();
  };
  return (
    <Dialog
      open={row !== null}
      onClose={close}
      title="Decline this submission?"
      description={row ? `${row.title}${row.company ? ` at ${row.company}` : ""}` : undefined}
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
              if (!reasonProblem(reason)) onConfirm(reason.trim());
            }}
          >
            Decline submission
          </Button>
        </div>
      }
    >
      <label className="block text-[13px] font-semibold text-ink">
        Why are you declining?
        <textarea
          aria-label="Reason for declining"
          value={reason}
          maxLength={MAX_REASON + 50}
          rows={4}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={problem !== null || error !== null}
          className="mt-1.5 w-full rounded-lg border border-line bg-paper p-2.5 text-[13.5px] font-normal text-ink"
          placeholder="For example: the rate is below my minimum."
        />
      </label>
      <p className="mt-1 flex justify-between gap-2 text-[12px] text-muted">
        <span role="alert" className="text-v2-coral-ink">
          {problem ?? error ?? ""}
        </span>
        <span className="tabular-nums">
          {reason.trim().length}/{MAX_REASON}
        </span>
      </p>
      <p className="mt-2 text-[12px] text-muted">Your marketer sees this reason. Please don&apos;t include personal identifiers such as ID or account numbers.</p>
    </Dialog>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

const QUICK: { key: string; label: string; hint: string; href: string; icon: ComponentType<IconProps> }[] = [
  { key: "resumes", label: "View My Resumes", hint: "Check and update", href: `${BASE}/resumes`, icon: FileTextIcon },
  { key: "marketer", label: "Contact My Marketer", hint: "Send a message", href: `${BASE}/marketer`, icon: MessageIcon },
  { key: "matches", label: "View Job Matches", hint: "Find more opportunities", href: `${BASE}/matches`, icon: BriefcaseIcon },
  { key: "availability", label: "Update Availability", hint: "Manage your schedule", href: `${BASE}/availability`, icon: CalendarCheckIcon },
];

function QuickActions() {
  return (
    <Card id="subs-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <li key={q.key} className="min-w-0">
              <Link href={q.href} data-quick={q.key} className="flex h-full min-h-[64px] items-center gap-2.5 rounded-xl border border-line bg-paper p-2.5 hover:bg-paper-2/60">
                <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", TONES.accent)}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold leading-tight text-ink">{q.label}</span>
                  <span className="block text-[11.5px] leading-snug text-muted">{q.hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ChecklistCard() {
  return (
    <Card id="subs-checklist" title="Submission Checklist" icon={FileTextIcon}>
      <p className="-mt-1 mb-3 text-[12.5px] text-muted">Make sure your submission is complete and accurate before approving.</p>
      <Checklist />
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface SubmissionsPageProps {
  orgId: number;
  firstName: string;
  /** The consultant's own seat: "by you" in the Updated line is decided by it. */
  selfMemberId?: number | null;
}

export default function ConsultantSubmissionsPage({ orgId, firstName: first, selfMemberId }: SubmissionsPageProps) {
  const router = useRouter();
  const toast = useToast();
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchSubmissions(orgId), [orgId]));
  const loading = status === "loading";
  const [busy, setBusy] = useState<Set<number>>(() => new Set());
  const [notice, setNotice] = useState("");
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [state, setState] = useState<DetailState>(null);
  const [approving, setApproving] = useState<SubRow | null>(null);
  const [declining, setDeclining] = useState<SubRow | null>(null);
  const [declineError, setDeclineError] = useState<string | null>(null);

  const now = view ? Date.parse(view.generatedAt) || 0 : 0; // the server clock at the time of the answer

  const reviewRow = useMemo(() => {
    if (reviewId === null) return null;
    return view?.pending.find((r) => r.id === reviewId) ?? view?.past.items.find((r) => r.id === reviewId) ?? (state && state.id === reviewId && state.result.view ? state.result.view.row : null) ?? null;
  }, [reviewId, view, state]);

  useEffect(() => {
    if (reviewId === null) return;
    const ctl = new AbortController();
    void fetchDetail(orgId, reviewId, ctl.signal).then((result) => {
      if (!ctl.signal.aborted) setState({ id: reviewId, result });
    });
    return () => ctl.abort();
  }, [orgId, reviewId, view?.generatedAt]);

  const withBusy = async (id: number, fn: () => Promise<void>) => {
    setBusy((s) => new Set(s).add(id));
    try {
      await fn();
    } finally {
      setBusy((s) => new Set([...s].filter((x) => x !== id)));
    }
  };

  const confirmApprove = () => {
    const r = approving;
    if (!r) return;
    setNotice("");
    void withBusy(r.id, async () => {
      const res = await approveSubmission(orgId, r.id);
      setApproving(null);
      if (res.ok) {
        toast({ title: "Submission approved", description: "Your marketer can take it from here. Nothing was sent to the client from here.", variant: "success" });
      } else if (res.status === 409) {
        setNotice(res.message ?? "This submission was already decided.");
      } else setNotice(res.message ?? "We couldn't record your approval. Nothing has changed.");
      void reload();
    });
  };

  const confirmDecline = (reason: string) => {
    const r = declining;
    if (!r) return;
    setDeclineError(null);
    void withBusy(r.id, async () => {
      const res = await declineSubmission(orgId, r.id, reason);
      if (res.ok) {
        setDeclining(null);
        toast({ title: "Submission declined", description: "Your marketer will see your reason.", variant: "success" });
        void reload();
      } else if (res.status === 409) {
        setDeclining(null);
        setNotice(res.message ?? "This submission was already decided.");
        void reload();
      } else setDeclineError(res.message ?? "We couldn't record your decision. Nothing has changed.");
    });
  };

  const actions: Actions = {
    approve: (r) => setApproving(r),
    decline: (r) => {
      setDeclineError(null);
      setDeclining(r);
    },
    review: (r) => {
      setState(null);
      setReviewId(r.id);
    },
    go: (href) => router.push(href),
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const detail = state && state.id === reviewId ? state.result : null;

  return (
    <div data-consultant-submissions data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Submissions & Approvals" subtitle="Review and approve your submissions, track their status, and stay informed throughout the hiring process." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your submissions" description="Your submissions didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <section aria-label="Key numbers" data-subs-tiles className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {TILE_SPECS.map((s, i) => (
              <Tile key={s.key} spec={s} tile={loading || !view ? null : view.tiles[s.key]} index={i} />
            ))}
          </section>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.36fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
              {view ? (
                <>
                  <Awaiting view={view} busy={busy} a={actions} notice={notice} now={now} />
                  <Past orgId={orgId} view={view} a={actions} tick={view.generatedAt} />
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
                body="Get guidance on submissions, understand the approval process, and make informed decisions. I can explain job details, review feedback, and answer any questions."
              />
              <QuickActions />
              <ChecklistCard />
            </div>
          </div>
        </>
      )}

      <ReviewSheet row={reviewRow} detail={detail} busy={reviewRow !== null && busy.has(reviewRow.id)} onClose={() => setReviewId(null)} a={actions} me={seatViewer(selfMemberId)} />
      <ApproveDialog row={approving} busy={approving !== null && busy.has(approving.id)} onCancel={() => setApproving(null)} onConfirm={confirmApprove} />
      <DeclineDialog row={declining} busy={declining !== null && busy.has(declining.id)} error={declineError} onCancel={() => setDeclining(null)} onConfirm={confirmDecline} />
    </div>
  );
}
