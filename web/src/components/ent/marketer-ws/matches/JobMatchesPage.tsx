"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChartIcon, BuildingIcon, Button, ErrorState, GearIcon, Menu, MoreVerticalIcon, Select, UserIcon, UsersIcon, cn,
} from "@kiwiply/ui";
import { CARD, CardSkeleton, Empty, HEAD_ROW, Head, TH, type MktPageProps } from "../parts";
import {
  EMPTY_QUERY, actOnMatch, fetchMatchDetail, fetchMatches,
  type MatchDetail, type MatchQuery, type MatchRow, type MatchesView,
} from "@/lib/ent/marketer-ws/matches";
import type { DuplicateConfirm, DuplicateFinding } from "@/lib/ent/marketer-ws/duplicate";
import { DuplicateConfirmDialog } from "../DuplicateConfirm";
import { AvailabilityDot, CompareDrawer, ExplanationCard, Person, ResumeCell, ReviewDrawer, ScoreChip } from "./MatchParts";

/**
 * The Matches tab of Jobs. One call draws the board; the explanation of a clicked row (the right side) is one small call. Every number comes
 * from the API (computed from real rows); a section with nothing in it says so. E1: Assign records that the marketer puts a match
 * forward, it never submits anything for the consultant.
 */

const ALL = "all";
const FILTER_LABEL = "text-[12.5px] font-semibold text-ink-soft";

function FilterSelect({ label, icon, value, options, onChange }: { label: string; icon: ReactNode; value: string; options: { value: string; label: string }[]; onChange: (val: string) => void }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className={FILTER_LABEL}>{label}</span>
      <Select aria-label={label} leadingIcon={icon} value={value === "" ? ALL : value} onChange={(val) => onChange(val === ALL ? "" : val)} options={options} />
    </label>
  );
}

type Status = "loading" | "ready" | "failed" | "denied";

export default function JobMatchesPage({ orgId }: MktPageProps) {
  const [query, setQuery] = useState<MatchQuery>(EMPTY_QUERY);
  const [view, setView] = useState<MatchesView | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [explanation, setExplanation] = useState<MatchDetail | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [compareId, setCompareId] = useState<number | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [dupAsk, setDupAsk] = useState<{ row: MatchRow; message: string; findings: DuplicateFinding[] } | null>(null);
  const selectedRef = useRef<number | null>(null);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const load = useCallback(
    async (q: MatchQuery) => {
      const r = await fetchMatches(orgId, { ...q, selected: selectedRef.current });
      if (r.kind === "OK") {
        setView(r.view);
        setStatus("ready");
        setExplanation(r.view.explanation);
        selectedRef.current = r.view.explanation?.row.id ?? null;
        setPicked(new Set());
      } else setStatus(r.kind === "DENIED" ? "denied" : (s) => (s === "ready" ? s : "failed"));
    },
    [orgId],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(query), 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const change = (patch: Partial<MatchQuery>) => {
    selectedRef.current = null;
    setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 0 }));
  };
  const filtered = query.consultantId !== "" || query.skill !== "" || query.clientId !== "" || query.score !== "";

  const select = async (row: MatchRow) => {
    selectedRef.current = row.id;
    setExplaining(true);
    const r = await fetchMatchDetail(orgId, row.id);
    if (selectedRef.current === row.id) {
      if (r.kind === "OK") setExplanation(r.detail);
      setExplaining(false);
    }
  };

  /**
   * Assign or dismiss one match. A duplicate warning on an assign asks for a reason (the dialog) and sends it again with the confirmation; a block or the
   * open-opportunity limit is a plain sentence. In a batch the flagged rows are skipped and named afterwards, never confirmed for the marketer.
   */
  const act = async (row: MatchRow, action: "assign" | "dismiss", confirm?: DuplicateConfirm, batch = false): Promise<"OK" | "DUPLICATE" | "REFUSED"> => {
    if (!batch) setNotice(null);
    setBusy((b) => new Set(b).add(row.id));
    const r = await actOnMatch(orgId, row.id, action, confirm);
    setBusy((b) => {
      const n = new Set(b);
      n.delete(row.id);
      return n;
    });
    if (r.kind === "OK") {
      setReviewId(null);
      setDupAsk(null);
      await load(queryRef.current);
      return "OK";
    }
    if (r.kind === "DUPLICATE") {
      if (!batch) {
        setReviewId(null);
        setDupAsk({ row, message: r.message, findings: r.findings });
      }
      return "DUPLICATE";
    }
    if (!batch) setDupAsk(null);
    const text = r.kind === "CONFLICT" ? r.message : r.kind === "DENIED" ? "You can't do that on this match." : "That didn't go through. Nothing has changed.";
    setNotice((n) => (batch && n ? `${n} ${text}` : text));
    return "REFUSED";
  };

  const assignPicked = async () => {
    setNotice(null);
    let flagged = 0;
    for (const row of (view?.items ?? []).filter((r) => picked.has(r.id) && r.status === "SUGGESTED")) if ((await act(row, "assign", undefined, true)) === "DUPLICATE") flagged += 1;
    if (flagged > 0) setNotice((n) => `${n ? `${n} ` : ""}Left out: ${flagged} looked like a duplicate (assign those one by one to confirm).`);
  };

  if (status === "denied") return <ErrorState what="the matches" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;
  if (status === "failed")
    return (
      <div data-job-matches data-status="failed">
        <ErrorState what="the matches" description="Your matches didn't load. Nothing has changed." onRetry={() => void load(query)} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      </div>
    );

  const loading = status === "loading";
  const v = view;
  const items = v?.items ?? [];
  const total = v?.total ?? 0;
  const size = v?.size ?? query.size;
  const from = total === 0 ? 0 : (v?.page ?? 0) * size + 1;
  const to = Math.min(total, (v?.page ?? 0) * size + items.length);
  const highCount = v?.kpis.find((k) => k.key === "highConfidence")?.value ?? 0;
  const pages = Math.max(1, Math.ceil(total / Math.max(1, size)));

  return (
    <div data-job-matches data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <div data-matches-chips role="group" aria-label="Match filter" className="flex flex-wrap items-center gap-2">
        {[
          { value: "", label: "All", count: v?.kpis.find((k) => k.key === "matched")?.value ?? total },
          { value: "high", label: "High-confidence", count: highCount },
        ].map((c) => {
          const active = query.score === c.value;
          return (
            <button
              key={c.label}
              type="button"
              aria-pressed={active}
              data-score-chip-filter={c.value || "all"}
              onClick={() => change({ score: c.value })}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold",
                active ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink-soft hover:border-accent",
              )}
            >
              {c.label} ({c.count})
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <section aria-label="Filters" data-matches-filters className={cn(CARD, "flex flex-wrap items-end gap-3")}>
            <FilterSelect label="Consultant" icon={<UserIcon size={16} className="text-accent-deep" />} value={query.consultantId} options={[{ value: ALL, label: "All consultants" }, ...(v?.filters.consultants ?? []).map((o) => ({ value: o.key, label: o.label }))]} onChange={(val) => change({ consultantId: val })} />
            <FilterSelect label="Primary skill" icon={<GearIcon size={16} className="text-accent-deep" />} value={query.skill} options={[{ value: ALL, label: "All skills" }, ...(v?.filters.skills ?? []).map((s) => ({ value: s, label: s }))]} onChange={(val) => change({ skill: val })} />
            <FilterSelect label="Client" icon={<BuildingIcon size={16} className="text-accent-deep" />} value={query.clientId} options={[{ value: ALL, label: "All clients" }, ...(v?.filters.clients ?? []).map((o) => ({ value: o.key, label: o.label }))]} onChange={(val) => change({ clientId: val })} />
            <FilterSelect label="Match score" icon={<BarChartIcon size={16} className="text-accent-deep" />} value={query.score} options={[{ value: ALL, label: "All scores" }, ...(v?.filters.scores ?? []).map((o) => ({ value: o.key, label: o.label }))]} onChange={(val) => change({ score: val })} />
            <button type="button" disabled={!filtered} onClick={() => change({ consultantId: "", skill: "", clientId: "", score: "" })} className="mb-2 flex-none px-1 text-[13px] font-semibold text-accent-deep hover:underline disabled:opacity-50 disabled:hover:no-underline">
              Clear filters
            </button>
          </section>

          <section aria-label="Matches" data-match-card="table" className={CARD}>
            <Head icon={UsersIcon} title="Matches" tint="violet">
              <span data-showing className="ml-auto text-[12.5px] text-muted">{loading ? "Loading..." : `Showing ${from}–${to} of ${total.toLocaleString("en-US")} matches`}</span>
            </Head>
            {notice ? <p role="alert" className="mb-2 rounded-lg bg-v2-amber-soft px-3 py-2 text-[12.5px] text-v2-amber-ink">{notice}</p> : null}
            {picked.size > 0 ? (
              <p className="mb-2 flex items-center gap-3 text-[12.5px] text-ink-soft">
                {picked.size} selected
                <Button size="sm" variant="accent-soft" onClick={() => void assignPicked()}>Assign selected</Button>
              </p>
            ) : null}
            {loading ? (
              <CardSkeleton rows={6} />
            ) : items.length === 0 ? (
              <Empty>{filtered ? "No matches fit these filters." : "Run a match to see suggestions."}</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left">
                  <thead>
                    <tr className={HEAD_ROW}>
                      <th className={cn(TH, "w-8")}>
                        <input
                          type="checkbox"
                          aria-label="Select all matches on this page"
                          checked={items.length > 0 && items.every((r) => picked.has(r.id))}
                          onChange={(e) => setPicked(e.target.checked ? new Set(items.map((r) => r.id)) : new Set())}
                          className="h-4 w-4 accent-[var(--color-accent-deep)]"
                        />
                      </th>
                      {["Consultant", "Primary skill", "Matched opening", "Client", "Match score", "Availability fit", "Resume update", "Actions"].map((h) => (
                        <th key={h} className={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const sel = explanation?.row.id === r.id;
                      const working = busy.has(r.id);
                      return (
                        <tr key={r.id} data-match-row={r.id} aria-selected={sel} onClick={() => void select(r)} className={cn("cursor-pointer border-b border-line/60 align-middle last:border-0 hover:bg-paper-2/60", sel && "bg-accent-soft/40")}>
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${r.consultantName}`}
                              checked={picked.has(r.id)}
                              onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })}
                              className="h-4 w-4 accent-[var(--color-accent-deep)]"
                            />
                          </td>
                          <td className="min-w-[170px] px-2 py-2"><Person row={r} /></td>
                          <td className="px-2 py-2 text-[13px] text-ink-soft">{r.primarySkill}</td>
                          <td className="px-2 py-2 text-[13px] text-ink-soft">{r.jobTitle}</td>
                          <td className="px-2 py-2 text-[13px] text-ink-soft">{r.client}</td>
                          <td className="px-2 py-2"><ScoreChip score={r.score} /></td>
                          <td className="px-2 py-2"><AvailabilityDot fit={r.availability} /></td>
                          <td className="px-2 py-2"><ResumeCell row={r} /></td>
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <span className="flex items-center gap-1.5">
                              <Button size="sm" variant="accent-soft" className="px-2.5 py-1.5 text-[12.5px]" onClick={() => setReviewId(r.id)}>Review</Button>
                              <Button size="sm" variant="accent" className="px-2.5 py-1.5 text-[12.5px]" disabled={working || r.status !== "SUGGESTED"} onClick={() => void act(r, "assign")}>
                                {r.status === "ASSIGNED" ? "Assigned" : "Assign"}
                              </Button>
                              <Button size="sm" variant="accent-soft" className="px-2.5 py-1.5 text-[12.5px]" onClick={() => setCompareId(r.id)}>Compare</Button>
                              <Menu
                                align="end"
                                trigger={<button type="button" aria-label={`More actions for ${r.consultantName}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-paper-2"><MoreVerticalIcon size={16} /></button>}
                                items={[{ label: "Dismiss match", onSelect: () => void act(r, "dismiss"), disabled: r.status !== "SUGGESTED" || working }]}
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
            {!loading && pages > 1 ? (
              <nav aria-label="Pages" className="mt-3 flex items-center justify-end gap-2 text-[12.5px] text-muted">
                <Button size="sm" variant="ghost" disabled={(v?.page ?? 0) <= 0} onClick={() => change({ page: (v?.page ?? 0) - 1 })}>Previous</Button>
                <span>Page {(v?.page ?? 0) + 1} of {pages}</span>
                <Button size="sm" variant="ghost" disabled={(v?.page ?? 0) + 1 >= pages} onClick={() => change({ page: (v?.page ?? 0) + 1 })}>Next</Button>
              </nav>
            ) : null}
          </section>

        </div>

        <aside className="min-w-0 xl:sticky xl:top-4" aria-label="Match explanation">
          <ExplanationCard detail={explanation} loading={loading || explaining} stacked />
        </aside>
      </div>


      <ReviewDrawer orgId={orgId} matchId={reviewId} onClose={() => setReviewId(null)} onAssign={(row) => void act(row, "assign")} busy={reviewId !== null && busy.has(reviewId)} />
      <CompareDrawer orgId={orgId} aId={compareId} candidates={items} onClose={() => setCompareId(null)} />
      <DuplicateConfirmDialog
        open={dupAsk !== null} id="match-duplicate" bodyAttrs={{ "data-match-dialog": "duplicate" }}
        intro={dupAsk ? `Assigning this to ${dupAsk.row.consultantName} would put them in front of the same role twice.` : ""} confirmLabel="Assign anyway"
        message={dupAsk?.message ?? ""} findings={dupAsk?.findings ?? []} busy={dupAsk !== null && busy.has(dupAsk.row.id)}
        onClose={() => setDupAsk(null)} onConfirm={(reason) => dupAsk && void act(dupAsk.row, "assign", { reason })}
      />
    </div>
  );
}
