"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  BarChartIcon,
  BookOpenIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  ErrorState,
  FileTextIcon,
  LightbulbIcon,
  Menu,
  MessageIcon,
  MoreVerticalIcon,
  PlayIcon,
  SideSheet,
  Skeleton,
  Sparkline,
  TargetIcon,
  Textarea,
  UsersIcon,
  ZapIcon,
  chartColor,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import ProgressRing from "@/components/app-v2/common/ProgressRing";
import { CARD, TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, Card, Empty, Pill, TABLE, TD, useWorkspaceData } from "./parts";
import { firstName } from "@/lib/ent/consultant-ws/home";
import {
  KIND_LABEL,
  KIND_MODULE,
  KIND_TONE,
  MAX_NOTES,
  averageScore,
  checklistProgress,
  deltaIsGood,
  durationText,
  elapsedMinutes,
  fetchPrep,
  fetchSession,
  nextLabel,
  nextWhen,
  saveSession,
  scoreTone,

  sessionWhen,
  sheetProblem,
  setChecked,
  tileDelta,
  withChecked,
  type CheckItem,
  type Fetched,
  type NextInterview,
  type PrepModule,
  type PrepTile,
  type PrepView,
  type SessionDetail,
  type SessionRow,
} from "@/lib/ent/consultant-ws/interviewPrep";

/**
 * Consultant Interview Prep (design/enterprise-consultant/interview-prep.webp): one call to `GET /api/orgs/{orgId}/me-workspace/interview-prep`
 * draws the page for the signed-in consultant's OWN practice history and checklist. There is no AI scoring yet: Start Practice opens a
 * short fixed question list the consultant scores themselves, and saving records a real session. The module catalog is static default
 * content from the API (it moves to admin configuration later). Research links to Interviews; nothing is fetched from outside.
 */

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

interface TileSpec {
  key: keyof PrepView["tiles"];
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
  lowerIsBetter?: boolean;
}
const TILE_SPECS: TileSpec[] = [
  { key: "upcoming", title: "Upcoming Prep Sessions", icon: CalendarIcon, tone: "accent" },
  { key: "score", title: "Practice Score", icon: TargetIcon, tone: "green" },
  { key: "sets", title: "Suggested Question Sets", icon: FileTextIcon, tone: "violet" },
  { key: "weak", title: "Weak Areas", icon: BarChartIcon, tone: "amber", lowerIsBetter: true },
];

function tileValue(spec: TileSpec, t: PrepTile): string {
  if (t.value === null) return "-";
  return spec.key === "score" ? `${t.value}%` : String(t.value);
}

function tileNote(spec: TileSpec, t: PrepTile, view: PrepView): string {
  if (spec.key === "upcoming") return "Scheduled interviews";
  if (spec.key === "sets") return "From your skills and interviews";
  if (spec.key === "score") return t.value === null ? "Practice to get a score" : "Average of your sessions";
  if (view.history.length === 0) return "Practice to find weak areas";
  return view.weakKinds.length > 0 ? view.weakKinds.map((k) => KIND_LABEL[k]).join(", ") : "No area below 75%";
}

function Tile({ spec, view, index }: { spec: TileSpec; view: PrepView | null; index: number }) {
  const Icon = spec.icon;
  const tile = view ? view.tiles[spec.key] : null;
  const d = tile ? tileDelta(tile) : null;
  const good = d ? deltaIsGood(d.dir, spec.lowerIsBetter === true) : null;
  return (
    <section aria-label={spec.title} data-stat-tile={spec.key} data-tone={spec.tone} data-state={tile ? "ok" : "loading"} className="flex min-h-[112px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5">
      <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-[12px]", TONES[spec.tone])}>
        <Icon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold leading-tight text-ink-soft">{spec.title}</h3>
        {tile && view ? (
          <>
            <div className="mt-1 flex items-end justify-between gap-2">
              <p data-tile-value className="text-[28px] font-extrabold leading-none tabular-nums text-ink">
                {tileValue(spec, tile)}
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
                  <span data-delta={d.dir} className={cn("font-bold", good === true ? "text-v2-green-ink" : good === false ? "text-v2-coral-ink" : "text-muted")}>
                    {d.text}
                  </span>
                  <span>vs last month</span>
                </>
              ) : (
                <span>{tileNote(spec, tile, view)}</span>
              )}
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

/* ── preparation modules ────────────────────────────────────────────────────────────── */

const MODULE_LOOK: Record<string, { tone: IconTone; icon: ComponentType<IconProps> | "code" }> = {
  "question-bank": { tone: "accent", icon: FileTextIcon },
  technical: { tone: "violet", icon: "code" },
  company: { tone: "amber", icon: BuildingIcon },
  behavioral: { tone: "green", icon: UsersIcon },
};

function ModuleIcon({ moduleKey }: { moduleKey: string }) {
  const look = MODULE_LOOK[moduleKey] ?? { tone: "accent" as IconTone, icon: FileTextIcon };
  const Icon = look.icon;
  return (
    <span aria-hidden className={cn("grid h-12 w-12 flex-none place-items-center rounded-[12px]", TONES[look.tone])}>
      {Icon === "code" ? <span className="text-[15px] font-extrabold tracking-tight">{"</>"}</span> : <Icon size={24} />}
    </span>
  );
}

const primaryBtn = "inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-5 text-[14px] font-semibold text-paper hover:bg-accent-deep disabled:opacity-60";

function ModuleCard({ m, next, onPractice }: { m: PrepModule; next: NextInterview | null; onPractice: (m: PrepModule) => void }) {
  const research = m.action === "RESEARCH";
  const target = nextLabel(next);
  return (
    <article id={`module-${m.key}`} data-module={m.key} aria-labelledby={`module-title-${m.key}`} className="flex min-w-0 scroll-mt-20 flex-col rounded-xl border border-line bg-paper p-4">
      <div className="flex items-start gap-3">
        <ModuleIcon moduleKey={m.key} />
        <div className="min-w-0 flex-1">
          <h3 id={`module-title-${m.key}`} className="text-[16px] font-bold leading-tight text-ink">
            {m.title}
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-muted">{m.description}</p>
        </div>
        {research ? (
          <Link href={`${BASE}/interviews`} aria-label={`Open ${m.title}`} className="mt-0.5 flex-none text-accent-deep">
            <ChevronRightIcon size={18} />
          </Link>
        ) : (
          <button type="button" aria-label={`Open ${m.title}`} onClick={() => onPractice(m)} className="mt-0.5 flex-none text-accent-deep">
            <ChevronRightIcon size={18} />
          </button>
        )}
      </div>
      <ul aria-label={`${m.title} topics`} data-chips={m.chipsFromProfile ? "profile" : "default"} className="mt-3 flex flex-wrap gap-1.5">
        {m.chips.map((c) => (
          <li key={c} className="rounded-lg border border-line bg-paper-2/60 px-2.5 py-1 text-[12.5px] text-ink-soft">
            {c}
          </li>
        ))}
      </ul>
      {research && target ? (
        <p className="mt-2 text-[12.5px] text-muted">
          Your next interview: {target}
          {next ? `, ${nextWhen(next.scheduledAt)}` : ""}.
        </p>
      ) : null}
      <div className="mt-auto pt-4">
        {research ? (
          <Link href={`${BASE}/interviews`} data-action="research" className={primaryBtn}>
            <FileTextIcon size={16} />
            View Research
          </Link>
        ) : (
          <button type="button" data-action="practice" onClick={() => onPractice(m)} className={primaryBtn}>
            <PlayIcon size={16} />
            Start Practice
          </button>
        )}
      </div>
    </article>
  );
}

function Modules({ view, onPractice }: { view: PrepView; onPractice: (m: PrepModule) => void }) {
  return (
    <Card id="prep-modules" title="Preparation Modules" icon={BookOpenIcon}>
      <p className="-mt-1 mb-3 text-[12.5px] text-muted">Explore targeted resources and practice tools to help you feel confident and prepared.</p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 sm:gap-4">
        {view.modules.map((m) => (
          <ModuleCard key={m.key} m={m} next={view.next} onPractice={onPractice} />
        ))}
      </div>
    </Card>
  );
}

/* ── history ────────────────────────────────────────────────────────────────────────── */

function ScoreRing({ score, size = 42 }: { score: number; size?: number }) {
  return (
    <ProgressRing value={score} tone={scoreTone(score)} size={size} thickness={4} label={`Score ${score} percent`}>
      <span className="text-[11px] font-bold leading-none tabular-nums text-ink">{score}%</span>
    </ProgressRing>
  );
}

const reviewBtn = "inline-flex min-h-8 items-center whitespace-nowrap rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft";
const INITIAL_ROWS = 5;

function History({ view, onReview, onAgain }: { view: PrepView; onReview: (s: SessionRow) => void; onAgain: (s: SessionRow) => void }) {
  const [all, setAll] = useState(false);
  const rows = all ? view.history : view.history.slice(0, INITIAL_ROWS);
  const more = view.history.length > INITIAL_ROWS;
  return (
    <Card
      id="prep-history"
      title="Practice Session History"
      icon={ClockIcon}
      extra={
        more ? (
          <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className="ml-auto flex-none text-[13px] font-semibold text-accent-deep hover:underline">
            {all ? "Show less" : "View All"}
          </button>
        ) : null
      }
      className="scroll-mt-20"
    >
      {view.history.length === 0 ? (
        <Empty>No practice sessions yet. Start a practice above and your self-scored sessions will be listed here.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={cn(TABLE, "min-w-[600px] 2xl:min-w-[760px]")} data-history>
            <thead>
              <tr className="text-left text-[12px] font-semibold text-muted">
                {["Session Title", "Type", "Date", "Score", "Duration", "Actions"].map((c) => (
                  <th key={c} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2.5 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg", c === "Duration" && "hidden 2xl:table-cell")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((s) => {
                const when = sessionWhen(s.occurredAt);
                return (
                  <tr key={s.id} data-session={s.id}>
                    <td className={cn(TD, "min-w-[150px] font-medium")}>{s.title}</td>
                    <td className={TD}>
                      <Pill tone={KIND_TONE[s.kind]}>{KIND_LABEL[s.kind]}</Pill>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-ink-soft")}>
                      <span className="block">{when.date}</span>
                      <span className="block text-[12px] text-muted">{when.time}</span>
                    </td>
                    <td className={TD}>
                      <ScoreRing score={s.score} />
                    </td>
                    <td className={cn(TD, "hidden whitespace-nowrap text-ink-soft 2xl:table-cell")}>{durationText(s.durationMinutes)}</td>
                    <td className={TD}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <button type="button" data-action="review" aria-label={`Review feedback for ${s.title}`} onClick={() => onReview(s)} className={reviewBtn}>
                          Review Feedback
                        </button>
                        <Menu
                          trigger={
                            <button type="button" aria-label={`More actions for ${s.title}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg text-muted hover:bg-paper-2">
                              <MoreVerticalIcon size={16} />
                            </button>
                          }
                          items={[
                            { label: "Review feedback", icon: <FileTextIcon size={15} />, onSelect: () => onReview(s) },
                            { label: s.kind === "COMPANY" ? "Open interviews" : "Practice again", icon: <PlayIcon size={15} />, onSelect: () => onAgain(s) },
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

/* ── the practice sheet ─────────────────────────────────────────────────────────────── */

function PracticeSheet({ module, next, orgId, onClose, onSaved }: { module: PrepModule; next: NextInterview | null; orgId: number; onClose: () => void; onSaved: (d: SessionDetail) => void }) {
  const [startedAt] = useState(() => Date.now());
  const [scores, setScores] = useState<Record<string, number | undefined>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const avg = averageScore(scores);
  const problem = sheetProblem(scores, notes);
  const target = nextLabel(next);

  const save = async () => {
    if (busy || problem) return;
    setBusy(true);
    setError("");
    const res = await saveSession(orgId, {
      moduleKey: module.key,
      durationMinutes: elapsedMinutes(startedAt, Date.now()),
      notes,
      answers: Object.entries(scores)
        .filter((e): e is [string, number] => typeof e[1] === "number")
        .map(([questionId, score]) => ({ questionId, score })),
    });
    setBusy(false);
    if (res.ok && res.value) onSaved(res.value);
    else setError(res.message ?? "That didn't save. Nothing has changed.");
  };

  return (
    <SideSheet
      id="prep-practice-sheet"
      side="right"
      mode="overlay"
      width={520}
      open
      title={module.title}
      description={target ? `Practice for ${target}` : "Self-scored practice"}
      icon={<PlayIcon size={20} />}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[13px] text-muted" data-avg>
            {avg === null ? "Not scored yet" : `Your score: ${avg}%`}
          </span>
          <button type="button" onClick={onClose} className={reviewBtn}>
            Cancel
          </button>
          <button type="button" data-action="save-session" disabled={busy || problem !== null} onClick={() => void save()} className={primaryBtn}>
            {busy ? "Saving..." : "Save session"}
          </button>
        </div>
      }
    >
      <div data-practice={module.key} className="space-y-4">
        <p role="note" className="rounded-xl border border-line bg-accent-soft/50 p-3 text-[13px] leading-snug text-ink-soft">
          Read each question, answer it out loud, then score how well you did from 0 to 100. This is your own self-assessment: AI-scored practice with feedback arrives later. Saving records this session in your history.
        </p>
        <ol className="space-y-4">
          {module.questions.map((q, i) => {
            const v = scores[q.id];
            return (
              <li key={q.id} data-question={q.id} className="rounded-xl border border-line p-3">
                <p id={`q-${q.id}`} className="text-[14px] font-semibold leading-snug text-ink">
                  <span className="mr-1.5 text-muted">{i + 1}.</span>
                  {q.text}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={v ?? 50}
                    aria-labelledby={`q-${q.id}`}
                    aria-valuetext={v === undefined ? "Not scored" : `${v} percent`}
                    onChange={(e) => setScores((s) => ({ ...s, [q.id]: Number(e.target.value) }))}
                    className={cn("h-2 min-w-0 flex-1 cursor-pointer accent-[var(--brand-600)]", v === undefined && "opacity-50")}
                  />
                  <span className={cn("w-16 flex-none text-right text-[13px] font-bold tabular-nums", v === undefined ? "text-muted" : "text-ink")}>{v === undefined ? "Not scored" : `${v}%`}</span>
                </div>
              </li>
            );
          })}
        </ol>
        <label className="block text-[13px] font-semibold text-ink">
          Notes for yourself (optional)
          <Textarea value={notes} maxLength={MAX_NOTES} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="What went well, what to revisit" className="mt-1.5 w-full" />
        </label>
        <p className="text-[12px] text-muted">Please don&apos;t add ID numbers, bank details or birth dates. They are rejected.</p>
        <p role="alert" data-error className={cn("text-[13px] font-medium text-v2-coral-ink", !error && "sr-only")}>
          {error}
        </p>
      </div>
    </SideSheet>
  );
}

/* ── the review sheet ───────────────────────────────────────────────────────────────── */

function ReviewSheet({ row, state, onClose, onRetry }: { row: SessionRow; state: Fetched<SessionDetail> | null; onClose: () => void; onRetry: () => void }) {
  const when = sessionWhen(row.occurredAt);
  const d = state?.kind === "OK" ? state.view : undefined;
  return (
    <SideSheet
      id="prep-review-sheet"
      side="right"
      mode="overlay"
      width={520}
      open
      title={row.title}
      description={`${KIND_LABEL[row.kind]} - ${when.date} ${when.time} - ${durationText(row.durationMinutes)}`}
      icon={<FileTextIcon size={20} />}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className={reviewBtn}>
          Close
        </button>
      }
    >
      <div data-review={row.id} className="space-y-4">
        <div className="flex items-center gap-3">
          <ScoreRing score={row.score} size={56} />
          <p className="text-[13.5px] text-ink-soft">Your self-score for this session.</p>
        </div>
        {state === null ? (
          <div aria-busy="true" className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !d ? (
          <ErrorState what="this session" description="The details didn't load. Nothing has changed." onRetry={onRetry} variant="inline" />
        ) : (
          <>
            {d.answers.length === 0 ? (
              <p className="text-[13px] text-muted">No question-level scores were recorded for this session.</p>
            ) : (
              <ol className="space-y-3" aria-label="Question scores">
                {d.answers.map((a) => (
                  <li key={a.position} data-answer={a.position} className="rounded-xl border border-line p-3">
                    <p className="text-[13.5px] font-semibold leading-snug text-ink">
                      <span className="mr-1.5 text-muted">{a.position}.</span>
                      {a.question}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <span role="img" aria-label={`Scored ${a.score} percent`} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-2">
                        <span className={cn("block h-full rounded-full", scoreTone(a.score) === "green" ? "bg-v2-green-ink" : scoreTone(a.score) === "amber" ? "bg-v2-amber-ink" : "bg-v2-coral-ink")} style={{ width: `${a.score}%` }} />
                      </span>
                      <span className="w-10 flex-none text-right text-[13px] font-bold tabular-nums text-ink">{a.score}%</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <section aria-labelledby="review-notes">
              <h3 id="review-notes" className="text-[14px] font-bold text-ink">
                Your notes
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">{d.notes ?? "You didn't add notes to this session."}</p>
            </section>
          </>
        )}
        <p className="text-[12.5px] text-muted">AI feedback on your answers arrives later. For now this is what you recorded.</p>
      </div>
    </SideSheet>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

/** A rail card whose title wraps instead of truncating. */
function RailCard({ id, title, icon: Icon, tone = "accent", extra, children }: { id: string; title: string; icon: ComponentType<IconProps>; tone?: IconTone; extra?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-home-card={id} className={cn(CARD, "flex min-w-0 flex-col p-4 sm:p-5")}>
      <header className="flex min-h-9 items-center gap-2.5">
        <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-[10px]", TONES[tone])}>
          <Icon size={19} />
        </span>
        <h2 id={id} className="min-w-0 flex-1 text-[16.5px] font-bold leading-tight text-ink">
          {title}
        </h2>
        {extra}
      </header>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

function Checklist({ items, notice, undo, onToggle, onUndo }: { items: CheckItem[]; notice: string; undo: { label: string; checked: boolean } | null; onToggle: (i: CheckItem) => void; onUndo: () => void }) {
  const { done, total } = checklistProgress(items);
  return (
    <RailCard id="prep-checklist" title="Before Interview Checklist" icon={CheckCircleIcon} extra={<span className="flex-none text-[12.5px] font-semibold text-muted" data-progress>{`${done}/${total}`}</span>}>
      <ul aria-label="Before interview checklist" className="divide-y divide-line">
        {items.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              role="checkbox"
              aria-checked={c.checked}
              data-check={c.key}
              onClick={() => onToggle(c)}
              className="flex min-h-10 w-full items-center gap-2.5 py-1.5 text-left text-[13.5px] text-ink hover:bg-paper-2/60"
            >
              {c.checked ? <CheckCircleIcon size={20} className="flex-none text-v2-green-ink" /> : <span aria-hidden className="h-5 w-5 flex-none rounded-full border-2 border-line" />}
              <span className={cn("min-w-0 flex-1", c.checked && "text-ink-soft")}>{c.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" data-check-notice className={cn("mt-2 flex flex-wrap items-center gap-2 text-[12.5px]", notice ? "text-v2-coral-ink" : "text-muted", !notice && !undo && "sr-only")}>
        {notice ? (
          notice
        ) : undo ? (
          <>
            <span>{`${undo.checked ? "Marked done" : "Marked not done"}: ${undo.label}`}</span>
            <button type="button" data-action="undo" onClick={onUndo} className="font-semibold text-accent-deep hover:underline">
              Undo
            </button>
          </>
        ) : null}
      </p>
    </RailCard>
  );
}

function QuickActions({ onReview, onTips }: { onReview: () => void; onTips: () => void }) {
  const tile = "flex min-h-14 min-w-0 items-center gap-2.5 rounded-xl border border-line bg-paper p-2.5 text-left hover:bg-accent-soft/40";
  const items: { key: string; title: string; sub: string; icon: ComponentType<IconProps>; href?: string; onClick?: () => void }[] = [
    { key: "schedule", title: "Schedule a Prep Session", sub: "Book time with your marketer", icon: CalendarIcon, href: `${BASE}/marketer` },
    { key: "ask", title: "Ask My Marketer", sub: "Get personalized guidance", icon: MessageIcon, href: `${BASE}/marketer` },
    { key: "review", title: "Review Feedback", sub: "See past session results", icon: BarChartIcon, onClick: onReview },
    { key: "tips", title: "Interview Tips", sub: "Best practices and resources", icon: LightbulbIcon, onClick: onTips },
  ];
  return (
    <RailCard id="prep-quick" title="Quick Actions" icon={ZapIcon} tone="violet">
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {items.map((q) => {
          const Icon = q.icon;
          const body = (
            <>
              <Icon size={22} className="flex-none text-accent-deep" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold leading-tight text-ink">{q.title}</span>
                <span className="mt-0.5 block text-[11.5px] leading-tight text-muted">{q.sub}</span>
              </span>
            </>
          );
          return (
            <li key={q.key} className="min-w-0">
              {q.href ? (
                <Link href={q.href} data-quick={q.key} className={tile}>
                  {body}
                </Link>
              ) : (
                <button type="button" data-quick={q.key} onClick={q.onClick} className={cn(tile, "w-full")}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </RailCard>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface InterviewPrepPageProps {
  orgId: number;
  firstName: string;
}

type ReviewState = { row: SessionRow; result: Fetched<SessionDetail> | null } | null;

export default function ConsultantInterviewPrepPage({ orgId, firstName: first }: InterviewPrepPageProps) {
  const router = useRouter();
  const { view, status, reload, setView } = useWorkspaceData(useCallback(() => fetchPrep(orgId), [orgId]));
  const loading = status === "loading";
  const [practice, setPractice] = useState<PrepModule | null>(null);
  const [review, setReview] = useState<ReviewState>(null);
  const [banner, setBanner] = useState("");
  const [checkNotice, setCheckNotice] = useState("");
  const [undo, setUndo] = useState<{ key: string; label: string; checked: boolean } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (undoTimer.current && clearTimeout(undoTimer.current)), []);

  const openReview = useCallback(
    (row: SessionRow) => {
      setReview({ row, result: null });
      void fetchSession(orgId, row.id).then((result) => setReview((r) => (r && r.row.id === row.id ? { row, result } : r)));
    },
    [orgId],
  );

  const applyCheck = useCallback(
    async (key: string, checked: boolean): Promise<boolean> => {
      setView((v) => (v ? { ...v, checklist: withChecked(v.checklist, key, checked) } : v));
      const res = await setChecked(orgId, key, checked);
      if (!res.ok) {
        setView((v) => (v ? { ...v, checklist: withChecked(v.checklist, key, !checked) } : v));
        setCheckNotice(res.message ?? "That didn't save. Nothing has changed.");
      }
      return res.ok;
    },
    [orgId, setView],
  );

  const toggle = (item: CheckItem) => {
    const next = !item.checked;
    setCheckNotice("");
    if (undoTimer.current) clearTimeout(undoTimer.current);
    void applyCheck(item.key, next).then((ok) => {
      if (!ok) return;
      setUndo({ key: item.key, label: item.label, checked: next });
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
    });
  };

  const undoLast = () => {
    if (!undo) return;
    const { key, checked } = undo;
    setUndo(null);
    setCheckNotice("");
    void applyCheck(key, !checked);
  };

  const again = (s: SessionRow) => {
    if (!view) return;
    const m = view.modules.find((x) => x.key === KIND_MODULE[s.kind]);
    if (!m || m.action === "RESEARCH") router.push(`${BASE}/interviews`);
    else setPractice(m);
  };

  const toHistory = () => document.getElementById("prep-history")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  const toTechnical = () => {
    const el = document.getElementById("module-technical");
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLButtonElement>("[data-action='practice']")?.focus();
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-interview-prep data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Interview Prep" subtitle="Prepare with curated resources, practice questions, and personalized guidance to help you succeed in your upcoming interviews." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your interview prep" description="Your interview prep didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <>
          <section aria-label="Key numbers" data-prep-tiles className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {TILE_SPECS.map((s, i) => (
              <Tile key={s.key} spec={s} view={loading ? null : view} index={i} />
            ))}
          </section>
          <p role="status" aria-live="polite" data-banner className={cn("text-[13px] font-medium text-v2-green-ink", !banner && "sr-only")}>
            {banner}
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.36fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
              {view ? (
                <>
                  <Modules view={view} onPractice={setPractice} />
                  <History view={view} onReview={openReview} onAgain={again} />
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
                title="Your interview companion, here to help!"
                body="Get personalized interview tips, practice questions, feedback on your answers, and guidance from your marketer. I'm here to help you feel confident and ace your interviews!"
              />
              {view ? (
                <>
                  <Checklist items={view.checklist} notice={checkNotice} undo={undo} onToggle={toggle} onUndo={undoLast} />
                  <QuickActions onReview={toHistory} onTips={toTechnical} />
                </>
              ) : null}
            </div>
          </div>
        </>
      )}

      {practice ? (
        <PracticeSheet
          key={practice.key}
          module={practice}
          next={view?.next ?? null}
          orgId={orgId}
          onClose={() => setPractice(null)}
          onSaved={(d) => {
            setPractice(null);
            setBanner(`Session saved: ${d.session.title}, ${d.session.score}%.`);
            void reload();
          }}
        />
      ) : null}
      {review ? <ReviewSheet row={review.row} state={review.result} onClose={() => setReview(null)} onRetry={() => openReview(review.row)} /> : null}
    </div>
  );
}

