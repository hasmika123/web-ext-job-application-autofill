"use client";

import type { ReactNode } from "react";
import { Button, ErrorState, ExternalLinkIcon, ShieldCheckIcon, TimelineFeed, buttonVariants, cn } from "@kiwiply/ui";
import type { TimelineEvent } from "@kiwiply/ui";
import { relativeTime } from "@/lib/ent/dashboard";
import { safePostingUrl, type ConAction, type ConOpportunityDTO } from "@/lib/ent/consultant-ws/opportunities";
import { CardSkeleton, JobChips, PriorityChip, SourceBadge, StateChip, dueInfo, shortDate } from "../parts";

/** What the detail view can ask of the page. Every one maps to a button the API listed in `allowedActions`. */
export interface DetailHandlers {
  onOpenPosting: (o: ConOpportunityDTO) => void;
  onInterest: (o: ConOpportunityDTO) => void;
  onDecline: (o: ConOpportunityDTO) => void;
  onAsk: (o: ConOpportunityDTO) => void;
  onApplied: (o: ConOpportunityDTO) => void;
  onLink: (o: ConOpportunityDTO) => void;
  onUnlink: (o: ConOpportunityDTO) => void;
}

export const APPLIED_COPY = "Our extension tracks applications on supported job sites automatically; on others (e.g. LinkedIn Easy Apply) press I applied after you submit.";
export const NEVER_APPLIES_COPY = "Dossier never applies for you. You read the posting and press submit yourself, so every application is truthfully yours.";

const SECTION = "rounded-[var(--radius-lg)] border border-line bg-paper p-3.5";
const H3 = "text-[12.5px] font-bold uppercase tracking-wide text-ink-soft";

function Section({ title, children, ...rest }: { title: string; children: ReactNode } & Record<`data-${string}`, string>) {
  return (
    <section aria-label={title} className={SECTION} {...rest}>
      <h3 className={H3}>{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** The posting link: ALWAYS drawn when the row has a usable URL, opens the source site in a new tab and never gets the opener. */
export function PostingLink({ o, onOpen, className }: { o: ConOpportunityDTO; onOpen: () => void; className?: string }) {
  const href = safePostingUrl(o.job.jobUrl);
  if (!href) return <span className="text-[12.5px] text-muted">The posting link is missing. Ask your marketer for it.</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" data-open-posting onClick={onOpen} className={buttonVariants("accent", "sm", cn("min-h-11 sm:min-h-0", className))}>
      Open job posting <ExternalLinkIcon size={15} aria-hidden />
    </a>
  );
}

/** The buttons, drawn ONLY from `allowedActions[]` (plus the always-present posting link). */
export function ActionBar({ o, h, busy, className }: { o: ConOpportunityDTO; h: DetailHandlers; busy: boolean; className?: string }) {
  const can = (a: ConAction) => o.allowedActions.includes(a);
  const btn = (action: ConAction, label: string, onClick: () => void, variant: "ghost" | "accent-soft" | "primary" = "ghost") =>
    can(action) ? (
      <Button key={action} variant={variant} size="sm" disabled={busy} onClick={onClick} data-action={action} className="min-h-11 sm:min-h-0">
        {label}
      </Button>
    ) : null;
  return (
    <div data-action-bar className={cn("flex flex-wrap items-center gap-2", className)}>
      <PostingLink o={o} onOpen={() => h.onOpenPosting(o)} />
      {btn("APPLIED", "I applied", () => h.onApplied(o), "primary")}
      {btn("INTEREST", "Interested", () => h.onInterest(o), "accent-soft")}
      {btn("REQUEST_INFO", "Ask a question", () => h.onAsk(o))}
      {btn("LINK", "Link my application", () => h.onLink(o))}
      {btn("UNLINK", "Unlink application", () => h.onUnlink(o))}
      {btn("DECLINE", "Decline", () => h.onDecline(o))}
    </div>
  );
}

function infoThread(o: ConOpportunityDTO): ReactNode {
  if (!o.infoRequest) return null;
  return (
    <Section title="Your question" data-con-section="info">
      <div className="flex flex-col gap-2 text-[13.5px]">
        <p className="rounded-xl bg-paper-2 px-3 py-2 text-ink"><span className="mb-0.5 block text-[12px] font-semibold text-ink-soft">You asked</span>{o.infoRequest}</p>
        {o.infoAnswer ? (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-ink"><span className="mb-0.5 block text-[12px] font-semibold text-accent-deep">{o.assignedBy.name || "Your marketer"} answered</span>{o.infoAnswer}</p>
        ) : (
          <p className="text-[12.5px] text-muted">Waiting for {o.assignedBy.name || "your marketer"} to answer.</p>
        )}
      </div>
    </Section>
  );
}

/** Everything known about one assigned job. All text is rendered as React text: a marketer's note can never inject markup. */
/** `showTitle` is false inside the slide-over, whose own header already carries the job title and company. */
export function DetailBody({ o, h, busy, now, showTitle = true }: { o: ConOpportunityDTO; h: DetailHandlers; busy: boolean; now: number; showTitle?: boolean }) {
  const j = o.job;
  const due = dueInfo(o.dueOn, now);
  const events: TimelineEvent[] = o.timeline.map((t) => ({ id: t.id, at: t.at, source: "pipeline_event", title: t.text, actor: t.actor ? { name: t.actor } : undefined }));
  return (
    <div data-con-detail={o.id} className="flex flex-col gap-3.5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StateChip state={o.state} />
          <PriorityChip priority={o.priority} />
          {due ? <span data-due className={cn("text-[12.5px] font-semibold", due.overdue && o.state !== "APPLIED" ? "text-v2-coral-ink" : "text-ink-soft")}>{due.overdue && o.state !== "APPLIED" ? "Was due" : "Due"} {due.text}</span> : null}
        </div>
        {showTitle ? (
          <>
            <h2 className="text-[20px] font-extrabold leading-tight text-ink">{j.title || "Untitled job"}</h2>
            <p className="text-[14px] text-ink-soft">{[j.company, j.location].filter(Boolean).join(" · ")}</p>
          </>
        ) : null}
        <JobChips job={j} pay={false} />
      </header>

      <ActionBar o={o} h={h} busy={busy} />
      {o.allowedActions.includes("APPLIED") ? <p data-applied-copy className="text-[12.5px] leading-snug text-ink-soft">{APPLIED_COPY}</p> : null}

      <Section title="Employment details" data-con-section="employment">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
          <dt className="text-muted">Work mode</dt><dd className="text-ink">{j.workMode ? { REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "On-site" }[j.workMode] : "Not stated"}</dd>
          <dt className="text-muted">Type</dt><dd className="text-ink">{j.employmentType || "Not stated"}</dd>
          <dt className="text-muted">Location</dt><dd className="text-ink">{j.location || "Not stated"}</dd>
          {j.postedOn ? (<><dt className="text-muted">Posted</dt><dd className="text-ink">{shortDate(j.postedOn)}</dd></>) : null}
        </dl>
      </Section>

      <Section title="Pay" data-con-section="pay">
        <p className="text-[14px] font-semibold text-ink">{j.payLabel || <span className="font-normal text-muted">Not stated on the posting</span>}</p>
      </Section>

      {j.skills.length > 0 ? (
        <Section title="Skills" data-con-section="skills">
          <ul className="flex flex-wrap gap-1.5">
            {j.skills.map((s) => (
              <li key={s} className="rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-medium text-accent-deep">{s}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={`Note from ${o.assignedBy.name || "your marketer"}`} data-con-section="note">
        <p className="whitespace-pre-wrap text-[14px] leading-snug text-ink">{o.marketerNote || <span className="text-muted">No note on this one.</span>}</p>
        <p className="mt-2 text-[12px] text-muted">
          {o.assignedBy.name ? `Assigned by ${o.assignedBy.name}` : "Assigned"}
          {o.assignedAt ? ` ${relativeTime(o.assignedAt, now)}` : ""}
        </p>
      </Section>

      {infoThread(o)}

      <Section title="Source and posting" data-con-section="source">
        <div className="flex flex-col gap-2 text-[13.5px]">
          <SourceBadge atsPlatform={j.atsPlatform} />
          <p className="break-all text-ink-soft">{safePostingUrl(j.jobUrl) ?? "No posting link"}</p>
          <p className="text-[12px] text-muted">The full description is on the source site, so you always read the latest version.</p>
        </div>
      </Section>

      <aside data-never-applies className="flex items-start gap-2.5 rounded-[var(--radius-lg)] bg-accent-soft p-3.5 text-[13px] leading-snug text-accent-deep">
        <ShieldCheckIcon size={18} aria-hidden className="mt-0.5 flex-none" />
        <div>
          <p className="font-bold">Why Dossier never applies for you</p>
          <p className="mt-0.5">{NEVER_APPLIES_COPY}</p>
        </div>
      </aside>

      {events.length > 0 ? (
        <Section title="Timeline" data-con-section="timeline">
          <TimelineFeed events={events} />
        </Section>
      ) : null}
    </div>
  );
}

/** What the detail shows while the row is loading, missing or failed. */
export function DetailStatus({ kind, onRetry, onBack }: { kind: "loading" | "notfound" | "failed"; onRetry: () => void; onBack: () => void }) {
  if (kind === "loading") return <CardSkeleton rows={5} />;
  if (kind === "notfound")
    return (
      <div role="status" data-con-detail-missing className="flex flex-col items-start gap-3 py-4">
        <p className="text-[14px] text-ink">This opportunity isn&apos;t available. It may have been withdrawn, or it isn&apos;t yours.</p>
        <Button variant="ghost" size="sm" onClick={onBack}>Back to Assigned Opportunities</Button>
      </div>
    );
  return <ErrorState what="this opportunity" description="It didn't load. Nothing has changed." onRetry={onRetry} variant="inline" />;
}
