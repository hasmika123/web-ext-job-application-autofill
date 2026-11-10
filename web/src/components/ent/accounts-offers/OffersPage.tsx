"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet, Button, EmptyState, ErrorState, MemberAvatar, PlusIcon, SideSheet, Tab, TabList, Tabs, TableSkeleton, useNarrow, useToast } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { SearchBox } from "@/components/ent/placements/parts";
import {
  deadlineText,
  errorSentence,
  formatDay,
  offersApi,
  offerViewParams,
  packageText,
  parseOfferView,
  showingText,
  type OfferCounts,
  type OfferDetail,
  type OfferRow,
  type OfferTab,
  type OfferView,
} from "@/lib/ent/offers";
import OfferDetailPanel from "./OfferDetailPanel";
import OfferDialog from "./OfferDialog";
import { OfferTiles, StatePill, TILE_ICONS, type TileDef } from "./parts";

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; items: OfferRow[]; total: number };

const TAB_LABEL: Record<OfferTab, string> = { open: "Open", draft: "Drafts", accepted: "Accepted", closed: "Closed", all: "All" };
const TAB_ORDER: OfferTab[] = ["open", "draft", "accepted", "closed", "all"];
const TAB = "!px-1 !py-2.5 !text-[13px]";

export interface OffersPageProps {
  orgId: number;
  orgName: string;
  /** `me.permissions` of the tenant session: decides which controls are drawn (the API is the gate). */
  permissions: Record<string, string>;
}

/**
 * The Accounts workspace Offers page: tiles from real counts, tabs by state, a table (cards on a phone), a record-an-offer dialog and a detail drawer with the
 * timeline. An offer is a record of what the client extended; only the consultant accepts or declines it, in their own workspace. An accepted offer creates the
 * placement by itself. Nothing on this page signs or sends anything.
 */
export default function OffersPage({ orgId, orgName, permissions }: OffersPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const toast = useToast();
  const narrow = useNarrow();
  const canManage = "offers.manage" in permissions;

  const view = useMemo(() => parseOfferView(new URLSearchParams(search.toString())), [search]);
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [counts, setCounts] = useState<{ status: "loading" | "ok" | "error"; data: OfferCounts | null }>({ status: "loading", data: null });
  const [reloadToken, setReloadToken] = useState(0);
  const [dialog, setDialog] = useState<{ editing: OfferDetail | null } | null>(null);
  const seq = useRef(0);

  const setView = useCallback(
    (patch: Partial<OfferView>, resetPage = true) => {
      const next: OfferView = { ...view, ...patch, page: patch.page ?? (resetPage ? 0 : view.page) };
      const qs = offerViewParams(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [view, router, pathname],
  );

  const loadList = useCallback(
    async (v: OfferView, quiet: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setList({ status: "loading" });
      const r = await offersApi.list(orgId, v);
      if (mine !== seq.current) return;
      setList(r.ok ? { status: "ok", items: r.data.items, total: r.data.total } : { status: "error", message: errorSentence(r) });
    },
    [orgId],
  );
  const loadCounts = useCallback(async () => {
    const r = await offersApi.counts(orgId);
    setCounts(r.ok ? { status: "ok", data: r.data } : (c) => ({ status: "error", data: c.data }));
  }, [orgId]);

  const listKey = JSON.stringify([view.tab, view.q, view.page, view.size]);
  useEffect(() => {
    void loadList(view, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key above is the view's list-affecting part
  }, [listKey, loadList]);
  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const refresh = useCallback(() => {
    void loadList(view, true);
    void loadCounts();
    setReloadToken((n) => n + 1);
  }, [loadList, loadCounts, view]);

  const rows = list.status === "ok" ? list.items : [];
  const total = list.status === "ok" ? list.total : 0;
  const c = counts.data;
  const tabCount: Record<OfferTab, number | undefined> = { open: c?.open, draft: c?.draft, accepted: c?.accepted, closed: c?.closed, all: c?.all };
  const pages = Math.max(1, Math.ceil(total / view.size));
  const searching = view.q.trim().length >= 2;

  const tiles: TileDef[] = [
    { key: "open", label: "Waiting on consultant", icon: TILE_ICONS.open, tone: "blue", value: c ? c.open : null, hint: "Extended or negotiating" },
    { key: "soon", label: "Closing soon", icon: TILE_ICONS.soon, tone: "orange", value: c ? c.closingSoon : null, hint: c ? `Answer due within ${c.closingSoonDays} days` : "" },
    { key: "accepted", label: "Accepted", icon: TILE_ICONS.accepted, tone: "green", value: c ? c.accepted : null, hint: "Answered yes by the consultant" },
    { key: "placed", label: "Placed from offers", icon: TILE_ICONS.placed, tone: "violet", value: c ? c.placed : null, hint: "Placements created by an accepted offer" },
  ];

  const open = (id: number) => setView({ selected: id }, false);
  const closeDrawer = () => setView({ selected: null }, false);
  const drawerOpen = view.selected !== null;

  const panel =
    view.selected === null ? null : (
      <OfferDetailPanel
        orgId={orgId}
        offerId={view.selected}
        reloadToken={reloadToken}
        onChanged={() => {
          void loadList(view, true);
          void loadCounts();
        }}
        onEdit={(d) => setDialog({ editing: d })}
      />
    );

  return (
    <div data-offers-page>
      <PageHeader title="Offers" subtitle={`Record the offers your clients extend to ${orgName} consultants and follow them to a placement.`} />
      <div className="space-y-4">
        <OfferTiles tiles={tiles} loading={counts.status === "loading"} />

        <section aria-label="Offers" className="ent-card px-4 pb-4 pt-1.5" data-offers-card>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Tabs value={view.tab} onValueChange={(t) => setView({ tab: t as OfferTab })} variant="underline" className="min-w-0 flex-1">
              <TabList aria-label="Offer states" className="!gap-3 overflow-x-auto">
                {TAB_ORDER.map((t) => (
                  <Tab key={t} value={t} className={TAB}>
                    {TAB_LABEL[t]}
                    {tabCount[t] !== undefined ? ` (${tabCount[t]})` : ""}
                  </Tab>
                ))}
              </TabList>
            </Tabs>
            {canManage && (
              <Button type="button" variant="accent" onClick={() => setDialog({ editing: null })} data-record-offer className="!h-[36px] flex-none !rounded-lg !px-4 !py-0 !text-[12.5px]">
                <PlusIcon size={15} aria-hidden /> Record an offer
              </Button>
            )}
          </div>

          <div className="mt-2.5">
            <SearchBox value={view.q} onChange={(q) => setView({ q })} label="Search offers" placeholder="Search by consultant, client or role…" />
          </div>

          <div className="mt-3">
            {list.status === "loading" && <TableSkeleton count={5} columns={5} label="Loading offers" />}
            {list.status === "error" && <ErrorState what="the offers" description={list.message} onRetry={() => void loadList(view, false)} />}
            {list.status === "ok" && rows.length === 0 && (
              <EmptyState
                title={searching ? "No offers match that search" : view.tab === "open" ? "No open offers" : "Nothing here yet"}
                description={
                  searching
                    ? "Try a different name, client or role."
                    : "When a client extends an offer, record it here. The consultant is told and answers it in their own workspace."
                }
              />
            )}
            {list.status === "ok" && rows.length > 0 && (narrow ? <OfferCards rows={rows} openId={view.selected} onOpen={open} /> : <OfferTable rows={rows} openId={view.selected} onOpen={open} />)}
          </div>

          {list.status === "ok" && rows.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between" data-pagination>
              <p aria-live="polite">{showingText(total, view.page, view.size, rows.length)}</p>
              {pages > 1 && (
                <nav aria-label="Pagination" className="flex items-center gap-2">
                  <Button type="button" variant="ghost" disabled={view.page <= 0} onClick={() => setView({ page: view.page - 1 }, false)}>
                    Previous
                  </Button>
                  <span className="tabular-nums">
                    Page {view.page + 1} of {pages}
                  </span>
                  <Button type="button" variant="ghost" disabled={view.page >= pages - 1} onClick={() => setView({ page: view.page + 1 }, false)}>
                    Next
                  </Button>
                </nav>
              )}
            </div>
          )}
        </section>
      </div>

      {!narrow && (
        <SideSheet id="ent-offer-sheet" side="right" mode="overlay" width={440} open={drawerOpen} onClose={closeDrawer} title="Offer" description={undefined}>
          {panel}
        </SideSheet>
      )}
      {narrow && (
        <BottomSheet id="ent-offer-sheet" open={drawerOpen} onClose={closeDrawer} title="Offer" defaultSnap="partial">
          {panel}
        </BottomSheet>
      )}

      <OfferDialog
        open={dialog !== null}
        orgId={orgId}
        editing={dialog?.editing ?? null}
        onClose={() => setDialog(null)}
        onSaved={(d, created) => {
          setDialog(null);
          toast({
            title: created ? "Offer recorded" : "Offer updated",
            description: `${d.offer.consultant.name} at ${d.offer.clientName}. Nothing was signed or sent, and no money moved.`,
            variant: "success",
          });
          refresh();
          if (created) setView({ tab: d.offer.state === "DRAFT" ? "draft" : "open", selected: d.offer.id }, false);
        }}
      />
    </div>
  );
}

const HEAD = "px-2 py-2 text-left text-[12px] font-bold text-[color:var(--ent-title)]";
const CELL = "px-2 py-2.5 text-[13px] text-ink";

function OfferTable({ rows, openId, onOpen }: { rows: OfferRow[]; openId: number | null; onOpen: (id: number) => void }) {
  return (
    <div className="overflow-x-auto" data-offers-table>
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-[color:var(--ent-table-line)]">
            <th className={HEAD}>Consultant</th>
            <th className={HEAD}>Client and role</th>
            <th className={HEAD}>Package</th>
            <th className={HEAD}>Start</th>
            <th className={HEAD}>Answer by</th>
            <th className={HEAD}>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              data-row-id={r.id}
              tabIndex={0}
              aria-label={`${r.consultant.name}, ${r.roleTitle} at ${r.clientName}, ${r.stateLabel}`}
              onClick={() => onOpen(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(r.id);
                }
              }}
              className={`cursor-pointer border-b border-[color:var(--ent-table-line)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${openId === r.id ? "bg-accent-soft/60" : "hover:bg-accent-soft/30"}`}
            >
              <td className={CELL}>
                <span className="flex items-center gap-2">
                  <MemberAvatar name={r.consultant.name} size={30} />
                  <span className="font-semibold">{r.consultant.name}</span>
                </span>
              </td>
              <td className={CELL}>
                <span className="block font-medium">{r.clientName}</span>
                <span className="block text-[12px] text-muted">{r.roleTitle}</span>
              </td>
              <td className={`${CELL} whitespace-nowrap`}>{packageText(r)}</td>
              <td className={`${CELL} whitespace-nowrap`}>{r.startDate ? formatDay(r.startDate) : <span className="text-muted">Not set</span>}</td>
              <td className={`${CELL} whitespace-nowrap`}>{r.deadline ? formatDay(r.deadline) : <span className="text-muted">No deadline</span>}</td>
              <td className={CELL}>
                <StatePill state={r.state} label={r.stateLabel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OfferCards({ rows, openId, onOpen }: { rows: OfferRow[]; openId: number | null; onOpen: (id: number) => void }) {
  return (
    <ul aria-label="Offers" className="space-y-2.5" data-offer-cards>
      {rows.map((r) => (
        <li key={r.id} data-row-id={r.id} className={`rounded-[14px] border bg-white ${openId === r.id ? "border-accent bg-accent-soft/40" : "border-[color:var(--ent-card-border)]"}`}>
          <button type="button" onClick={() => onOpen(r.id)} className="block min-h-11 w-full p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span className="flex items-start gap-2.5">
              <MemberAvatar name={r.consultant.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">{r.consultant.name}</span>
                <span className="block text-[12.5px] text-muted">
                  {r.roleTitle} at {r.clientName}
                </span>
              </span>
              <StatePill state={r.state} label={r.stateLabel} />
            </span>
            <span className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px] text-ink">
              <span className="font-medium">{packageText(r)}</span>
              <span className="text-muted">{r.startDate ? `Starts ${formatDay(r.startDate)}` : "Start date not set"}</span>
            </span>
            {deadlineText(r) && <span className="mt-1 block text-[12px] text-muted">{deadlineText(r)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
