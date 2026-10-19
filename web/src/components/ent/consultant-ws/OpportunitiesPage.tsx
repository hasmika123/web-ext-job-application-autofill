"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  BriefcaseIcon,
  Button,
  CheckIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Dialog,
  ErrorState,
  FileTextIcon,
  HelpCircleIcon,
  Menu,
  MoreVerticalIcon,
  SendIcon,
  SideSheet,
  Skeleton,
  StarIcon,
  Textarea,
  UsersIcon,
  XCircleIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import { BASE, Card, CompanyMark, Empty, Pill, TABLE, TD, useWorkspaceData } from "./parts";
import JobLinkButton, { QuickInfo } from "./JobLinkButton";
import ConsultantMatchesPage from "./MatchesPage";
import JobDiscoveryPage from "./JobDiscoveryPage";
import { PageTabs, useUrlTab } from "./tabs";
import { PrepareBar, PrepareCheck, PrepareConfirmDialog, PrepareProgress, PrepareWhy, usePrepareBatch, type PrepareUi } from "./PrepareBatch";
import { APPLY_HELPER } from "@/lib/ent/consultant-ws/jobSource";
import { employmentLabel, initialsOf, placeLabel, scoreText, shortDate } from "@/lib/ent/consultant-ws/home";
import {
  PRIORITY_LABEL,
  SORT_OPTIONS,
  STATUS_LABEL,
  actionTarget,
  can,
  canRespond,
  daysLeftText,
  decline,
  dueUrgent,
  expressInterest,
  fetchDetail,
  fetchOpportunities,
  markApplied,
  needMoreInfo,
  nextSteps,
  rateText,
  reopen,
  requestResumeUpdate,
  type Fetched,
  type OppDetail,
  type OppRow,
  type OppView,
  type SortKey,
  type WriteResult,
} from "@/lib/ent/consultant-ws/opportunities";

/**
 * Consultant Assigned Opportunities (design/enterprise-consultant/opportunities.webp): one call to `GET /api/orgs/{orgId}/me-workspace/opportunities`
 * draws the page for the signed-in consultant's OWN assigned jobs (the API sorts and pages). The writes (Express Interest, Need More Info, Decline
 * with undo, I applied, Request Resume Update) only record the consultant's answer for the marketer: nothing is applied for, submitted or sent anywhere.
 * The answer is ONE record the marketer's Opportunities board reads too, so the marketer's answer to a question shows up in the details here. The buttons
 * come from the row's `allowedActions`. `/w/consultant/opportunities/{matchId}` opens the same page with that job's details open.
 * Priority and due date are the marketer's inputs; where none is stored the API derives them and the row says so.
 */

/* ── pieces ─────────────────────────────────────────────────────────────────────────── */

const Dot = () => <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-current" />;

function StatusPill({ row }: { row: Pick<OppRow, "status"> & { interestSent?: boolean; infoAnswered?: boolean } }) {
  // an opportunity you already answered is not "New" any more (the audit saw New beside Interest sent); a question your marketer answered is "Answered"
  const s =
    row.status === "NEW" && row.interestSent
      ? { label: "Interested", tone: STATUS_LABEL.NEW.tone }
      : row.status === "AWAITING_RESPONSE" && row.infoAnswered
        ? { label: "Answered", tone: "green" as const }
        : STATUS_LABEL[row.status];
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
      <span className={cn("block text-[12px]", dueUrgent(row) ? "font-semibold text-v2-coral-ink" : "text-muted")}>{canRespond(row) ? daysLeftText(row.daysLeft) : STATUS_LABEL[row.status].label}</span>
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
  applied: (r: OppRow) => void;
}

function RowMenu({ row, a }: { row: OppRow; a: Actions }) {
  return (
    <Menu
      trigger={
        <button type="button" aria-label={`More actions for ${row.title}`} className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-line bg-paper text-muted hover:bg-paper-2">
          <MoreVerticalIcon size={16} />
        </button>
      }
      items={[
        { label: row.interestSent ? "Interest sent" : "Express Interest", icon: <SendIcon size={15} />, disabled: !can(row, "INTEREST"), onSelect: () => a.interest(row) },
        { label: "Request Resume Update", icon: <FileTextIcon size={15} />, disabled: !can(row, "RESUME_UPDATE"), onSelect: () => a.resume(row) },
        { label: "Need More Info", icon: <HelpCircleIcon size={15} />, disabled: !can(row, "REQUEST_INFO"), onSelect: () => a.askInfo(row) },
        { label: "I applied", icon: <CheckIcon size={15} />, disabled: !can(row, "APPLIED"), onSelect: () => a.applied(row) },
        { separator: true },
        row.status === "DECLINED"
          ? { label: "Reopen", icon: <ChevronRightIcon size={15} />, disabled: !can(row, "REOPEN"), onSelect: () => a.reopen(row) }
          : { label: "Decline Opportunity", icon: <XCircleIcon size={15} />, danger: true, disabled: !can(row, "DECLINE"), onSelect: () => a.decline(row) },
      ]}
    />
  );
}

type ChipKey = "all" | "needs" | "interested" | "review" | "declined";
const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs", label: "Needs response" },
  { key: "interested", label: "Interested" },
  { key: "review", label: "In review" },
  { key: "declined", label: "Declined" },
];
const CHIP_TEST: Record<ChipKey, (r: OppRow) => boolean> = {
  all: () => true,
  needs: (r) => (r.status === "NEW" || r.status === "AWAITING_RESPONSE") && !r.interestSent,
  interested: (r) => r.interestSent && canRespond(r),
  review: (r) => r.status === "IN_REVIEW",
  declined: (r) => r.status === "DECLINED",
};

function ChipRow({ view, filter, setFilter }: { view: OppView; filter: ChipKey; setFilter: (k: ChipKey) => void }) {
  return (
    <div role="group" aria-label="Filter opportunities" data-opps-chips className="mb-3 flex flex-wrap gap-2">
      {CHIPS.map((c) => {
        const n = c.key === "all" ? Math.max(view.total, view.rows.length) : view.rows.filter(CHIP_TEST[c.key]).length;
        const on = filter === c.key;
        return (
          <button
            key={c.key}
            type="button"
            data-chip={c.key}
            aria-pressed={on}
            onClick={() => setFilter(c.key)}
            className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold", on ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink hover:bg-paper-2")}
          >
            {c.label}
            <span className="tabular-nums text-muted">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

function OpportunitiesTable({ view, sort, setSort, selected, a, notice, prepare, filter, setFilter }: { view: OppView; sort: SortKey; setSort: (s: SortKey) => void; selected: number | null; a: Actions; notice: string; prepare: PrepareUi; filter: ChipKey; setFilter: (k: ChipKey) => void }) {
  const rows = view.rows.filter(CHIP_TEST[filter]);
  return (
    <Card
      id="opps-list"
      title="Assigned opportunities"
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
      <ChipRow view={view} filter={filter} setFilter={setFilter} />
      <p role="status" aria-live="polite" data-notice className={cn("mb-2 text-[12.5px] font-medium text-v2-coral-ink", !notice && "sr-only")}>
        {notice}
      </p>
      <PrepareBar p={prepare} />
      {view.rows.length === 0 ? (
        <Empty>No opportunities are assigned to you yet. When your marketer assigns an opening, it shows up here for you to respond to.</Empty>
      ) : rows.length === 0 ? (
        <Empty>Nothing in this filter.</Empty>
      ) : (
        <div className="relative overflow-x-auto">
          <table className={cn(TABLE, "min-w-[560px] 2xl:min-w-[760px]")}>
            <thead>
              <tr className="text-left text-[12px] font-semibold text-muted">
                {prepare.active ? (
                  <th scope="col" className="w-8 bg-paper-2/60 px-2 py-2 first:rounded-l-lg">
                    <span className="sr-only">Select to prepare</span>
                  </th>
                ) : null}
                {["Job title", "Company", "Location", "Marketer", "Status", "Priority", "Due date", ""].map((c, i) => (
                  <th
                    key={`${c}-${i}`}
                    scope="col"
                    title={c === "Priority" || c === "Due date" ? "Priority and due date come from your marketer; where none is set they are worked out from the match score and the assignment date." : undefined}
                    className={cn("whitespace-nowrap bg-paper-2/60 px-2 py-2 font-semibold first:rounded-l-lg last:rounded-r-lg", (c === "Marketer" || c === "Location") && "hidden 2xl:table-cell")}
                  >
                    {c || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.matchId} data-opp={r.matchId} aria-selected={selected === r.matchId} className={cn(selected === r.matchId && "bg-accent-soft/40")}>
                  {prepare.active ? (
                    <td className={cn(TD, "w-8")}>
                      <PrepareCheck row={r} p={prepare} />
                    </td>
                  ) : null}
                  <td className={cn(TD, "max-w-[190px]")}>
                    <span className="block font-semibold text-ink">{r.title}</span>
                    {r.skills.length ? <span className="block truncate text-[12px] text-muted">{r.skills.slice(0, 3).join(" | ")}</span> : null}
                    {prepare.active ? <PrepareWhy row={r} p={prepare} /> : null}
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5">
                      <CompanyMark name={r.company} />
                      <span className="min-w-0 break-words">{r.company ?? "-"}</span>
                    </span>
                  </td>
                  <td className={cn(TD, "hidden text-ink-soft 2xl:table-cell")}>
                    <span className="block">{placeLabel(r.location, r.workMode)}</span>
                    {r.workMode && r.location ? <span className="block text-[12px] text-muted">{r.workMode.charAt(0) + r.workMode.slice(1).toLowerCase()}</span> : null}
                  </td>
                  <td className={cn(TD, "hidden 2xl:table-cell")}>
                    <MarketerCell name={r.marketer} />
                  </td>
                  <td className={TD}>
                    <StatusPill row={r} />
                    {r.interestSent && canRespond(r) ? <span className="mt-1 block text-[11.5px] text-muted">Interest sent</span> : null}
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
                      <JobLinkButton title={r.title} source={r} variant="ghost" className="!min-h-8" />
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
                <Button size="sm" variant="accent" disabled={!can(row, "INTEREST")} onClick={() => a.interest(row)}>
                  {row.interestSent ? "Interest sent" : "Express Interest"}
                </Button>
                <Button size="sm" variant="ghost" disabled={!can(row, "REQUEST_INFO")} onClick={() => a.askInfo(row)}>
                  Need More Info
                </Button>
                {can(row, "APPLIED") ? (
                  <Button size="sm" variant="ghost" onClick={() => a.applied(row)}>
                    I applied
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" disabled={!can(row, "DECLINE")} onClick={() => a.decline(row)}>
                  Decline
                </Button>
              </>
            ) : row.status === "DECLINED" ? (
              <Button size="sm" variant="ghost" disabled={!can(row, "REOPEN")} onClick={() => a.reopen(row)}>
                Reopen
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {!row ? null : (
        <div data-detail={row.matchId} className="space-y-5 text-[13.5px] text-ink">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill row={row} />
            <PriorityPill row={row} />
            <span className="rounded-full bg-v2-green-soft px-2.5 py-0.5 text-[12px] font-bold text-v2-green-ink">{row.score > 0 ? `${scoreText(row.score)} match` : "Not scored"}</span>
          </div>
          <div className="space-y-2">
            <QuickInfo source={row} />
            <div className="flex flex-wrap items-center gap-2">
              <JobLinkButton title={row.title} source={row} />
            </div>
            <p data-apply-helper className="text-[12.5px] text-muted">
              {APPLY_HELPER}
            </p>
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
                  <h4 className={head}>Marketer&apos;s job notes</h4>
                  <p className="mt-1 whitespace-pre-line leading-relaxed text-ink-soft">{d.description}</p>
                  <p className="mt-1 text-[12px] text-muted">These are your marketer&apos;s notes, not the full posting. Read the full posting on the source site.</p>
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
                <section data-info-thread>
                  <h4 className={head}>Your question for your marketer</h4>
                  <p className="mt-1 text-ink-soft">{d.infoRequest}</p>
                  {d.infoAnswer ? (
                    <div data-info-answer className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-ink">
                      <span className="mb-0.5 block text-[12px] font-semibold text-accent-deep">{row.marketer ?? "Your marketer"} answered</span>
                      {d.infoAnswer}
                    </div>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-muted">Waiting for {row.marketer ?? "your marketer"} to answer.</p>
                  )}
                </section>
              ) : null}
              {d.appliedAt ? (
                <section data-applied-note>
                  <h4 className={head}>You applied</h4>
                  <p className="mt-1 text-ink-soft">You told your marketer you applied on {shortDate(d.appliedAt)}. Nothing is applied for you: you submit on the source site yourself.</p>
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

/* ── "I applied" confirmation ───────────────────────────────────────────────────────────── */

function AppliedDialog({ row, busy, onCancel, onConfirm }: { row: OppRow | null; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog
      open={row !== null}
      onClose={onCancel}
      title={row ? `I applied: ${row.title}` : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Not yet
          </Button>
          <Button variant="accent" size="sm" disabled={busy} onClick={onConfirm}>
            Yes, I applied
          </Button>
        </>
      }
    >
      <p data-applied-confirm className="text-[13.5px] text-ink-soft">
        Did you submit this application yourself on the source site? This only tells your marketer. No one applies or submits for you.
      </p>
    </Dialog>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

const STEP_ICON: Record<string, ComponentType<IconProps>> = { respond: ClipboardCheckIcon, resume: FileTextIcon, interviews: CalendarIcon, marketer: UsersIcon };

function NextSteps({ view }: { view: OppView }) {
  const steps = nextSteps(view.nextSteps, BASE);
  return (
    <Card id="opps-steps" title="Next steps" icon={StarIcon} tone="amber">
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

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface OpportunitiesPageProps {
  orgId: number;
  firstName: string;
  /** The match id when the URL is `/w/consultant/opportunities/{matchId}`: that job's details open on arrival. */
  initialOpenId?: number | null;
}

type DetailState = { id: number; result: Fetched<OppDetail> } | null;

const NO_ROWS: readonly OppRow[] = [];

function AssignedOpportunities({ orgId, initialOpenId = null }: OpportunitiesPageProps) {
  const toast = useToast();
  const [sort, setSort] = useState<SortKey>("due");
  const { view, status, reload } = useWorkspaceData(useCallback(() => fetchOpportunities(orgId, sort), [orgId, sort]));
  const [filter, setFilter] = useState<ChipKey>("all");
  const prepare = usePrepareBatch(orgId, view?.rows ?? NO_ROWS, view !== null);
  const [picked, setPicked] = useState<number | null>(null);
  const [sheetId, setSheetId] = useState<number | null>(initialOpenId);
  const [state, setState] = useState<DetailState>(null);
  const [applying, setApplying] = useState<OppRow | null>(null);
  const [ask, setAsk] = useState<{ kind: TextKind; row: OppRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const target = useMemo(() => (view ? actionTarget(view.rows, picked) : null), [view, picked]);
  const loadDetail = useCallback(
    (id: number) => {
      void fetchDetail(orgId, id).then((result) => setState({ id, result }));
    },
    [orgId],
  );

  // a deep link (`/w/consultant/opportunities/{matchId}`) opens that job's details once
  useEffect(() => {
    if (initialOpenId !== null) loadDetail(initialOpenId);
  }, [initialOpenId, loadDetail]);

  const loaded = state && state.id === sheetId ? state.result : null;
  // the row from the page, else the one the detail came with (a job beyond the first page)
  const sheetRow = sheetId === null ? null : ((view?.rows.find((r) => r.matchId === sheetId) ?? (loaded?.kind === "OK" ? loaded.view?.row : null)) ?? null);

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
    applied: (r) => {
      setNotice("");
      setPicked(r.matchId);
      setApplying(r);
    },
  };

  const confirmApplied = async () => {
    if (!applying) return;
    const row = applying;
    setBusy(true);
    const res = await markApplied(orgId, row.matchId);
    setBusy(false);
    setApplying(null);
    done(res, "Marked as applied. Your marketer can see it.", row);
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

  const detail = loaded;
  const missing = initialOpenId !== null && detail?.kind === "DENIED" && sheetId === initialOpenId;

  return (
    <div data-consultant-opportunities data-status={status} className="flex flex-col gap-4 sm:gap-5">

      {status === "failed" ? (
        <ErrorState what="your opportunities" description="Your opportunities didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.34fr)]">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
            {view ? (
              <>
                <PrepareProgress p={prepare} />
                <OpportunitiesTable view={view} sort={sort} setSort={setSort} selected={target?.matchId ?? null} a={actions} notice={notice} prepare={prepare} filter={filter} setFilter={setFilter} />
              </>
            ) : (
              <div className="grid gap-4" aria-busy="true">
                <Skeleton className="h-72 w-full" />
              </div>
            )}
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)]">
            {view ? <NextSteps view={view} /> : null}
          </div>
        </div>
      )}

      {missing ? (
        <div role="status" data-con-detail-missing className="rounded-[var(--radius-lg)] border border-line bg-paper p-4 text-[13.5px] text-ink">
          This opportunity isn&apos;t available. It may have been withdrawn, or it isn&apos;t yours.
        </div>
      ) : null}
      <DetailSheet row={sheetRow} detail={detail} loading={detail === null} onClose={() => setSheetId(null)} a={actions} />
      <PrepareConfirmDialog p={prepare} rows={view?.rows ?? NO_ROWS} />
      <AppliedDialog row={applying} busy={busy} onCancel={() => setApplying(null)} onConfirm={() => void confirmApplied()} />
      <TextDialog key={ask ? `${ask.kind}-${ask.row.matchId}` : "none"} ask={ask} busy={busy} error={error} onCancel={() => setAsk(null)} onSend={(t) => void send(t)} />
    </div>
  );
}

/* ── the page: Assigned | Matches | Browse ──────────────────────────────────────────── */

const TABS = ["assigned", "matches", "browse"] as const;
const TAB_LABELS = [
  { value: "assigned", label: "Assigned" },
  { value: "matches", label: "Matches" },
  { value: "browse", label: "Browse" },
] as const;

/**
 * Consultant Opportunities (UI refresh Phase 1, s6): the assigned list (the Autopilot "Prepare selected" demo lives here), the matches and the
 * browse search as three tabs of one page, chosen by `?tab=matches|browse` (Assigned is the default and leaves the address bare).
 */
export default function ConsultantOpportunitiesPage(props: OpportunitiesPageProps) {
  const [tab, setTab] = useUrlTab(TABS, "assigned", `${BASE}/opportunities`);
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Opportunities" subtitle="Openings your marketer assigned or matched to you. Open the link, apply with the extension, keep your marketer posted." />
      <PageTabs label="Opportunities views" tabs={TAB_LABELS} value={tab} onChange={setTab} />
      {tab === "matches" ? <ConsultantMatchesPage orgId={props.orgId} /> : tab === "browse" ? <JobDiscoveryPage orgId={props.orgId} /> : <AssignedOpportunities {...props} />}
    </div>
  );
}
