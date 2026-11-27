"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ErrorState, SparklesIcon } from "@kiwiply/ui";
import { CARD, CardSkeleton, Empty, Head, TH } from "../parts";
import { fetchCanonicalDetail, fetchCanonicalMatches, actOnCanonicalMatch, type CanonicalMatchItem } from "@/lib/ent/marketer-ws/canonical-matches";
import { Person, ScoreChip } from "./MatchParts";

type PanelStatus = "loading" | "ready" | "failed" | "denied";

/** The canonical source and action contract for the marketer Matches tab. */
export default function CanonicalMatchesPanel({ orgId }: { orgId: number }) {
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [items, setItems] = useState<CanonicalMatchItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CanonicalMatchItem | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus((current) => (current === "ready" ? current : "loading"));
    const result = await fetchCanonicalMatches(orgId);
    if (result.kind === "OK") {
      setItems(result.view.items);
      setStatus("ready");
    } else {
      setStatus(result.kind === "DENIED" ? "denied" : "failed");
    }
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const result = await fetchCanonicalMatches(orgId);
      if (cancelled) return;
      if (result.kind === "OK") {
        setItems(result.view.items);
        setStatus("ready");
      } else {
        setStatus(result.kind === "DENIED" ? "denied" : "failed");
      }
    };

    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const review = async (item: CanonicalMatchItem) => {
    setSelectedId(item.match.id);
    setDetail(null);
    setDetailStatus("loading");
    const result = await fetchCanonicalDetail(orgId, item.match.id);
    if (result.kind === "OK") {
      setDetail(result.item);
      setDetailStatus("idle");
    } else {
      setDetailStatus("failed");
    }
  };

  const act = async (item: CanonicalMatchItem, action: "assign" | "dismiss") => {
    setNotice(null);
    setBusy((current) => new Set(current).add(item.match.id));
    const result = await actOnCanonicalMatch(orgId, item.match.id, action);
    setBusy((current) => {
      const next = new Set(current);
      next.delete(item.match.id);
      return next;
    });
    if (result.kind === "OK") {
      setSelectedId(null);
      setDetail(null);
      await load();
    } else {
      setNotice(result.kind === "CONFLICT" ? result.message : result.kind === "DENIED" ? "You can't do that on this canonical match." : "That canonical match didn't change.");
    }
  };

  return (
      <section
        aria-label="Canonical suggestions"
        data-canonical-matches
        data-status={status}
        className={CARD}
      >
      <Head icon={SparklesIcon} title="Canonical suggestions" tint="teal" count={status === "ready" ? items.length : undefined}>
        <span data-canonical-source className="ml-auto text-[12px] text-muted">Source: opportunity matches</span>
      </Head>
      {notice ? <p role="alert" className="mb-2 rounded-lg bg-v2-amber-soft px-3 py-2 text-[12.5px] text-v2-amber-ink">{notice}</p> : null}
      {status === "loading" ? <CardSkeleton rows={3} /> : status === "failed" ? <ErrorState what="canonical suggestions" description="The canonical suggestions didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" /> : status === "denied" ? <Empty>Canonical suggestions are not available for this workspace.</Empty> : items.length === 0 ? <Empty>No canonical suggestions yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="bg-paper-2">
                <th className={TH}>Consultant</th>
                <th className={TH}>Matched opening</th>
                <th className={TH}>Company</th>
                <th className={TH}>Score</th>
                <th className={TH}>Source</th>
                <th className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const match = item.match;
                const consultant = item.consultant;
                const working = busy.has(match.id);
                return (
                  <tr key={match.id} data-canonical-match-row={match.id} className="border-b border-line/60 align-middle last:border-0">
                    <td className="min-w-[180px] px-2 py-2"><Person row={{ consultantName: consultant.name, avatarUrl: null, consultantRole: consultant.role }} /></td>
                    <td className="px-2 py-2 text-[13px] text-ink-soft">{match.title}</td>
                    <td className="px-2 py-2 text-[13px] text-ink-soft">{match.company || "-"}</td>
                    <td className="px-2 py-2"><ScoreChip score={match.score} /></td>
                    <td className="px-2 py-2 text-[12.5px] text-muted">{item.source}</td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-1.5">
                        <Button size="sm" variant="accent-soft" className="px-2.5 py-1.5 text-[12.5px]" onClick={() => void review(item)}>Review</Button>
                        <Button size="sm" variant="accent" className="px-2.5 py-1.5 text-[12.5px]" disabled={working || match.status !== "SUGGESTED"} onClick={() => void act(item, "assign")}>{match.status === "ASSIGNED" ? "Assigned" : "Assign"}</Button>
                        <Button size="sm" variant="ghost" className="px-2.5 py-1.5 text-[12.5px]" disabled={working || match.status !== "SUGGESTED"} onClick={() => void act(item, "dismiss")}>Dismiss</Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selectedId !== null ? (
        <div data-canonical-detail className="mt-3 rounded-[var(--radius-lg)] border border-line bg-paper-2 p-3 text-[12.5px] text-ink-soft">
          {detailStatus === "loading" ? <CardSkeleton rows={1} /> : detailStatus === "failed" || !detail ? <p>That canonical match could not be loaded.</p> : (
            <>
              <p className="font-semibold text-ink">{detail.match.title} for {detail.consultant.name}</p>
              <p className="mt-1">{detail.match.reason || "No explanation was recorded."}</p>
              {detail.match.location ? <p className="mt-1">Location: {detail.match.location}</p> : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
