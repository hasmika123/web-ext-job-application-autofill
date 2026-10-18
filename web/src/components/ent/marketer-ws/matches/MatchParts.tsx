"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertIcon, BarChartIcon, BuildingIcon, Button, CheckCircleIcon, ErrorState, MemberAvatar, MinusCircleIcon, Select, SideSheet, SparklesIcon, cn, useNarrow,
} from "@kiwiply/ui";
import { CARD, CardSkeleton, Empty, Head, TINTS } from "@/components/ent/marketer-ws/parts";
import {
  fetchCompare, fetchMatchDetail, matchPhoto, scoreTone,
  type Availability, type FitTone, type Insight, type MatchDetail, type MatchRow,
} from "@/lib/ent/marketer-ws/matches";

/** Pieces of the Job Matches board: score chip, availability dot, resume-update cell, explanation, insights, drawers. */

export const SCORE_TONE = { green: "bg-v2-green-soft text-v2-green-ink", amber: "bg-v2-amber-soft text-v2-amber-ink" } as const;
const DOT: Record<FitTone, string> = { green: "bg-v2-green-ink", blue: "bg-accent-deep", amber: "bg-v2-amber-ink", red: "bg-v2-pink-ink" };
const TEXT_TONE: Record<FitTone, string> = { green: "text-v2-green-ink", blue: "text-accent-deep", amber: "text-v2-amber-ink", red: "text-v2-pink-ink" };
/** Insight bar colours, in board order: skills, experience, availability, client history, location (tokens, never a literal). */
const BAR: Record<string, string> = {
  skills: "var(--color-v2-green)", experience: "var(--color-v2-blue)", availability: "var(--color-v2-violet)", client: "var(--color-v2-coral)", location: "var(--color-v2-amber)",
};

export function ScoreChip({ score, size = "md" }: { score: number; size?: "md" | "sm" }) {
  return (
    <span data-score-chip className={cn("inline-block rounded-md font-bold tabular-nums", SCORE_TONE[scoreTone(score)], size === "md" ? "px-2.5 py-1 text-[13px]" : "px-2 py-0.5 text-[12.5px]")}>
      {score}%
    </span>
  );
}

export function AvailabilityDot({ fit }: { fit: Availability }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft">
      <span aria-hidden className={cn("h-2.5 w-2.5 flex-none rounded-full", DOT[fit.tone])} />
      {fit.label}
    </span>
  );
}

export function ResumeCell({ row }: { row: MatchRow }) {
  const need = row.resumeUpdate;
  return need.needed ? (
    <span title={need.reasons.join("; ")} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-v2-amber-ink">
      <AlertIcon size={15} className="flex-none" />
      Update
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft">
      <CheckCircleIcon size={15} className="flex-none text-v2-green-ink" />
      Not Required
    </span>
  );
}

export const Chip = ({ children }: { children: ReactNode }) => <span className="rounded-md border border-line bg-paper-2 px-2 py-0.5 text-[11.5px] text-ink-soft">{children}</span>;

export function Person({ row, size = 36 }: { row: Pick<MatchRow, "consultantName" | "avatarUrl" | "consultantRole">; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <MemberAvatar name={row.consultantName} src={matchPhoto(row.consultantName, row.avatarUrl)} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-ink">{row.consultantName}</span>
        <span className="block truncate text-[12px] text-muted">{row.consultantRole}</span>
      </span>
    </span>
  );
}

export function Bars({ insights }: { insights: Insight[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {insights.map((i) => (
        <li key={i.key} data-insight={i.key} className="grid grid-cols-[minmax(0,110px)_1fr_38px] items-center gap-2.5 text-[12.5px]">
          <span className="truncate font-semibold text-ink-soft">{i.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-paper-2">
            {i.pct !== null ? <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, i.pct))}%`, background: BAR[i.key] ?? "var(--color-accent)" }} /> : null}
          </span>
          <span className="text-right font-semibold tabular-nums text-ink-soft">{i.pct !== null ? `${i.pct}%` : "n/a"}</span>
        </li>
      ))}
    </ul>
  );
}

export function Ticks({ detail, title }: { detail: MatchDetail; title: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-v2-green-soft/60 p-3.5">
      <h3 className="text-[13.5px] font-bold text-ink">{title}</h3>
      {detail.ticks.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">No strong signals yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {detail.ticks.map((t) => (
            <li key={t.key} data-tick={t.key} data-ok={t.ok} className={cn("flex items-start gap-2 text-[12.5px]", t.ok ? "text-ink-soft" : "text-muted")}>
              {t.ok ? <CheckCircleIcon size={15} className="mt-px flex-none text-v2-green-ink" /> : <MinusCircleIcon size={15} className="mt-px flex-none text-v2-amber-ink" />}
              <span>{t.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The "Match Explanation" card: selected consultant, their job, the big score and the ticks. */
export function ExplanationCard({ detail, loading }: { detail: MatchDetail | null; loading: boolean }) {
  return (
    <section data-match-card="explanation" aria-label="Match Explanation" className={CARD}>
      <Head icon={SparklesIcon} title="Match Explanation" tint="violet" />
      {loading && !detail ? (
        <CardSkeleton rows={2} />
      ) : !detail ? (
        <Empty>Pick a match to see why it fits.</Empty>
      ) : (
        <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1.5fr)_auto_minmax(0,1.3fr)_auto_minmax(0,1.2fr)]">
          <div className="flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-line p-3">
            <MemberAvatar name={detail.consultant.name} src={matchPhoto(detail.consultant.name, detail.consultant.avatarUrl, true)} size={56} />
            <div className="min-w-0">
              <p className="truncate text-[16px] font-bold text-ink">{detail.consultant.name}</p>
              <p className="truncate text-[12.5px] text-muted">{detail.consultant.role}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">{detail.consultant.skills.map((s) => <Chip key={s}>{s}</Chip>)}</div>
            </div>
          </div>
          <span aria-hidden className="hidden self-center text-[20px] text-accent-deep lg:block">{"→"}</span>
          <div className="flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-line p-3">
            <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-[11px]", TINTS.blue)}><BuildingIcon size={22} /></span>
            <div className="min-w-0">
              <p className="truncate text-[16px] font-bold text-ink">{detail.job.title}</p>
              <p className="truncate text-[12.5px] text-muted">{detail.job.client}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">{detail.job.skills.map((s) => <Chip key={s}>{s}</Chip>)}</div>
            </div>
          </div>
          <div data-big-score className="flex flex-col items-center justify-center px-2">
            <span className={cn("text-[34px] font-extrabold leading-none tabular-nums", TEXT_TONE[scoreTone(detail.row.score) === "green" ? "green" : "amber"])}>{detail.row.score}%</span>
            <span className="mt-1 text-[12px] text-muted">Match Score</span>
          </div>
          <Ticks detail={detail} title="Why this is a great match" />
        </div>
      )}
    </section>
  );
}

export function InsightsCard({ detail, loading }: { detail: MatchDetail | null; loading: boolean }) {
  return (
    <section data-match-card="insights" aria-label="Match Insights" className={CARD}>
      <Head icon={BarChartIcon} title="Match Insights" tint="blue" />
      {loading && !detail ? <CardSkeleton rows={3} /> : !detail ? <Empty>Insights show up once a match is selected.</Empty> : <Bars insights={detail.insights} />}
    </section>
  );
}

/** Review: everything known about one match, with the Assign decision in reach. E1: Assign records the match only. */
export function ReviewDrawer({
  orgId, matchId, onClose, onAssign, busy,
}: { orgId: number; matchId: number | null; onClose: () => void; onAssign: (row: MatchRow) => void; busy: boolean }) {
  const narrow = useNarrow();
  const [state, setState] = useState<{ id: number | null; kind: "loading" | "ok" | "failed"; detail: MatchDetail | null }>({ id: null, kind: "loading", detail: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (matchId === null) return;
    let live = true;
    void fetchMatchDetail(orgId, matchId).then((r) => {
      if (!live) return;
      setState(r.kind === "OK" ? { id: matchId, kind: "ok", detail: r.detail } : { id: matchId, kind: "failed", detail: null });
    });
    return () => {
      live = false;
    };
  }, [orgId, matchId, attempt]);
  const d = state.id === matchId ? state.detail : null;
  const failed = state.id === matchId && state.kind === "failed";
  return (
    <SideSheet
      id="match-review"
      side="right"
      mode={narrow ? "fullscreen" : "overlay"}
      width={520}
      open={matchId !== null}
      title="Review match"
      description="Why this consultant fits this job."
      onClose={onClose}
      footer={
        d ? (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            <Button variant="accent" size="sm" disabled={busy || d.row.status !== "SUGGESTED"} onClick={() => onAssign(d.row)}>
              {d.row.status === "ASSIGNED" ? "Assigned" : "Assign"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {failed ? (
        <ErrorState what="this match" description="The match didn't load. Nothing has changed." onRetry={() => { setState({ id: null, kind: "loading", detail: null }); setAttempt((n) => n + 1); }} variant="inline" />
      ) : !d ? (
        <CardSkeleton rows={4} />
      ) : (
        <div data-review-body className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Person row={{ consultantName: d.consultant.name, avatarUrl: d.consultant.avatarUrl, consultantRole: d.consultant.role }} size={44} />
            <ScoreChip score={d.row.score} />
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line p-3">
            <p className="text-[14px] font-bold text-ink">{d.job.title}</p>
            <p className="text-[12.5px] text-muted">{d.job.client}{d.job.location ? ` - ${d.job.location}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-1">{d.job.skills.map((s) => <Chip key={s}>{s}</Chip>)}</div>
          </div>
          <Ticks detail={d} title="Why this match" />
          <section aria-label="Match insights"><Bars insights={d.insights} /></section>
          {d.missingSkills.length > 0 ? <p className="text-[12.5px] text-ink-soft"><span className="font-semibold">Skills not on the profile:</span> {d.missingSkills.join(", ")}</p> : null}
          <p className="text-[12.5px] text-ink-soft">
            <span className="font-semibold">Availability:</span> <AvailabilityDot fit={d.row.availability} />
          </p>
          <p className="text-[12.5px] text-ink-soft">
            <span className="font-semibold">Resume:</span> {d.row.resumeUpdate.needed ? d.row.resumeUpdate.reasons.join("; ") : "No update needed."}
          </p>
        </div>
      )}
    </SideSheet>
  );
}

/** Compare: two matches side by side. The second one is picked from the matches on screen; nothing is changed by comparing. */
export function CompareDrawer({
  orgId, aId, candidates, onClose,
}: { orgId: number; aId: number | null; candidates: MatchRow[]; onClose: () => void }) {
  const narrow = useNarrow();
  const options = useMemo(() => candidates.filter((c) => c.id !== aId), [candidates, aId]);
  const a = candidates.find((c) => c.id === aId) ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  const bId = picked !== null && options.some((o) => o.id === picked) ? picked : (options.find((o) => a && o.consultantId === a.consultantId) ?? options[0])?.id ?? null;
  const [state, setState] = useState<{ key: string; kind: "ok" | "failed"; a: MatchDetail | null; b: MatchDetail | null } | null>(null);
  const key = aId !== null && bId !== null ? `${aId}:${bId}` : "";
  useEffect(() => {
    if (!key || aId === null || bId === null) return;
    let live = true;
    void fetchCompare(orgId, aId, bId).then((r) => {
      if (live) setState(r.kind === "OK" ? { key, kind: "ok", a: r.a, b: r.b } : { key, kind: "failed", a: null, b: null });
    });
    return () => {
      live = false;
    };
  }, [orgId, aId, bId, key]);
  const ready = state && state.key === key ? state : null;
  const column = (d: MatchDetail | null, label: string) => (
    <div data-compare-col={label} className="min-w-0 rounded-[var(--radius-lg)] border border-line p-3">
      {d ? (
        <div className="flex flex-col gap-3">
          <Person row={{ consultantName: d.consultant.name, avatarUrl: d.consultant.avatarUrl, consultantRole: d.consultant.role }} />
          <div>
            <p className="text-[13.5px] font-bold text-ink">{d.job.title}</p>
            <p className="text-[12px] text-muted">{d.job.client}</p>
          </div>
          <ScoreChip score={d.row.score} />
          <Bars insights={d.insights} />
          <ul className="flex flex-col gap-1">
            {d.ticks.map((t) => <li key={t.key} className={cn("text-[12px]", t.ok ? "text-ink-soft" : "text-muted")}>{t.ok ? "✓ " : "- "}{t.text}</li>)}
          </ul>
          <p className="text-[12px] text-ink-soft"><AvailabilityDot fit={d.row.availability} /></p>
          <p className="text-[12px] text-ink-soft">Resume: {d.row.resumeUpdate.needed ? "Update" : "Not Required"}</p>
        </div>
      ) : (
        <CardSkeleton rows={4} />
      )}
    </div>
  );
  return (
    <SideSheet id="match-compare" side="right" mode={narrow ? "fullscreen" : "overlay"} width={900} open={aId !== null} title="Compare matches" description="Two matches side by side." onClose={onClose}>
      {options.length === 0 ? (
        <Empty>There is no other match on this page to compare with.</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">
            Compare with
            <Select
              aria-label="Compare with"
              value={bId === null ? "" : String(bId)}
              onChange={(v) => setPicked(Number(v))}
              options={options.map((o) => ({ value: String(o.id), label: `${o.consultantName} - ${o.jobTitle} (${o.score}%)` }))}
            />
          </label>
          {ready?.kind === "failed" ? <ErrorState what="the comparison" description="The two matches didn't load." variant="inline" /> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {column(ready?.a ?? null, "a")}
            {column(ready?.b ?? null, "b")}
          </div>
        </div>
      )}
    </SideSheet>
  );
}

