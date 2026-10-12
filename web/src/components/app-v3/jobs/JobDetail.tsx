"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { BookmarkIcon, BookmarkOutlineIcon, BottomSheet, EyeOffIcon, ErrorState, ExternalLinkIcon, Skeleton, SideSheet, cn } from "@kiwiply/ui";
import { CompanyTile, KebabMenu } from "@/components/app-v2/common";
import { JobTag, MatchBadge } from "@/components/app-v2/jobs/JobBits";
import { jobMeta, jobTags, postedAgo, getJob, type JobCard, type JobDetailData } from "@/lib/jobs";
import { usePhone } from "../resume-builder/usePhone";

const PANEL_WIDTH = 520; // config-literal-ok: layout width of the side panel, not a tunable

export interface JobDetailProps {
  /** The posting's id, or null when closed. */
  id: number | null;
  /** The list row it was opened from: its title and company show while the full detail loads. */
  seed: JobCard | null;
  onClose(): void;
  onSave(job: JobCard): void;
  onHide(job: JobCard, signal: "HIDE" | "HIDE_COMPANY"): void;
  /** Open another posting (a similar job) in the same panel. */
  onOpenJob(id: number): void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * One job in full (U4.3): a right-hand panel on a desktop, a bottom sheet on a phone. The description is the board's
 * own plain text (never rendered as HTML), Apply opens the employer's page in a new tab (nothing here ever submits), and
 * Save / Hide act on the list behind it. A posting that was tracked and has since been taken down says so, with the
 * link it had.
 */
export default function JobDetail(props: JobDetailProps) {
  const { id, seed, onClose, returnFocusTo } = props;
  const phone = usePhone();
  const title = seed?.title ?? "Job";
  const description = seed?.company;
  const body = id === null ? null : <DetailBody key={id} {...props} id={id} />;
  return phone ? (
    <BottomSheet id="job-detail" open={id !== null} title={title} description={description} onClose={onClose} returnFocusTo={returnFocusTo}>
      {body}
    </BottomSheet>
  ) : (
    <SideSheet id="job-detail" side="right" mode="overlay" width={PANEL_WIDTH} open={id !== null} title={title} description={description} onClose={onClose} returnFocusTo={returnFocusTo}>
      {body}
    </SideSheet>
  );
}

type Loaded = { kind: "ok"; data: JobDetailData } | { kind: "gone" } | { kind: "error"; message: string };

function DetailBody({ id, seed, onSave, onHide, onOpenJob }: JobDetailProps & { id: number }) {
  const [state, setState] = useState<{ id: number; attempt: number; value: Loaded } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    void getJob(id).then((r) => {
      if (!live) return;
      if (r.kind === "ok") setState({ id, attempt, value: { kind: "ok", data: r.data } });
      else if (r.status === 410) setState({ id, attempt, value: { kind: "gone" } });
      else setState({ id, attempt, value: { kind: "error", message: r.message } });
    });
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const loaded = state && state.id === id && state.attempt === attempt ? state.value : null;
  const card = loaded?.kind === "ok" ? loaded.data.card : seed;

  if (loaded?.kind === "gone") {
    return (
      <div className="p-5">
        <ErrorState variant="inline" what="this job" title="No longer listed" description="The company took this posting down. Anything you saved from it is still on your board." />
      </div>
    );
  }
  if (loaded?.kind === "error") {
    return (
      <div className="p-5">
        <ErrorState variant="inline" what="this job" description={loaded.message} onRetry={() => setAttempt((a) => a + 1)} />
      </div>
    );
  }
  if (!card) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading job" className="space-y-3 p-5">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const data = loaded?.kind === "ok" ? loaded.data : null;
  const applyUrl = data ? (data.applyUrl ?? data.url) : null;
  const actionCls = "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[14.5px] font-bold transition-[filter] hover:brightness-95";

  return (
    <article data-job-detail={card.id} className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <CompanyTile name={card.company} size={52} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-display text-[18px] font-bold! leading-snug tracking-normal! text-ink">{card.title}</h2>
          <p className="mt-0.5 break-words text-[13.5px] text-ink-soft">{jobMeta(card)}</p>
          <p className="mt-1 text-[12.5px] text-v2-muted">Posted {postedAgo(card.publishedAt, now)}</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {card.match && <MatchBadge score={card.match.score} />}
        {jobTags(card).map((t) => (
          <JobTag key={t}>{t}</JobTag>
        ))}
      </div>
      {card.match?.reason && <p className="rounded-xl bg-v2-green-soft px-3 py-2 text-[13px] text-v2-green-ink">{card.match.reason}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {applyUrl ? (
          <a href={applyUrl} target="_blank" rel="noopener noreferrer" className={cn(actionCls, "min-w-0 flex-1 bg-v2-lime text-v2-navy sm:flex-none")}>
            Apply{card.source?.label ? ` on ${card.source.label}` : ""}
            <ExternalLinkIcon size={15} aria-hidden />
          </a>
        ) : (
          <span className={cn(actionCls, "flex-1 cursor-not-allowed bg-v2-lime text-v2-navy opacity-50 sm:flex-none")} aria-disabled="true">
            Apply
          </span>
        )}
        <button
          type="button"
          onClick={() => !card.saved && onSave(card)}
          aria-pressed={card.saved}
          className={cn(actionCls, "border border-v2-line bg-paper text-ink hover:bg-paper-2", card.saved && "cursor-default text-v2-green-ink")}
        >
          {card.saved ? <BookmarkIcon size={17} /> : <BookmarkOutlineIcon size={17} />}
          {card.saved ? "Saved" : "Save"}
        </button>
        <KebabMenu
          label={`More actions for ${card.title}`}
          items={[
            { label: "Hide this job", onSelect: () => onHide(card, "HIDE") },
            { label: `Hide ${card.company}`, danger: true, onSelect: () => onHide(card, "HIDE_COMPANY") },
          ]}
        />
      </div>
      <p className="flex items-center gap-1.5 text-[12px] text-v2-muted">
        <EyeOffIcon size={13} aria-hidden />
        Apply opens the company's own page. Kiwiply never applies for you.
      </p>

      {!data ? (
        <div role="status" aria-busy="true" aria-label="Loading description" className="space-y-2">
          <Skeleton className="h-4 w-1/3 rounded" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <>
          <section aria-label="Description" className="space-y-2">
            {data.descriptionText ? (
              data.descriptionText
                .split(/\n{2,}/)
                .filter((p) => p.trim())
                .map((p, i) => (
                  <p key={i} className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink-soft">
                    {p}
                  </p>
                ))
            ) : (
              <p className="text-[13.5px] text-v2-muted">The company did not include a description. Open the posting to read it there.</p>
            )}
          </section>

          {data.companyJobsCount > 0 && (
            <p className="text-[13px] text-ink-soft">
              {data.companyJobsCount === 1 ? "1 other job" : `${data.companyJobsCount} other jobs`} at {card.company}.
            </p>
          )}

          {data.similar.length > 0 && (
            <section aria-label="Similar jobs" className="border-t border-v2-line/70 pt-3">
              <h3 className="mb-2 font-display text-[14.5px] font-bold! tracking-normal! text-ink">Similar jobs</h3>
              <ul className="divide-y divide-v2-line/60">
                {data.similar.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => onOpenJob(s.id)} className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:bg-paper-2/60">
                      <CompanyTile name={s.company} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold text-ink">{s.title}</span>
                        <span className="block truncate text-[12.5px] text-v2-muted">{jobMeta(s)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </article>
  );
}
