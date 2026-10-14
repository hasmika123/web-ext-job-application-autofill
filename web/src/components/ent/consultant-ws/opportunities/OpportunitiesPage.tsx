"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, BriefcaseIcon, ErrorState, SideSheet, cn, useMediaQuery, useToast } from "@kiwiply/ui";
import PageHeader, { ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { relativeTime } from "@/lib/ent/dashboard";
import {
  STATES, STATE_LABELS, applied, applyOptimistic, countByState, decline, fetchList, fetchOne, interest, link, requestInfo, unlink, viewed,
  type ActionResult, type ConOpportunityDTO, type ConState, type DeclineReason, type Optimistic,
} from "@/lib/ent/consultant-ws/conOpportunities";
import { CARD, CardSkeleton, Empty, Head, JobChips, PriorityChip, SourceBadge, StateChip, dueInfo, preview, shortDate, type ConPageProps } from "./conParts";
import { useCompact } from "../useCompact";
import { AskDialog, DeclineDialog, LinkDialog } from "./Dialogs";
import { ActionBar, DetailBody, DetailStatus, type DetailHandlers } from "./Detail";

/**
 * Assigned Opportunities (Consultant workspace, doc 60 s7). Jobs a marketer picked for ME: a list with state tabs, and one job's details
 * at the canonical URL `/w/consultant/opportunities/{id}`: a 520 px slide-over on a wide screen, its own screen with a Back link on a
 * phone or tablet. Buttons come only from the server's `allowedActions[]`. E1: nothing here applies for anyone; "Open job posting" is a
 * plain link to the source site and "I applied" only records what the consultant did.
 */

type Tab = "ALL" | ConState;
const TABS: Tab[] = ["ALL", ...STATES];
const TAB_LABEL = (t: Tab) => (t === "ALL" ? "All" : STATE_LABELS[t]);
const tabOf = (s: string | null): Tab => ((TABS as string[]).includes(s ?? "") ? (s as Tab) : "ALL");

interface Route { id: number | null; tab: Tab }

/** The route a URL describes. `null` id on the list. */
function parseRoute(pathname: string, search: string): Route {
  const m = /\/opportunities\/(\d{1,18})\/?$/.exec(pathname);
  return { id: m ? Number(m[1]) : null, tab: tabOf(new URLSearchParams(search).get("state")) };
}

type Dialog = { kind: "decline" | "ask" | "link"; id: number } | null;
type DetailLoad = { id: number; kind: "loading" | "ok" | "notfound" | "failed" };

export default function OpportunitiesPage({ orgId, hrefs, detailId = null }: ConPageProps) {
  const toast = useToast();
  const pathname = usePathname();
  const search = useSearchParams();
  const compact = useCompact();
  const wide = useMediaQuery("(min-width: 1024px)", true); // table from 1024 px, cards below
  const listPath = (hrefs.opportunities ?? "/w/consultant/opportunities").replace(/\/+$/, "");

  const [route, setRoute] = useState<Route>(() => ({ id: detailId, tab: tabOf(search?.get("state") ?? null) }));
  const [items, setItems] = useState<ConOpportunityDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [extra, setExtra] = useState<ConOpportunityDTO | null>(null); // the open job when it is not in the loaded list
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<DetailLoad | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [now, setNow] = useState(() => Date.now());
  const opened = useRef(false); // true once the detail was opened by a click in this page (so Close can step back)
  const viewedSent = useRef<Set<number>>(new Set());

  // ---- routing: the URL is canonical; clicks push it with the History API (Next keeps usePathname in step) -----------------------------
  const lastUrl = useRef(`${pathname}?${search?.toString() ?? ""}`); // the URL this page pushed last
  const seenUrl = useRef(`${pathname}?${search?.toString() ?? ""}`); // the URL Next reported last
  useEffect(() => {
    const url = `${pathname}?${search?.toString() ?? ""}`;
    if (url === seenUrl.current) return;
    seenUrl.current = url;
    if (url === lastUrl.current) return; // Next catching up with our own pushState
    lastUrl.current = url;
    setRoute(parseRoute(pathname, search?.toString() ?? "")); // a navigation from elsewhere (sidebar, Back)
  }, [pathname, search]);
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname, window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const urlFor = useCallback((id: number | null, tab: Tab) => `${listPath}${id !== null ? `/${id}` : ""}${tab !== "ALL" ? `?state=${tab}` : ""}`, [listPath]);
  const go = useCallback((id: number | null, tab: Tab, mode: "push" | "replace" = "push") => {
    const url = urlFor(id, tab);
    lastUrl.current = `${url.split("?")[0]}?${url.split("?")[1] ?? ""}`;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
    setRoute({ id, tab });
  }, [urlFor]);
  const clickLink = (e: MouseEvent, id: number | null, tab: Tab) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab / window: the real href
    e.preventDefault();
    if (id !== null) opened.current = true;
    go(id, tab);
  };
  const close = () => {
    if (opened.current) {
      opened.current = false;
      window.history.back(); // the popstate listener / Next draws the list
    } else go(null, route.tab, "replace");
  };

  // ---- data ----------------------------------------------------------------------------------------------------------------------------
  useEffect(() => {
    let live = true;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      void fetchList(orgId, { signal: ctl.signal }).then((r) => {
        if (!live) return;
        if (r.kind === "OK") {
          setItems(r.list.items);
          setTotal(r.list.total);
          setStatus("ready");
          setNow(Date.now());
        } else setStatus((s) => (r.kind === "DENIED" ? "denied" : s === "ready" ? s : "failed"));
      });
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
      ctl.abort();
    };
  }, [orgId, attempt]);

  const replace = useCallback((o: ConOpportunityDTO) => {
    setItems((list) => (list.some((x) => x.id === o.id) ? list.map((x) => (x.id === o.id ? o : x)) : list));
    setExtra((e) => (e && e.id === o.id ? o : e));
  }, []);

  const openId = route.id;
  useEffect(() => {
    if (openId === null) return;
    let live = true;
    const t = setTimeout(() => {
      setDetail({ id: openId, kind: "loading" });
      void fetchOne(orgId, openId).then((r) => {
        if (!live) return;
        if (r.kind === "OK") {
          setDetail({ id: openId, kind: "ok" });
          setItems((list) => (list.some((x) => x.id === openId) ? list.map((x) => (x.id === openId ? r.item : x)) : list));
          setExtra(r.item);
        } else setDetail({ id: openId, kind: r.kind === "NOT_FOUND" ? "notfound" : "failed" });
      });
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [orgId, openId, detailAttempt]);

  const current: ConOpportunityDTO | null = openId === null ? null : (items.find((x) => x.id === openId) ?? (extra?.id === openId ? extra : null));
  const [lastShown, setLastShown] = useState<ConOpportunityDTO | null>(null);
  if (current && current !== lastShown) setLastShown(current); // derived state: remembered so the sheet keeps its content while it slides out
  const sheetItem = current ?? (openId === null ? lastShown : null);
  const detailKind: "loading" | "notfound" | "failed" | "ok" = current ? "ok" : detail?.id === openId ? (detail.kind === "ok" ? "loading" : detail.kind) : "loading";

  // ---- writes: optimistic, rolled back on any refusal, one toast -----------------------------------------------------------------------
  const lookup = useCallback((id: number) => items.find((x) => x.id === id) ?? (extra?.id === id ? extra : null), [items, extra]);
  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
    setDetailAttempt((n) => n + 1);
  }, []);

  const act = useCallback(async (
    o: ConOpportunityDTO,
    change: Optimistic,
    call: (version: number) => Promise<ActionResult>,
    opts: { done?: string; inline?: boolean } = {},
  ): Promise<ActionResult> => {
    const before = lookup(o.id) ?? o;
    replace(applyOptimistic(before, change));
    setBusy((b) => new Set(b).add(o.id));
    const r = await call(before.version);
    setBusy((b) => {
      const n = new Set(b);
      n.delete(o.id);
      return n;
    });
    if (r.kind === "OK") {
      if (r.item) replace(r.item);
      else reload(); // the API said OK without the row: ask for it rather than keep a guess
      if (opts.done) toast({ title: opts.done, variant: "success" });
      return r;
    }
    replace(before); // rollback
    if (r.kind === "VERSION_CONFLICT") toast({ title: "This job changed while you were looking.", description: "Reload to see the latest.", variant: "error", duration: 0, action: { label: "Reload", onClick: reload } });
    else if (r.kind === "NOT_FOUND") toast({ title: "This opportunity is no longer available.", variant: "error", action: { label: "Reload", onClick: reload } });
    else if (!(opts.inline && (r.kind === "SENSITIVE" || r.kind === "INVALID"))) toast({ title: r.kind === "SENSITIVE" || r.kind === "INVALID" || r.kind === "FAILED" ? r.error : "That didn't work.", variant: "error" });
    return r;
  }, [lookup, replace, reload, toast]);

  const handlers: DetailHandlers = useMemo(() => ({
    onOpenPosting: (o) => {
      // The link itself opens the source site (a real <a target=_blank>); here we only record, once, that the consultant looked.
      if (o.allowedActions.includes("VIEWED") && !viewedSent.current.has(o.id)) {
        viewedSent.current.add(o.id);
        void act(o, { action: "VIEWED" }, (version) => viewed(orgId, o.id, { version }));
      }
    },
    onInterest: (o) => void act(o, { action: "INTEREST" }, (version) => interest(orgId, o.id, { version }), { done: "Marked as interested." }),
    onDecline: (o) => setDialog({ kind: "decline", id: o.id }),
    onAsk: (o) => setDialog({ kind: "ask", id: o.id }),
    onApplied: (o) => void act(o, { action: "APPLIED" }, (version) => applied(orgId, o.id, undefined, { version }), { done: "Marked as applied." }),
    onLink: (o) => setDialog({ kind: "link", id: o.id }),
    onUnlink: (o) => void act(o, { action: "UNLINK" }, (version) => unlink(orgId, o.id, { version }), { done: "Application unlinked." }),
  }), [act, orgId]);

  const dialogItem = dialog ? (lookup(dialog.id) ?? null) : null;
  const dialogs = dialog && dialogItem ? (
    dialog.kind === "decline" ? (
      <DeclineDialog onClose={() => setDialog(null)} onSubmit={(reason: DeclineReason, note: string) => act(dialogItem, { action: "DECLINE" }, (version) => decline(orgId, dialogItem.id, reason, note, { version }), { done: "Declined. Your marketer will see your reason.", inline: true })} />
    ) : dialog.kind === "ask" ? (
      <AskDialog onClose={() => setDialog(null)} onSubmit={(q: string) => act(dialogItem, { action: "REQUEST_INFO", question: q }, (version) => requestInfo(orgId, dialogItem.id, q, { version }), { done: "Question sent to your marketer.", inline: true })} />
    ) : (
      <LinkDialog onClose={() => setDialog(null)} onSubmit={(appId: number) => act(dialogItem, { action: "LINK", applicationId: appId }, (version) => link(orgId, dialogItem.id, appId, { version }), { done: "Application linked.", inline: true })} />
    )
  ) : null;

  // ---- render --------------------------------------------------------------------------------------------------------------------------
  const counts = useMemo(() => countByState(items), [items]);
  const shown = route.tab === "ALL" ? items : items.filter((o) => o.state === route.tab);
  const listUrl = urlFor(null, route.tab);

  const header = (title: string, subtitle: string) => (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <ClaimsMascot />
    </>
  );

  if (status === "denied") return <ErrorState what="Assigned Opportunities" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  // Compact: a job's details are their own screen with a clear Back (the list keeps its tab in the query string).
  if (compact && route.id !== null) {
    return (
      <div data-con-opportunities data-view="screen" className="flex flex-col gap-3">
        {header(current?.job.title ?? "Assigned Opportunity", current?.job.company ?? "Assigned Opportunities")}
        <a href={listUrl} onClick={(e) => clickLink(e, null, route.tab)} data-back className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[14px] font-semibold text-accent-deep hover:underline">
          <ArrowLeftIcon size={16} aria-hidden /> Back to Assigned Opportunities
        </a>
        {current ? (
          <>
            <DetailBody o={current} h={handlers} busy={busy.has(current.id)} now={now} />
            <div className="sticky bottom-0 -mx-1 border-t border-line bg-paper px-1 py-2.5" data-bottom-bar>
              <ActionBar o={current} h={handlers} busy={busy.has(current.id)} />
            </div>
          </>
        ) : (
          <DetailStatus kind={detailKind === "ok" ? "loading" : detailKind} onRetry={() => setDetailAttempt((n) => n + 1)} onBack={() => go(null, route.tab, "replace")} />
        )}
        {dialogs}
      </div>
    );
  }

  const loading = status === "loading";
  const wideSheet = !compact ? (
    <SideSheet
      id="con-opportunity"
      side="right"
      mode="overlay"
      width={520}
      open={route.id !== null}
      title={sheetItem?.job.title ?? "Assigned opportunity"}
      description={sheetItem ? [sheetItem.job.company, sheetItem.job.location].filter(Boolean).join(" · ") : undefined}
      onClose={close}
    >
      {sheetItem ? (
        <DetailBody o={sheetItem} h={handlers} busy={busy.has(sheetItem.id)} now={now} showTitle={false} />
      ) : route.id !== null ? (
        <DetailStatus kind={detailKind === "ok" ? "loading" : detailKind} onRetry={() => setDetailAttempt((n) => n + 1)} onBack={close} />
      ) : null}
    </SideSheet>
  ) : null;

  return (
    <div data-con-opportunities data-status={status} data-view="list" className="flex flex-col gap-4 sm:gap-5">
      {header("Assigned Opportunities", "Jobs your marketer picked for you. Open the posting and apply yourself.")}

      {status === "failed" ? (
        <ErrorState what="Assigned Opportunities" description="Your jobs didn't load. Nothing has changed." onRetry={() => { setStatus("loading"); setAttempt((n) => n + 1); }} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <div className="flex flex-col gap-4 sm:gap-5">
          <section aria-label="Assigned Opportunities" data-con-card="list" className={CARD}>
            <Head icon={BriefcaseIcon} title="Assigned Opportunities" tint="blue" count={loading ? undefined : counts.ALL} />

            <div role="tablist" aria-label="Filter by state" data-con-tabs className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {TABS.map((t) => {
                const on = route.tab === t;
                return (
                  <a
                    key={t}
                    role="tab"
                    aria-selected={on}
                    href={urlFor(null, t)}
                    data-tab={t}
                    onClick={(e) => clickLink(e, null, t)}
                    className={cn("inline-flex min-h-11 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold sm:min-h-8", on ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink-soft hover:bg-paper-2")}
                  >
                    {TAB_LABEL(t)}
                    {!loading ? <span data-tab-count className={cn("rounded-full px-1.5 text-[11.5px] tabular-nums", on ? "bg-paper text-accent-deep" : "bg-paper-2 text-muted")}>{counts[t]}</span> : null}
                  </a>
                );
              })}
            </div>

            {loading ? (
              <CardSkeleton rows={5} />
            ) : shown.length === 0 ? (
              items.length === 0 ? (
                <div data-con-empty className="py-6 text-center">
                  <p className="text-[16px] font-bold text-ink">Nothing assigned yet</p>
                  <p className="mt-1 text-[13.5px] text-muted">When your marketer picks a job for you, it shows up here. Your own job search still works as always.</p>
                </div>
              ) : (
                <Empty>Nothing in &ldquo;{TAB_LABEL(route.tab)}&rdquo; right now.</Empty>
              )
            ) : wide ? (
              <div className="overflow-x-auto">
                <table data-con-table className="w-full min-w-[920px] text-left text-[13px]">
                  <thead>
                    <tr className="bg-paper-2">
                      {["Job", "Location", "Pay", "Priority", "Due", "Assigned by", "Marketer's note", "State"].map((h) => (
                        <th key={h} scope="col" className="whitespace-nowrap px-2 py-2 text-[12px] font-semibold text-ink-soft">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((o) => {
                      const due = dueInfo(o.dueOn, now);
                      return (
                        <tr key={o.id} data-con-row={o.id} onClick={(e) => {
                          if ((e.target as HTMLElement).closest("a,button")) return;
                          opened.current = true;
                          go(o.id, route.tab);
                        }} className="cursor-pointer border-t border-line align-top hover:bg-paper-2/60">
                          <td className="px-2 py-3">
                            <a href={urlFor(o.id, route.tab)} onClick={(e) => clickLink(e, o.id, route.tab)} className="font-semibold text-ink hover:underline">{o.job.title || "Untitled job"}</a>
                            <p className="text-[12.5px] text-muted">{o.job.company}</p>
                            <div className="mt-1"><SourceBadge atsPlatform={o.job.atsPlatform} size={18} /></div>
                          </td>
                          <td className="px-2 py-3"><p className="text-ink-soft">{o.job.location || "-"}</p><div className="mt-1"><JobChips job={o.job} pay={false} /></div></td>
                          <td className="whitespace-nowrap px-2 py-3 text-ink-soft">{o.job.payLabel || "-"}</td>
                          <td className="px-2 py-3"><PriorityChip priority={o.priority} /></td>
                          <td className={cn("whitespace-nowrap px-2 py-3", due?.overdue && o.state !== "APPLIED" ? "font-semibold text-v2-coral-ink" : "text-ink-soft")}>{due ? due.text : "-"}</td>
                          <td className="px-2 py-3 text-ink-soft"><p>{o.assignedBy.name || "-"}</p>{o.assignedAt ? <p className="text-[12px] text-muted">{relativeTime(o.assignedAt, now)}</p> : null}</td>
                          <td className="max-w-[220px] px-2 py-3 text-ink-soft">{preview(o.marketerNote) || "-"}</td>
                          <td className="px-2 py-3"><StateChip state={o.state} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul data-con-cards className="flex flex-col gap-2.5">
                {shown.map((o) => {
                  const due = dueInfo(o.dueOn, now);
                  return (
                    <li key={o.id} data-con-row={o.id} className="rounded-[var(--radius-lg)] border border-line p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <a href={urlFor(o.id, route.tab)} onClick={(e) => clickLink(e, o.id, route.tab)} className="block min-h-11 text-[15px] font-bold text-ink hover:underline sm:min-h-0">{o.job.title || "Untitled job"}</a>
                          <p className="truncate text-[13px] text-muted">{[o.job.company, o.job.location].filter(Boolean).join(" · ")}</p>
                        </div>
                        <StateChip state={o.state} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <JobChips job={o.job} />
                        <PriorityChip priority={o.priority} />
                        <SourceBadge atsPlatform={o.job.atsPlatform} size={18} />
                      </div>
                      {o.marketerNote ? <p className="mt-2 text-[13px] text-ink-soft">{preview(o.marketerNote, 140)}</p> : null}
                      <p className="mt-2 text-[12px] text-muted">
                        {o.assignedBy.name ? `Assigned by ${o.assignedBy.name}` : "Assigned"}{o.assignedAt ? ` ${relativeTime(o.assignedAt, now)}` : ""}
                        {due ? ` · ${due.overdue && o.state !== "APPLIED" ? "Was due" : "Due"} ${due.text}` : ""}
                        {o.appliedAt ? ` · Applied ${shortDate(o.appliedAt)}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {!loading && total > items.length ? <p className="mt-3 text-[12px] text-muted">Showing your latest {items.length} of {total} jobs.</p> : null}
          </section>
        </div>
      )}

      {wideSheet}
      {dialogs}
    </div>
  );
}
