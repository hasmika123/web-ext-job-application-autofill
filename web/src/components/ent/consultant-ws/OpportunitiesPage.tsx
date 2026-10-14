"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ComponentType } from "react";
import {
  BriefcaseIcon,
  Button,
  CalendarIcon,
  ClipboardCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  Dialog,
  ErrorState,
  FileTextIcon,
  HelpCircleIcon,
  Menu,
  MoreVerticalIcon,
  SendIcon,
  SideSheet,
  Skeleton,
  Sparkline,
  StarIcon,
  Textarea,
  UsersIcon,
  XCircleIcon,
  XIcon,
  chartColor,
  cn,
  useToast,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, Card, CompanyMark, Empty, Pill, SampleMark, TABLE, TD, useWorkspaceData } from "./parts";
import { deltaText, employmentLabel, firstName, initialsOf, placeLabel, shortDate } from "@/lib/ent/consultant-ws/home";
import {
  PRIORITY_LABEL,
  SORT_OPTIONS,
  STATUS_LABEL,
  actionTarget,
  canRespond,
  daysLeftText,
  decline,
  dueUrgent,
  expressInterest,
  fetchDetail,
  fetchOpportunities,
  needMoreInfo,
  nextSteps,
  rateText,
  reopen,
  requestResumeUpdate,
  type Fetched,
  type OppDetail,
  type OppRow,
  type OppTile,
  type OppView,
  type SortKey,
  type WriteResult,
} from "@/lib/ent/consultant-ws/opportunities";

/**
 * Consultant Assigned Opportunities (design/enterprise-consultant/opportunities.webp): one call to `GET /api/orgs/{orgId}/me-workspace/opportunities`
 * draws the page for the signed-in consultant's OWN assigned jobs (the API sorts and pages). The writes (Express Interest, Need More Info, Decline
 * with undo, Request Resume Update) only record the consultant's answer for the marketer: nothing is applied for, submitted or sent anywhere.
 * Priority and due date are the marketer's inputs; where none is stored the API derives them and the row says so.
 */

/* ── tiles ──────────────────────────────────────────────────────────────────────────── */

interface TileSpec {
  key: keyof OppView["tiles"];
  title: string;
  icon: ComponentType<IconProps>;
  tone: IconTone;
}
const TILE_SPECS: TileSpec[] = [
  { key: "total", title: "Total Assigned Opportunities", icon: BriefcaseIcon, tone: "accent" },
  { key: "high", title: "High Priority", icon: StarIcon, tone: "amber" },
  { key: "awaiting", title: "Awaiting Response", icon: ClockIcon, tone: "accent" },
  { key: "inReview", title: "In Review", icon: UsersIcon, tone: "violet" },
  { key: "declined", title: "Declined", icon: XCircleIcon, tone: "coral" },
];

function Tile({ spec, tile, index }: { spec: TileSpec; tile: OppTile | null; index: number }) {
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
                  <span>vs last month</span>
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

/* ── pieces ─────────────────────────────────────────────────────────────────────────── */

const Dot = () => <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-current" />;

function StatusPill({ row }: { row: Pick<OppRow, "status"> }) {
  const s = STATUS_LABEL[row.status];
  return (
    <Pill tone={s.tone} className="whitespace-normal py-0.5 leading-tight">
      <Dot />
      {s.label}
    </Pill>
  );
}

function PriorityPill({ row }: { row: Pick<OppRow, "priority" | "priorityDerived"> }) {
  const p = PRIORITY_LABEL[row.priority];
  return (
    <span title={row.priorityDerived ? "Set from the match score: your marketer has not set a priority" : "Set by your marketer"}>
      <Pill tone={p.tone}>
        <Dot />
        {p.label}
      </Pill>
    </span>
  );
}

function DueCell({ row }: { row: Pick<OppRow, "dueOn" | "daysLeft" | "status" | "dueDerived"> }) {
  return (
    <span className="block whitespace-nowrap" title={row.dueDerived ? "No due date set by your marketer: 14 days after the assignment" : "Set by your marketer"}>
      <span className="block font-semibold text-ink">{shortDate(row.dueOn) || "-"}</span>
      <span className={cn("block text-[12px]", dueUrgent(row) ? "font-semibold text-v2-coral-ink" : "text-muted")}>{row.status === "DECLINED" ? "Declined" : daysLeftText(row.daysLeft)}</span>
    </span>
  );
}

function MarketerCell({ name }: { name: string | null }) {
  if (!name) return <span className="text-muted" title="No marketer is assigned to this opportunity">-</span>;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-deep">
        {initialsOf(name)}
      </span>
      {name}
    </span>
  );
}

/* ── the table ──────────────────────────────────────────────────────────────────────── */

interface Actions {
  open: (r: OppRow) => void;
  interest: (r: OppRow) => void;
  askInfo: (r: OppRow) => void;
  decline: (r: OppRow) => void;
  resume: (r: OppRow) => void;
  reopen: (r: OppRow) => void;
}

function RowMenu({ row, a }: { row: OppRow; a: Actions }) {
  const off = !canRespond(row);
  return (
    <Menu
      trigger={
        <button type="button" aria-label={`More actions for ${row.title}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-line bg-paper text-muted hover:bg-paper-2">
          <MoreVerticalIcon size={16} />
        </button>
      }
      items={[
        { label: row.interestSent ? "Interest sent" : "Express Interest", icon: <SendIcon size={15} />, disabled: off || row.interestSent, onSelect: () => a.interest(row) },
        { label: "Request Resume Update", icon: <FileTextIcon size={15} />, disabled: off, onSelect: () => a.resume(row) },
        { label: "Need More Info", icon: <HelpCircleIcon size={15} />, disabled: off, onSelect: () => a.askInfo(row) },
        { separator: true },
        off ? { label: "Reopen", icon: <ChevronRightIcon size={15} />, onSelect: () => a.reopen(row) } : { label: "Decline Opportunity", icon: <XCircleIcon size={15} />, danger: true, onSelect: () => a.decline(row) },
      ]}
    />
  );
}

function OpportunitiesTable({ view, sort, setSort, selected, a, notice }: { view: OppView; sort: SortKey; setSort: (s: SortKey) => void; selected: number | null; a: Actions; notice: string }) {
  return (
    <Card
      id="opps-list"
      title="My Assigned Opportunities"
      icon={BriefcaseIcon}
      extra={
        <label className="ml-auto flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
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
      }
    >
      <p className="-mt-1 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
        Priority and due date come from your marketer; where none is set they are worked out from the match score and the assignment date.
        <SampleMark />
      </p>
      <p role="status" aria-live="polite" data-notice className={cn("mb-2 text-[12.5px] font-medium text-v2-coral-ink", !notice && "sr-only")}>
        {notice}
      </p>
      {view.rows.length === 0 ? (
        <Empty>No opportunities are assigned to you yet. When your marketer assigns a job, it shows up here for you to respond to.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className={cn(TABLE, "min-w-[760px]")}>
            <thead>
              <tr className="text-left text-[12px] font-semibold text-muted">
                {["Job Title", "Company", "Location", "Marketer", "Status", "Priority", "Due Date", "Actions"].map((c) => (
                  <th key={c} scope="col" className={cn("whitespace-nowrap bg-paper-2/60 px-2 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg", c === "Marketer" && "hidden 2xl:table-cell")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.rows.map((r) => (
                <tr key={r.matchId} data-opp={r.matchId} aria-selected={selected === r.matchId} className={cn(selected === r.matchId && "bg-accent-soft/40")}>
                  <td className={cn(TD, "max-w-[190px]")}>
                    <span className="block font-semibold text-ink">{r.title}</span>
                    {r.skills.length ? <span className="block truncate text-[12px] text-muted">{r.skills.slice(0, 3).join(" | ")}</span> : null}
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5">
                      <CompanyMark name={r.company} />
                      <span className="min-w-0 break-words">{r.company ?? "-"}</span>
                    </span>
                  </td>
                  <td className={cn(TD, "text-ink-soft")}>
                    <span className="block">{placeLabel(r.location, r.workMode)}</span>
                    {r.workMode && r.location ? <span className="block text-[12px] text-muted">{r.workMode.charAt(0) + r.workMode.slice(1).toLowerCase()}</span> : null}
                  </td>
                  <td className={cn(TD, "hidden 2xl:table-cell")}>
                    <MarketerCell name={r.marketer} />
                  </td>
                  <td className={TD}>
                    <StatusPill row={r} />
                    {r.interestSent ? <span className="mt-1 block text-[11.5px] text-muted">Interest sent</span> : null}
                  </td>
                  <td className={TD}>
                    <PriorityPill row={r} />
                  </td>
                  <td className={TD}>
                    <DueCell row={r} />
                  </td>
                  <td className={TD}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <button type="button" data-action="view" aria-label={`View ${r.title}`} onClick={() => a.open(r)} className="inline-flex min-h-8 items-center whitespace-nowrap rounded-lg border border-line bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft">
                        View
                      </button>
                      <RowMenu row={r} a={a} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view.total > view.rows.length ? <p className="mt-2 text-[12px] text-muted">Showing {view.rows.length} of {view.total} opportunities.</p> : null}
    </Card>
  );
}

/* ── the detail side sheet ──────────────────────────────────────────────────────────── */

function DetailSheet({ row, detail, loading, onClose, a }: { row: OppRow | null; detail: Fetched<OppDetail> | null; loading: boolean; onClose: () => void; a: Actions }) {
  const d = detail?.kind === "OK" ? detail.view : null;
  const head = "text-[12px] font-bold uppercase tracking-wide text-muted";
  const rate = d ? rateText(d) : null;
  return (
    <SideSheet
      id="opps-detail-sheet"
      side="right"
      mode="overlay"
      width={520}
      open={row !== null}
      title={row?.title ?? "Opportunity"}
      description={row ? [row.company, placeLabel(row.location, row.workMode)].filter(Boolean).join(" - ") : undefined}
      icon={<BriefcaseIcon size={20} />}
      onClose={onClose}
      footer={
        row ? (
          <div className="flex flex-wrap gap-2">
            {canRespond(row) ? (
              <>
                <Button size="sm" variant="accent" disabled={row.interestSent} onClick={() => a.interest(row)}>
                  {row.interestSent ? "Interest sent" : "Express Interest"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => a.askInfo(row)}>
                  Need More Info
                </Button>
                <Button size="sm" variant="ghost" onClick={() => a.decline(row)}>
                  Decline
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => a.reopen(row)}>
                Reopen
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {!row ? null : (
        <div data-detail={row.matchId} className="space-y-5 text-[13.5px] text-ink">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill row={row} />
            <PriorityPill row={row} />
            <span className="rounded-full bg-v2-green-soft px-2.5 py-0.5 text-[12px] font-bold text-v2-green-ink">{row.score}% match</span>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className={head}>Due</dt>
              <dd className="mt-1">
                <DueCell row={row} />
              </dd>
            </div>
            <div>
              <dt className={head}>Marketer</dt>
              <dd className="mt-1">
                <MarketerCell name={row.marketer} />
              </dd>
            </div>
          </dl>
          {loading || !detail ? (
            <div aria-busy="true" className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !d ? (
            <ErrorState what="this opportunity" description="The details didn't load. Nothing has changed." variant="inline" />
          ) : (
            <>
              {d.description ? (
                <section>
                  <h4 className={head}>Description</h4>
                  <p className="mt-1 whitespace-pre-line leading-relaxed text-ink-soft">{d.description}</p>
                </section>
              ) : null}
              <section>
                <h4 className={head}>Skills</h4>
                {d.skills.length === 0 ? (
                  <p className="mt-1 text-muted">This job doesn&apos;t list skills yet.</p>
                ) : (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.skills.map((s) => (
                      <li key={s.skill} data-skill={s.skill} data-present={s.present} className={cn("rounded-md px-2 py-0.5 text-[12.5px]", s.present ? "bg-v2-green-soft text-v2-green-ink" : "bg-paper-2 text-ink")}>
                        {s.skill}
                        <span className="sr-only">{s.present ? " (on your profile)" : " (not on your profile)"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h4 className={head}>Role</h4>
                <p className="mt-1 text-ink-soft">{[employmentLabel(d.employment), d.duration, rate ?? "Rate not listed"].filter(Boolean).join(" | ")}</p>
              </section>
              {d.reason ? (
                <section>
                  <h4 className={head}>Why you were matched</h4>
                  <p className="mt-1 text-ink-soft">{d.reason}</p>
                </section>
              ) : null}
              {d.declineReason ? (
                <section>
                  <h4 className={head}>Your reason for declining</h4>
                  <p className="mt-1 text-ink-soft">{d.declineReason}</p>
                </section>
              ) : null}
              {d.infoRequest ? (
                <section>
                  <h4 className={head}>Your question for your marketer</h4>
                  <p className="mt-1 text-ink-soft">{d.infoRequest}</p>
                </section>
              ) : null}
              {d.resumeUpdateNote ? (
                <section>
                  <h4 className={head}>Your resume update request</h4>
                  <p className="mt-1 text-ink-soft">{d.resumeUpdateNote}</p>
                </section>
              ) : null}
              <section>
                <h4 className={head}>Timeline</h4>
                <ol className="mt-1.5 space-y-2 border-l border-line pl-3.5">
                  {d.timeline.map((t) => (
                    <li key={t.key} data-timeline={t.key} className="text-[13px]">
                      <span className="block font-medium text-ink">{t.label}</span>
                      <span className="block text-[12px] text-muted">{shortDate(t.at)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>
      )}
    </SideSheet>
  );
}

/* ── the text dialog (need more info, decline, resume update) ───────────────────────── */

type TextKind = "info" | "decline" | "resume";
const TEXT_SPEC: Record<TextKind, { title: string; label: string; cta: string; required: boolean; hint: string }> = {
  info: { title: "Need more info", label: "What would you like to know?", cta: "Send question", required: true, hint: "Your marketer sees this question. Please leave out ID numbers and birth dates." },
  decline: { title: "Decline opportunity", label: "Why is it not a fit?", cta: "Decline", required: true, hint: "Your marketer sees this reason. You can undo right after." },
  resume: { title: "Request resume update", label: "What should change on your resume? (optional)", cta: "Send request", required: false, hint: "A note for your marketer. Nothing is sent to an employer." },
};

function TextDialog({ ask, busy, error, onCancel, onSend }: { ask: { kind: TextKind; row: OppRow } | null; busy: boolean; error: string; onCancel: () => void; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const spec = ask ? TEXT_SPEC[ask.kind] : null;
  const len = text.trim().length;
  const valid = len <= 300 && (spec?.required ? len >= 3 : len === 0 || len >= 3);
  return (
    <Dialog
      open={ask !== null}
      onClose={onCancel}
      title={spec ? `${spec.title}: ${ask?.row.title}` : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={ask?.kind === "decline" ? "danger" : "accent"} size="sm" disabled={busy || !valid} onClick={() => onSend(text.trim())}>
            {spec?.cta}
          </Button>
        </>
      }
    >
      {spec ? (
        <div className="space-y-2">
          <label className="block text-[13px] font-semibold text-ink" htmlFor="opps-text">
            {spec.label}
          </label>
          <Textarea id="opps-text" rows={4} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} aria-describedby="opps-text-hint" />
          <p id="opps-text-hint" className="text-[12px] text-muted">
            {spec.hint} {len}/300
          </p>
          {error ? (
            <p role="alert" className="text-[12.5px] font-medium text-v2-coral-ink">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

const STEP_ICON: Record<string, ComponentType<IconProps>> = { respond: ClipboardCheckIcon, resume: FileTextIcon, interviews: CalendarIcon, marketer: UsersIcon };

function NextSteps({ view }: { view: OppView }) {
  const steps = nextSteps(view.nextSteps, BASE);
  return (
    <Card id="opps-steps" title="Recommended Next Steps" icon={StarIcon} tone="amber">
      <ul className="space-y-1">
        {steps.map((s) => {
          const Icon = STEP_ICON[s.key];
          const body = (
            <>
              <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-accent-soft text-accent-deep">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-tight text-ink">{s.title}</span>
                <span className="block text-[12px] leading-snug text-muted">{s.text}</span>
              </span>
              {s.href ? <ChevronRightIcon size={15} className="flex-none text-muted" /> : null}
            </>
          );
          return (
            <li key={s.key} data-step={s.key}>
              {s.href ? (
                <Link href={s.href} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-paper-2">
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-2.5 p-1.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function QuickActions({ target, a }: { target: OppRow | null; a: Actions }) {
  const off = !target || !canRespond(target);
  const items: { key: string; title: string; sub: string; icon: ComponentType<IconProps>; disabled: boolean; run: () => void; danger?: boolean }[] = [
    { key: "interest", title: "Express Interest", sub: "Let your marketer know", icon: SendIcon, disabled: off || !!target?.interestSent, run: () => target && a.interest(target) },
    { key: "resume", title: "Request Resume Update", sub: "Update for a specific role", icon: FileTextIcon, disabled: off, run: () => target && a.resume(target) },
    { key: "info", title: "Need More Info", sub: "Ask questions about the role", icon: HelpCircleIcon, disabled: off, run: () => target && a.askInfo(target) },
    { key: "decline", title: "Decline Opportunity", sub: "Not a good fit for now", icon: XIcon, disabled: off, danger: true, run: () => target && a.decline(target) },
  ];
  return (
    <Card id="opps-quick" title="Quick Actions" icon={SendIcon}>
      <p className="-mt-1 mb-2 text-[12px] text-muted" data-quick-target>
        {target ? `Acts on: ${target.title}` : "Nothing to act on yet."}
      </p>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {items.map((i) => (
          <button
            key={i.key}
            type="button"
            data-quick={i.key}
            disabled={i.disabled}
            onClick={i.run}
            className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-paper p-2 text-left hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-lg", i.danger ? "bg-v2-coral-soft text-v2-coral-ink" : "bg-accent-soft text-accent-deep")}>
              <i.icon size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold leading-tight text-ink">{i.title}</span>
              <span className="block text-[11px] leading-snug text-muted">{i.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface OpportunitiesPageProps {
  orgId: number;
  firstName: string;
}

type DetailState = { id: number; result: Fetched<OppDetail> } | null;

export default function ConsultantOpportunitiesPage({ orgId, firstName: first }: OpportunitiesPageProps) {
  const toast = useToast();
  const [sort, setSort] = useState<SortKey>("due");
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchOpportunities(orgId, sort), [orgId, sort]));
  const loading = status === "loading";
  const [picked, setPicked] = useState<number | null>(null);
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [state, setState] = useState<DetailState>(null);
  const [ask, setAsk] = useState<{ kind: TextKind; row: OppRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const target = useMemo(() => (view ? actionTarget(view.rows, picked) : null), [view, picked]);
  const sheetRow = view && sheetId !== null ? (view.rows.find((r) => r.matchId === sheetId) ?? null) : null;

  const loadDetail = useCallback(
    (id: number) => {
      void fetchDetail(orgId, id).then((result) => setState({ id, result }));
    },
    [orgId],
  );

  const done = (res: WriteResult, success: string, row: OppRow, undo?: () => void) => {
    if (res.ok) {
      toast({ title: success, variant: "success", ...(undo ? { action: { label: "Undo", onClick: undo } } : {}) });
      void reload();
      if (sheetId === row.matchId) loadDetail(row.matchId);
    } else setNotice(res.message ?? "That didn't go through. Nothing has changed.");
    return res.ok;
  };

  const actions: Actions = {
    open: (r) => {
      setPicked(r.matchId);
      setSheetId(r.matchId);
      setState(null);
      loadDetail(r.matchId);
    },
    interest: (r) => {
      setNotice("");
      setPicked(r.matchId);
      void expressInterest(orgId, r.matchId).then((res) => done(res, "Interest sent to your marketer", r));
    },
    askInfo: (r) => {
      setError("");
      setPicked(r.matchId);
      setAsk({ kind: "info", row: r });
    },
    decline: (r) => {
      setError("");
      setPicked(r.matchId);
      setAsk({ kind: "decline", row: r });
    },
    resume: (r) => {
      setError("");
      setPicked(r.matchId);
      setAsk({ kind: "resume", row: r });
    },
    reopen: (r) => {
      setNotice("");
      void reopen(orgId, r.matchId).then((res) => done(res, "Opportunity reopened", r));
    },
  };

  const send = async (text: string) => {
    if (!ask) return;
    const { kind, row } = ask;
    setBusy(true);
    setError("");
    const res = kind === "info" ? await needMoreInfo(orgId, row.matchId, text) : kind === "decline" ? await decline(orgId, row.matchId, text) : await requestResumeUpdate(orgId, row.matchId, text || undefined);
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? "That didn't go through. Nothing has changed.");
      return;
    }
    setAsk(null);
    const msg = kind === "info" ? "Question sent to your marketer" : kind === "decline" ? "Opportunity declined" : "Resume update requested";
    done(res, msg, row, kind === "decline" ? () => void reopen(orgId, row.matchId).then((u) => done(u, "Decline undone", row)) : undefined);
  };

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const detail = state && state.id === sheetId ? state.result : null;

  return (
    <div data-consultant-opportunities data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Assigned Opportunities" subtitle="Opportunities assigned to you by your marketer. Review the details, take action, and keep your marketer updated." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your opportunities" description="Your opportunities didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.34fr)]">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
            <section aria-label="Key numbers" data-opps-tiles className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 2xl:grid-cols-5">
              {TILE_SPECS.map((s, i) => (
                <Tile key={s.key} spec={s} tile={loading || !view ? null : view.tiles[s.key]} index={i} />
              ))}
            </section>
            {view ? (
              <OpportunitiesTable view={view} sort={sort} setSort={setSort} selected={target?.matchId ?? null} a={actions} notice={notice} />
            ) : (
              <div className="grid gap-4" aria-busy="true">
                <Skeleton className="h-72 w-full" />
              </div>
            )}
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)]">
            <BeeCard name={firstName(first)} title="Your career companion, here to help!" body="Review your assigned opportunities, get insights, and take the right actions to move your career forward. I'm here to answer questions and help you make the best decisions." />
            {view ? (
              <>
                <NextSteps view={view} />
                <QuickActions target={target} a={actions} />
              </>
            ) : null}
          </div>
        </div>
      )}

      <DetailSheet row={sheetRow} detail={detail} loading={detail === null} onClose={() => setSheetId(null)} a={actions} />
      <TextDialog key={ask ? `${ask.kind}-${ask.row.matchId}` : "none"} ask={ask} busy={busy} error={error} onCancel={() => setAsk(null)} onSend={(t) => void send(t)} />
    </div>
  );
}

