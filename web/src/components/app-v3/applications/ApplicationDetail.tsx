"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  ArchiveIcon,
  BottomSheet,
  Button,
  ConfettiBurst,
  EmptyState,
  ErrorState,
  ExternalLinkIcon,
  IconButton,
  RestoreIcon,
  SideSheet,
  Skeleton,
  StarIcon,
  Tooltip,
  buttonVariants,
  cn,
  useToast,
} from "@kiwiply/ui";
import { CompanyTile, StatusChip, UnderlineTabs } from "@/components/app-v2/common";
import {
  getApplication,
  patchApplication,
  statusLabel,
  statusTone,
  type Application,
  type ApplicationDetailData,
  type ApplicationPatch,
  type ApplicationStatus,
} from "@/lib/applications";
import { undoToast } from "@/lib/undo-toast";
import { usePhone } from "../resume-builder/usePhone";
import EmailsTab from "./EmailsTab";
import InterviewTab from "./InterviewTab";
import NextStepCard, { OfferOutcome } from "./NextStepCard";
import NotesTab from "./NotesTab";
import ResumeTab from "./ResumeTab";
import StatusPicker from "./StatusPicker";
import TimelineTab from "./TimelineTab";

type TabId = "timeline" | "notes" | "emails" | "resume" | "interview";

/** The width of the desktop side panel (px): wide enough for the interview form's two-column grid. */
const PANEL_WIDTH = 560; // config-literal-ok: layout width of the side panel, not a tunable

export interface ApplicationDetailProps {
  /** The application to show; null closes the sheet. */
  id: number | null;
  /** The list row for it, so the header paints before the detail arrives. */
  seed?: Application | null;
  isPro: boolean;
  onClose(): void;
  /** A field of this application changed: the list row follows without a refetch. */
  onRow(id: number, patch: Partial<Application>): void;
  /** The change moved the tab counts or the row's place in the list: refetch the list. */
  onStale(): void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * The application detail (U6.3): a right-hand panel on a desktop, a bottom sheet on a phone. Header with the
 * status picker (undoable), next step, and Timeline / Notes / Emails / Resume / Interview tabs. Everything on it
 * saves as you go; changes show up in the list behind it straight away.
 */
export default function ApplicationDetail(props: ApplicationDetailProps) {
  const { id, seed, onClose, returnFocusTo } = props;
  const phone = usePhone();
  // The sheet's own title follows the application: the list row while the detail loads, then what arrived.
  const [meta, setMeta] = useState<{ id: number; roleTitle: string; company: string } | null>(null);
  const known = seed ?? (meta && meta.id === id ? meta : null);
  const title = known?.roleTitle ?? "Application";
  const description = known?.company;
  const body = id === null ? null : <DetailBody key={id} {...props} id={id} onMeta={setMeta} />;
  return phone ? (
    <BottomSheet id="application-detail" open={id !== null} title={title} description={description} onClose={onClose} returnFocusTo={returnFocusTo}>
      {body}
    </BottomSheet>
  ) : (
    <SideSheet id="application-detail" side="right" mode="overlay" width={PANEL_WIDTH} open={id !== null} title={title} description={description} onClose={onClose} returnFocusTo={returnFocusTo}>
      {body}
    </SideSheet>
  );
}

function DetailBody({ id, seed, isPro, onRow, onStale, onMeta }: ApplicationDetailProps & { id: number; onMeta(m: { id: number; roleTitle: string; company: string }): void }) {
  const toast = useToast();
  const [detail, setDetail] = useState<ApplicationDetailData | null>(null);
  const [failure, setFailure] = useState<{ status?: number; message: string } | null>(null);
  const [tab, setTab] = useState<TabId>("timeline");
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set(["timeline"]));
  const [celebrate, setCelebrate] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);

  // Load (and reload on Retry).
  useEffect(() => {
    let live = true;
    void getApplication(id).then((r) => {
      if (!live) return;
      setNow(Date.now());
      if (r.kind === "ok") {
        setDetail(r.data);
        setFailure(null);
        onMeta({ id, roleTitle: r.data.roleTitle, company: r.data.company });
      } else setFailure({ status: r.status, message: r.message });
    });
    return () => {
      live = false;
    };
  }, [id, attempt, onMeta]);

  const app: Application | null = detail ?? seed ?? null;

  /** Fold a change into the sheet and the list row behind it. */
  const merge = useCallback(
    (patch: Partial<Application>) => {
      setDetail((d) => (d ? { ...d, ...patch } : d));
      onRow(id, patch);
    },
    [id, onRow],
  );

  /** Re-read the timeline and the derived fields after a change (notes and interviews keep their own state). */
  const refreshEvents = useCallback(() => {
    void getApplication(id).then((r) => {
      if (r.kind !== "ok") return;
      setNow(Date.now());
      setDetail((d) =>
        d
          ? { ...d, events: r.data.events, nextStep: r.data.nextStep, ghosted: r.data.ghosted, lastEventAt: r.data.lastEventAt, suggestions: r.data.suggestions }
          : r.data,
      );
      onRow(id, { nextStep: r.data.nextStep ?? null, ghosted: r.data.ghosted ?? null, lastEventAt: r.data.lastEventAt });
    });
  }, [id, onRow]);

  /** PATCH with an optimistic edit; on refusal the edit is rolled back and the reason toasted. */
  async function patch(change: ApplicationPatch, optimistic: Partial<Application>, rollback: Partial<Application>, failTitle: string): Promise<boolean> {
    merge(optimistic);
    const r = await patchApplication(id, change);
    if (r.kind === "ok") {
      merge({ updatedAt: r.data.updatedAt, appliedAt: r.data.appliedAt, outcome: r.data.outcome ?? null, acceptedAt: r.data.acceptedAt ?? null });
      refreshEvents();
      onStale();
      return true;
    }
    merge(rollback);
    toast({ title: failTitle, description: r.message, variant: "error" });
    return false;
  }

  async function changeStatus(to: ApplicationStatus) {
    if (!app || busy.current) return;
    busy.current = true;
    const from = app.status as ApplicationStatus;
    const ok = await patch({ status: to }, { status: to }, { status: from }, "Couldn't change the status");
    busy.current = false;
    if (!ok) return;
    if (to === "OFFER") setCelebrate((n) => n + 1);
    undoToast(toast, {
      title: to === "OFFER" ? "An offer! Congrats 🎉" : `Moved to ${statusLabel(to)}`,
      description: to === "OFFER" ? "Moved to Offer" : undefined,
      onUndo: () => void patch({ status: from }, { status: from }, { status: to }, "Couldn't undo that"),
    });
  }

  async function pickOutcome(next: "ACCEPTED" | "DECLINED" | null) {
    if (!app) return;
    const before = (app.outcome ?? null) as "ACCEPTED" | "DECLINED" | null;
    const ok = await patch({ outcome: next }, { outcome: next }, { outcome: before }, "Couldn't save that");
    if (!ok) return;
    if (next === "ACCEPTED") setCelebrate((n) => n + 1);
    undoToast(toast, {
      title: next === "ACCEPTED" ? "You accepted! Go celebrate 🎉" : next === "DECLINED" ? "Marked as declined" : "Back to deciding",
      onUndo: () => void patch({ outcome: before }, { outcome: before }, { outcome: next }, "Couldn't undo that"),
    });
  }

  async function toggleArchive() {
    if (!app) return;
    const to = !app.archived;
    const ok = await patch({ archived: to }, { archived: to }, { archived: !to }, to ? "Couldn't archive that" : "Couldn't restore that");
    if (!ok) return;
    undoToast(toast, {
      title: to ? "Application archived" : "Application restored",
      onUndo: () => void patch({ archived: !to }, { archived: !to }, { archived: to }, "Couldn't undo that"),
    });
  }

  async function toggleStar() {
    if (!app) return;
    const to = !app.starred;
    await patch({ starred: to }, { starred: to }, { starred: !to }, "Couldn't update the star");
  }

  function go(next: string) {
    setTab(next as TabId);
    setVisited((v) => (v.has(next as TabId) ? v : new Set(v).add(next as TabId)));
  }

  if (failure && !detail) {
    return failure.status === 404 ? (
      <EmptyState variant="inline" title="This application isn't here anymore" description="It may have been removed. Head back to your list." className="py-10" />
    ) : (
      <ErrorState variant="inline" what="this application" description={failure.message} onRetry={() => { setFailure(null); setAttempt((n) => n + 1); }} />
    );
  }

  const counts = {
    notes: detail?.notesCount ?? detail?.notes.length,
    emails: detail?.mailCount ?? undefined,
    interview: detail?.interviewsCount ?? detail?.interviews.length,
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-1 sm:px-5" data-application-detail={id}>
      {app && (
        <header className="relative flex flex-col gap-3">
          {celebrate > 0 && <ConfettiBurst key={celebrate} />}
          <div className="flex items-start gap-3">
            <CompanyTile name={app.company} size={44} />
            <div className="min-w-0 flex-1">
              {/* The sheet's title already says the role and the company; this line adds where and what kind. */}
              <p className="break-words text-[13px] text-ink-soft">
                {[app.location, app.salary].filter(Boolean).join(" · ") || "Details not captured"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusChip tone={statusTone(app.status)} dot>
                  {statusLabel(app.status)}
                </StatusChip>
                {app.archived && <StatusChip tone="slate">Archived</StatusChip>}
                {app.ghosted && <StatusChip tone="amber">Gone quiet</StatusChip>}
              </div>
            </div>
            <Tooltip content={app.starred ? "Remove star" : "Star this application"}>
              <IconButton
                aria-label={app.starred ? "Remove star" : "Star this application"}
                aria-pressed={!!app.starred}
                onClick={() => void toggleStar()}
                className={cn("h-10 w-10 flex-none sm:h-9 sm:w-9", app.starred && "text-v2-amber")}
              >
                <StarIcon aria-hidden className={cn("h-5 w-5", app.starred && "fill-current")} />
              </IconButton>
            </Tooltip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {app.jobUrl && (
              <a href={app.jobUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants("ghost", "sm"), "min-h-10 gap-1.5")}>
                <ExternalLinkIcon aria-hidden className="h-3.5 w-3.5" />
                Open posting
              </a>
            )}
            <Button size="sm" variant="ghost" onClick={() => void toggleArchive()} className="min-h-10 gap-1.5">
              {app.archived ? <RestoreIcon aria-hidden className="h-3.5 w-3.5" /> : <ArchiveIcon aria-hidden className="h-3.5 w-3.5" />}
              {app.archived ? "Restore" : "Archive"}
            </Button>
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-v2-muted">Where does this stand?</p>
            <StatusPicker value={app.status} onPick={(s) => void changeStatus(s)} />
          </div>
        </header>
      )}

      {!detail ? (
        <div role="status" aria-busy="true" aria-label="Loading application" className="flex flex-col gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-9 rounded-xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : (
        <>
          {detail.status === "OFFER" && <OfferOutcome outcome={detail.outcome} onPick={(o) => void pickOutcome(o)} />}
          <NextStepCard app={detail} onPatched={merge} />

          <UnderlineTabs
            padded
            counts="pill"
            ariaLabel="Application sections"
            value={tab}
            onChange={go}
            className="-mx-4 px-2 sm:-mx-5 sm:px-3"
            tabs={[
              { id: "timeline", label: "Timeline" },
              { id: "notes", label: "Notes", count: counts.notes || undefined },
              { id: "emails", label: "Emails", count: counts.emails || undefined },
              { id: "resume", label: "Resume" },
              { id: "interview", label: "Interview", count: counts.interview || undefined },
            ]}
          />

          <div hidden={tab !== "timeline"} role="tabpanel" aria-label="Timeline">
            <TimelineTab events={detail.events} now={now} />
          </div>
          {visited.has("notes") && (
            <div hidden={tab !== "notes"} role="tabpanel" aria-label="Notes">
              <NotesTab
                applicationId={id}
                notes={detail.notes}
                onCount={(n) => {
                  merge({ notesCount: n });
                  refreshEvents();
                }}
              />
            </div>
          )}
          {visited.has("emails") && (
            <div hidden={tab !== "emails"} role="tabpanel" aria-label="Emails">
              <EmailsTab app={detail} />
            </div>
          )}
          {visited.has("resume") && (
            <div hidden={tab !== "resume"} role="tabpanel" aria-label="Resume">
              <ResumeTab
                app={detail}
                isPro={isPro}
                onLink={(resumeId) => {
                  void patchApplication(id, { resumeId }).then((r) => {
                    if (r.kind === "ok") {
                      merge({ resume: r.data.resume ?? { id: resumeId } });
                      refreshEvents();
                    } else toast({ title: "Couldn't link that resume", description: r.message, variant: "error" });
                  });
                }}
              />
            </div>
          )}
          {visited.has("interview") && (
            <div hidden={tab !== "interview"} role="tabpanel" aria-label="Interview">
              <InterviewTab
                applicationId={id}
                interviews={detail.interviews}
                onCount={(n) => {
                  merge({ interviewsCount: n });
                  refreshEvents();
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
