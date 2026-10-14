"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertIcon, BandBar, CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, DownloadIcon, ErrorState, EyeIcon, FileTextIcon, IconButton, Input, MemberAvatar, Menu,
  MoreVerticalIcon, PencilIcon, RefreshIcon, SEARCH_DEBOUNCE_MS, SearchIcon, Select, Skeleton, Tooltip, UploadIcon, cn,
} from "@kiwiply/ui";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { CARD, HEAD_ROW, HelpBannerCard, KpiTile, TH, TINTS, VIEW_ALL, type MktPageProps, type TintName } from "../parts";
import {
  APPROVAL_LABELS, AVAILABILITY_OPTIONS, DEFAULT_FILTERS, PAGE_SIZES, RESUME_KPI_KEYS, RESUME_KPI_TITLES, STATUS_OPTIONS, UPDATED_OPTIONS,
  agoText, approveResume, dateText, fetchResumes, markNeedsUpdate, pageWindow, photoFor, requestApproval,
  type Approval, type ResumeActivity, type ResumeFilters, type ResumeKpiKey, type ResumeRow, type ResumesView, type WriteResult,
} from "@/lib/ent/marketer-ws/resumes";
import ResumeDrawer, { type DrawerMode } from "./ResumeDrawer";

/**
 * Resumes (Marketing workspace; design: Resumes). One call draws the tiles, the page of rows and "Recent Resume Activity". Resumes are
 * metadata only, so View opens a read-only preview, Edit changes the metadata as a new version, and Download is shown disabled with
 * "No file stored" (the API answers 404 and we never invent a file). E1: a marketer prepares and REQUESTS approval, the org admin approves.
 */

const KPI_ICONS: Record<ResumeKpiKey, { icon: typeof FileTextIcon; tint: TintName; spark: number }> = {
  total: { icon: FileTextIcon, tint: "violet", spark: 1 },
  profilesReady: { icon: CheckCircleIcon, tint: "green", spark: 1 },
  needUpdates: { icon: AlertIcon, tint: "pink", spark: 4 },
  approvalsPending: { icon: ClockIcon, tint: "amber", spark: 2 },
};
const CHIP: Record<Approval, { cls: string; dot: string }> = {
  APPROVED: { cls: "bg-v2-green-soft text-v2-green-ink", dot: "bg-green-500" },
  PENDING: { cls: "bg-v2-amber-soft text-v2-amber-ink", dot: "bg-amber-400" },
  NEEDS_UPDATE: { cls: "bg-v2-pink-soft text-v2-pink-ink", dot: "bg-red-500" },
};
const ACTIVITY_ICON: Record<string, { icon: typeof FileTextIcon; tint: TintName }> = {
  UPDATED: { icon: FileTextIcon, tint: "green" },
  APPROVAL_REQUESTED: { icon: UploadIcon, tint: "blue" },
  MARKED_FOR_UPDATE: { icon: AlertIcon, tint: "pink" },
  APPROVED: { icon: CheckCircleIcon, tint: "green" },
  CREATED: { icon: FileTextIcon, tint: "violet" },
};
const ACTION = "inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-[12.5px] font-semibold text-accent-deep hover:bg-accent-soft disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent";
const SELECT_LABEL = "mb-1 block text-[12px] font-medium text-muted";

export default function ResumesPage({ orgId, hrefs }: MktPageProps) {
  const [filters, setFilters] = useState<ResumeFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ResumesView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawer, setDrawer] = useState<{ row: ResumeRow; mode: DrawerMode } | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [reload, setReload] = useState(0);
  const first = useRef(true);

  // Typing rests for a moment before the list is asked again (and goes back to the first page).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 0 })), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      void (async () => {
        const r = await fetchResumes(orgId, filters, ctl.signal);
        if (ctl.signal.aborted) return;
        if (r.kind === "OK") {
          setView(r.view);
          setStatus("ready");
          setNow(Date.now());
        } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
        if (r.kind === "FAILED") setNote((n) => n ?? { tone: "error", text: "The list didn't refresh. Showing the last one you saw." });
      })();
    }, 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [orgId, filters, reload]);

  const change = (patch: Partial<ResumeFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 0 }));
  const reset = () => {
    setSearch("");
    setFilters(DEFAULT_FILTERS);
  };
  const retry = useCallback(() => {
    setStatus("loading");
    setReload((n) => n + 1);
  }, []);

  const after = (r: WriteResult, done: string) => {
    if (r.kind === "OK") {
      setNote({ tone: "ok", text: done });
      setReload((n) => n + 1);
    } else setNote({ tone: "error", text: r.kind === "DENIED" ? "This resume isn't part of your role anymore." : r.message });
  };

  if (status === "denied") return <ErrorState what="the Resumes page" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const header = (
    <>
      <PageHeader title="Resumes" subtitle="Manage consultant resumes and profile documents to keep your talent pipeline up to date." />
      <ClaimsMascot />
      <ClaimsHelpCard />
    </>
  );
  if (status === "failed")
    return (
      <div data-mkt-resumes data-status="failed">
        {header}
        <ErrorState what="the Resumes page" description="Your consultants' resumes didn't load. Nothing has changed." onRetry={retry} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const items = view?.items ?? [];
  const total = view?.total ?? 0;
  const size = view?.size ?? filters.size;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = view?.page ?? filters.page;
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, page * size + items.length);
  const allOnPage = items.length > 0 && items.every((r) => selected.has(r.id));
  const canApprove = view?.canApprove === true;
  const activityHref = hrefs.activity ?? null;
  const nothingAtAll = (view?.kpis.find((k) => k.key === "total")?.value ?? 0) === 0;

  const kebab = (r: ResumeRow) => {
    const entries = [];
    if (r.canEdit && r.approval !== "PENDING") entries.push({ label: "Request approval", onSelect: () => void requestApproval(orgId, r.id).then((x) => after(x, `Approval requested for "${r.title}".`)) });
    if (r.canEdit && r.approval === "APPROVED") entries.push({ label: "Mark as needs update", onSelect: () => void markNeedsUpdate(orgId, r.id).then((x) => after(x, `Marked "${r.title}" as needing an update.`)) });
    if (canApprove && r.approval === "PENDING") entries.push({ label: "Approve", onSelect: () => void approveResume(orgId, r.id).then((x) => after(x, `Approved "${r.title}".`)) });
    entries.push({ label: "Open preview", onSelect: () => setDrawer({ row: r, mode: "view" }) });
    return (
      <Menu
        trigger={
          <IconButton aria-label={`More for ${r.title}`} className="text-muted">
            <MoreVerticalIcon size={16} />
          </IconButton>
        }
        items={entries}
      />
    );
  };

  const select = (label: string, key: "skill" | "status" | "updated" | "availability", options: { value: string; label: string }[]) => (
    <div className="min-w-0 flex-1 sm:flex-none sm:basis-[150px]" data-filter={key}>
      <span className={SELECT_LABEL}>{label}</span>
      <Select aria-label={label} value={filters[key]} onChange={(v) => change({ [key]: v })} options={options} variant="field" className="w-full" />
    </div>
  );

  return (
    <div data-mkt-resumes data-status={status} className="flex flex-col gap-4 sm:gap-5">
      {header}

      <section aria-label="Key numbers" data-resumes-tiles className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {RESUME_KPI_KEYS.map((key) => {
          const k = view?.kpis.find((x) => x.key === key);
          const { icon, tint, spark } = KPI_ICONS[key];
          return <KpiTile key={key} id={key} title={RESUME_KPI_TITLES[key]} icon={icon} tint={tint} value={loading ? null : (k?.value ?? null)} loading={loading} deltaPct={k?.deltaPct} sparkline={k?.sparkline} sparkIndex={spark} />;
        })}
      </section>

      {note ? (
        <p role={note.tone === "error" ? "alert" : "status"} className={cn("rounded-lg px-3 py-2 text-[13px] font-semibold", note.tone === "error" ? "bg-v2-pink-soft text-v2-pink-ink" : "bg-v2-green-soft text-v2-green-ink")}>
          {note.text}
        </p>
      ) : null}

      <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section data-resumes-card="table" className={cn(CARD, "p-3 sm:p-4")}>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="relative min-w-[220px] flex-[2_1_260px]">
              <span className="sr-only">Search consultants or resume titles</span>
              <SearchIcon size={17} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent-deep" />
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search consultants or resume titles..." className="w-full pl-9" />
            </label>
            <span className="hidden pb-2.5 text-[13px] font-bold text-ink sm:block">Filters:</span>
            <div className="flex min-w-0 flex-[3_1_480px] flex-wrap items-end gap-3">
              {select("Skill", "skill", [{ value: "", label: "All Skills" }, ...(view?.skills ?? []).map((s) => ({ value: s, label: s }))])}
              {select("Status", "status", STATUS_OPTIONS)}
              {select("Date Updated", "updated", UPDATED_OPTIONS)}
              {select("Availability", "availability", AVAILABILITY_OPTIONS)}
              <button type="button" onClick={reset} className="mb-0.5 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
                <RefreshIcon size={15} aria-hidden />
                Reset
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-[13px]">
              <thead>
                <tr className={HEAD_ROW}>
                  <th scope="col" className={cn(TH, "w-9 rounded-l-lg")}>
                    <input
                      type="checkbox"
                      aria-label="Select all resumes on this page"
                      checked={allOnPage}
                      onChange={() => setSelected(allOnPage ? new Set() : new Set(items.map((r) => r.id)))}
                      className="h-4 w-4 rounded border-line"
                    />
                  </th>
                  <th scope="col" className={TH}>Consultant</th>
                  <th scope="col" className={TH}>Resume Title</th>
                  <th scope="col" className={TH}>Version</th>
                  <th scope="col" className={TH} aria-sort={filters.sort.startsWith("modified") ? (filters.sort.endsWith("asc") ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => change({ sort: filters.sort === "modified,desc" ? "modified,asc" : "modified,desc" })} className="inline-flex items-center gap-1 font-semibold">
                      Last Modified
                      <span aria-hidden>{filters.sort === "modified,asc" ? "↑" : "↓"}</span>
                    </button>
                  </th>
                  <th scope="col" className={TH}>Primary</th>
                  <th scope="col" className={TH}>Profile Completeness</th>
                  <th scope="col" className={TH}>Approval Status</th>
                  <th scope="col" className={cn(TH, "rounded-r-lg")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [0, 1, 2, 3, 4].map((i) => (
                      <tr key={i} aria-busy="true">
                        <td colSpan={9} className="py-1.5">
                          <Skeleton className="h-11 w-full" />
                        </td>
                      </tr>
                    ))
                  : items.map((r) => {
                      const chip = CHIP[r.approval];
                      return (
                        <tr key={r.id} data-resume-row={r.id} className="border-b border-line">
                          <td className="border-b border-line px-2 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Select ${r.title}`}
                              checked={selected.has(r.id)}
                              onChange={() =>
                                setSelected((s) => {
                                  const n = new Set(s);
                                  if (!n.delete(r.id)) n.add(r.id);
                                  return n;
                                })
                              }
                              className="h-4 w-4 rounded border-line"
                            />
                          </td>
                          <td className="border-b border-line px-2">
                            <span className="flex items-center gap-2.5">
                              <MemberAvatar name={r.consultantName} src={photoFor(r.consultantName, r.avatarUrl)} size={38} />
                              <span className="min-w-0">
                                <span className="block font-semibold text-accent-deep">{r.consultantName}</span>
                                <span className="block text-[12px] text-muted">{r.consultantTitle}</span>
                              </span>
                            </span>
                          </td>
                          <td className="max-w-[180px] border-b border-line px-2 text-ink-soft">{r.title}</td>
                          <td className="border-b border-line px-2">
                            <span className="inline-block rounded-md bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent-deep">v{r.version}</span>
                          </td>
                          <td className="whitespace-nowrap border-b border-line px-2">
                            <span className="block text-ink-soft">{dateText(r.lastModifiedAt)}</span>
                            <span className="block text-[12px] text-muted">{agoText(r.lastModifiedAt, now)}</span>
                          </td>
                          <td className="border-b border-line px-2">
                            <span className={cn("inline-block rounded-md px-2.5 py-1 text-[12px] font-semibold", r.primary ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-pink-soft text-v2-pink-ink")}>{r.primary ? "Yes" : "No"}</span>
                          </td>
                          <td className="min-w-[120px] border-b border-line px-2">
                            <span className="block text-[12.5px] font-semibold text-ink-soft">{r.completeness}%</span>
                            <BandBar value={r.completeness} label={`Profile completeness for ${r.consultantName}`} className="mt-1 w-[104px]" />
                          </td>
                          <td className="border-b border-line px-2">
                            <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold", chip.cls)}>
                              <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", chip.dot)} />
                              {APPROVAL_LABELS[r.approval]}
                            </span>
                          </td>
                          <td className="border-b border-line px-2">
                            <span className="flex items-center gap-0.5 whitespace-nowrap">
                              <button type="button" className={ACTION} onClick={() => setDrawer({ row: r, mode: "view" })} aria-label={`View ${r.title}`}>
                                <EyeIcon size={15} aria-hidden />
                                View
                              </button>
                              <button
                                type="button"
                                className={ACTION}
                                disabled={!r.canEdit}
                                title={r.canEdit ? undefined : "You can't edit this resume"}
                                onClick={() => setDrawer({ row: r, mode: "edit" })}
                                aria-label={`Edit ${r.title}`}
                              >
                                <PencilIcon size={15} aria-hidden />
                                Edit
                              </button>
                              <Tooltip content={r.hasFile ? "Download" : "No file stored"}>
                                <span title={r.hasFile ? undefined : "No file stored"} className="inline-flex">
                                  <button type="button" className={ACTION} disabled={!r.hasFile} aria-label={r.hasFile ? `Download ${r.title}` : `Download ${r.title} (No file stored)`}>
                                    <DownloadIcon size={15} aria-hidden />
                                    Download
                                  </button>
                                </span>
                              </Tooltip>
                              {kebab(r)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!loading && items.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-muted">
              {nothingAtAll ? "Ask your consultants to share a resume." : "No resumes match these filters."}
            </p>
          ) : null}

          <footer className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-ink-soft" data-showing>
              {total === 0 ? "Showing 0 of 0 resumes" : `Showing ${from}–${to} of ${total} resumes`}
            </p>
            <nav aria-label="Pages" className="flex flex-wrap items-center gap-1.5">
              <button type="button" aria-label="Previous page" disabled={page <= 0} onClick={() => change({ page: page - 1 })} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-paper text-ink-soft hover:bg-paper-2 disabled:opacity-50">
                <ChevronLeftIcon size={16} />
              </button>
              {pageWindow(page, pages).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={`Page ${p + 1}`}
                  aria-current={p === page ? "page" : undefined}
                  onClick={() => change({ page: p })}
                  className={cn("h-9 min-w-9 rounded-lg border px-2 text-[13px] font-semibold", p === page ? "border-accent bg-accent text-on-accent" : "border-line bg-paper text-ink-soft hover:bg-paper-2")}
                >
                  {p + 1}
                </button>
              ))}
              <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => change({ page: page + 1 })} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-paper text-ink-soft hover:bg-paper-2 disabled:opacity-50">
                <ChevronRightIcon size={16} />
              </button>
              <Select aria-label="Rows per page" value={String(filters.size)} onChange={(v) => change({ size: Number(v) })} options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))} variant="field" className="ml-1 w-[130px]" />
            </nav>
          </footer>
        </section>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <HelpBannerCard title="Keep resumes up to date for more opportunities!" body="Well-maintained resumes get 3x more client views and lead to faster submissions." />
          <section data-resumes-card="activity" className={CARD}>
            <header className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-[16.5px] font-bold text-ink">Recent Resume Activity</h2>
              {activityHref ? (
                <Link href={activityHref} className={VIEW_ALL}>
                  View all
                </Link>
              ) : null}
            </header>
            {loading ? (
              <div aria-busy="true" className="flex flex-col gap-3 py-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !view || view.activity.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-muted">No resume activity yet.</p>
            ) : (
              <ul className="flex flex-col">
                {view.activity.map((a) => (
                  <ActivityRow key={a.id} a={a} now={now} />
                ))}
              </ul>
            )}
            {activityHref ? (
              <Link href={activityHref} className="mt-3 flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-paper text-[13.5px] font-semibold text-accent-deep hover:bg-accent-soft">
                View all activity
                <ChevronRightIcon size={15} aria-hidden />
              </Link>
            ) : null}
          </section>
        </div>
      </div>

      <ResumeDrawer
        orgId={orgId}
        row={drawer?.row ?? null}
        mode={drawer?.mode ?? "view"}
        canApprove={canApprove}
        onClose={() => setDrawer(null)}
        onModeChange={(mode) => setDrawer((d) => (d ? { ...d, mode } : d))}
        onChanged={(text) => {
          setNote({ tone: "ok", text });
          setReload((n) => n + 1);
        }}
      />
    </div>
  );
}

function ActivityRow({ a, now }: { a: ResumeActivity; now: number }): ReactNode {
  const { icon: Icon, tint } = ACTIVITY_ICON[a.kind] ?? ACTIVITY_ICON.UPDATED;
  return (
    <li data-activity-row={a.id} className="flex items-start gap-2.5 border-b border-line py-2.5 last:border-0">
      <span aria-hidden className={cn("grid h-7 w-7 flex-none place-items-center rounded-md", TINTS[tint])}>
        <Icon size={15} />
      </span>
      <MemberAvatar name={a.consultantName} src={photoFor(a.consultantName, a.avatarUrl)} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-snug text-ink">
          <b>{a.consultantName}</b> {a.text}
        </span>
        <span className="block text-[12px] text-muted">{agoText(a.at, now)}</span>
      </span>
    </li>
  );
}
