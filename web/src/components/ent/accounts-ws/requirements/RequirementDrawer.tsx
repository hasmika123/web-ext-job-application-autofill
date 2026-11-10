"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ErrorState, MemberAvatar, PencilIcon, Select, SideSheet, Skeleton, useMediaQuery, useToast } from "@kiwiply/ui";
import {
  ageText, daysUntil, dueText, errorSentence, rateText, requirementsApi, SOURCE_LABEL, STATUS_OPTIONS, statusLabel, workModeLabel,
  type Candidate, type ReqDetail, type ReqStatus,
} from "@/lib/ent/accounts-ws/requirements";
import { Fact, PriorityPill, StatusPill } from "../parts";

export interface RequirementDrawerProps {
  orgId: number | string;
  /** The requirement to show; null = closed. */
  requirementId: number | null;
  /** Bumped by the page when something outside the drawer changed it. */
  reloadToken: number;
  onClose: () => void;
  /** Open the edit dialog on this detail. */
  onEdit: (detail: ReqDetail) => void;
  /** Something was saved here: the list and the tiles refresh. */
  onChanged: () => void;
}

const OPEN_STATES = new Set(["OPEN", "IN_REVIEW"]);

/**
 * The detail drawer of one requirement: facts, the client's text, the consultants it was put in front of, a status move and Edit. Putting a
 * requirement in front of a consultant RECORDS it: the consultant sees it as an opportunity and decides; nothing is applied or sent for them (E1).
 */
export default function RequirementDrawer({ orgId, requirementId, reloadToken, onClose, onEdit, onChanged }: RequirementDrawerProps) {
  const phone = useMediaQuery("(max-width: 767px)", false);
  const toast = useToast();
  const [detail, setDetail] = useState<ReqDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "gone">("loading");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (requirementId === null) return;
    const r = await requirementsApi.detail(orgId, requirementId);
    if (r.ok) {
      setDetail(r.data);
      setState("ready");
    } else {
      setState(r.status === 404 ? "gone" : "failed");
    }
  }, [orgId, requirementId]);

  useEffect(() => {
    if (requirementId === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh load every time another requirement opens (or the page bumps the token)
    setState("loading");
    setError(null);
    setPick("");
    void load();
  }, [requirementId, reloadToken, load]);

  const canAssign = !!detail?.access.canAssign && !!detail && OPEN_STATES.has(detail.requirement.status);
  useEffect(() => {
    if (!canAssign || requirementId === null) return;
    let live = true;
    void requirementsApi.candidates(orgId, requirementId).then((r) => {
      if (live && r.ok) setCandidates(r.data);
    });
    return () => {
      live = false;
    };
  }, [canAssign, orgId, requirementId, detail?.assignees.length]);

  async function moveStatus(status: string) {
    if (!detail || status === detail.requirement.status) return;
    setBusy(true);
    setError(null);
    const r = await requirementsApi.patch(orgId, detail.requirement.id, { status: status as ReqStatus }, detail.version);
    setBusy(false);
    if (!r.ok) {
      setError(errorSentence(r));
      if (r.status === 412 || r.status === 428) void load();
      return;
    }
    setDetail(r.data);
    toast({ title: `Moved to ${statusLabel(status).toLowerCase()}`, variant: "success" });
    onChanged();
  }

  async function putForward() {
    if (!detail || !pick) return;
    setBusy(true);
    setError(null);
    const r = await requirementsApi.assign(orgId, detail.requirement.id, Number(pick));
    setBusy(false);
    if (!r.ok) {
      setError(errorSentence(r));
      return;
    }
    setDetail(r.data.requirement);
    setPick("");
    toast({ title: r.data.existing ? "Already put in front of them" : "Put in front of the consultant", variant: "success" });
    onChanged();
  }

  const open = requirementId !== null;
  const r = detail?.requirement;
  const overdueDays = daysUntil(r?.dueOn ?? null);
  const assignedIds = new Set(detail?.assignees.map((a) => a.consultantId) ?? []);
  const choices = candidates.filter((c) => !assignedIds.has(c.consultantId));

  let body;
  if (state === "loading" || (state === "ready" && !detail)) {
    body = (
      <div role="status" aria-label="Loading requirement" className="space-y-3 py-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  } else if (state === "gone") {
    body = <ErrorState what="this requirement" title="This requirement is no longer in your view" description="It may have been removed." variant="inline" />;
  } else if (state === "failed" || !detail || !r) {
    body = <ErrorState what="this requirement" description="It didn't load. Nothing has changed." onRetry={() => void load()} variant="inline" />;
  } else {
    body = (
      <div data-requirement-drawer={r.id} className="space-y-5">
        <header className="space-y-1.5">
          <h2 className="text-[19px] font-bold leading-tight text-ink">{r.title}</h2>
          <p className="text-[13.5px] text-ink-soft">{r.client.name}</p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={r.status} />
            <PriorityPill priority={r.priority} />
            {detail.access.canEdit && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(detail)} data-requirement-edit>
                <PencilIcon size={14} aria-hidden /> Edit
              </Button>
            )}
          </div>
        </header>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 p-2.5 text-[13px] text-danger-text" data-drawer-error>
            {error}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Fact label="Location">{r.location || "Not set"}</Fact>
          <Fact label="Work mode">{workModeLabel(r.workMode) || "Not set"}</Fact>
          <Fact label="Openings">
            {r.filled} of {r.positions} filled
          </Fact>
          <Fact label="Rate range">{rateText(r.rate) || "Not set"}</Fact>
          <Fact label="Needed by">
            {dueText(r.dueOn) || "Not set"}
            {r.dueOn && overdueDays !== null && overdueDays < 0 && OPEN_STATES.has(r.status) ? <span className="ml-1.5 text-v2-coral-ink">Past due</span> : null}
          </Fact>
          <Fact label="Open for">{ageText(r.ageDays)}</Fact>
          <Fact label="Client contact">{detail.contact ? detail.contact.name : "None"}</Fact>
          <Fact label="Arrived as">
            {SOURCE_LABEL[r.source] ?? r.source}
            {detail.jobUrl ? (
              <>
                {" · "}
                <a href={detail.jobUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  posting
                </a>
              </>
            ) : null}
          </Fact>
        </dl>

        {r.skills.length > 0 && (
          <ul aria-label="Skills" className="flex flex-wrap gap-1.5">
            {r.skills.map((s) => (
              <li key={s} className="rounded-md bg-accent-soft px-2 py-1 text-[12px] font-medium text-accent-deep">
                {s}
              </li>
            ))}
          </ul>
        )}

        <section aria-label="The client's text">
          <h3 className="mb-1.5 text-[14px] font-bold text-ink">Description</h3>
          {detail.description ? <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">{detail.description}</p> : <p className="text-[13px] text-muted">No description entered.</p>}
        </section>

        {detail.access.canEdit && (
          <section aria-label="Status">
            <h3 className="mb-1.5 text-[14px] font-bold text-ink">Status</h3>
            <Select value={r.status} disabled={busy} onChange={(v) => void moveStatus(v)} options={STATUS_OPTIONS.map((s) => ({ value: s, label: statusLabel(s) }))} aria-label="Move to status" />
            <p className="mt-1.5 text-[12px] text-muted">Filling or closing a requirement closes the assignments still open on it.</p>
          </section>
        )}

        <section aria-label="Consultants" data-assignees>
          <h3 className="mb-1.5 text-[14px] font-bold text-ink">Consultants it was put in front of ({detail.assignees.length})</h3>
          {detail.assignees.length === 0 ? (
            <p className="text-[13px] text-muted" data-no-assignees>
              Nobody yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {detail.assignees.map((a) => (
                <li key={a.consultantId} className="flex items-center gap-2.5" data-assignee={a.consultantId}>
                  <MemberAvatar name={a.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{a.name}</p>
                    <p className="truncate text-[12px] text-ink-soft">{a.stage ? `Applied: ${a.stage.toLowerCase().replace(/_/g, " ")}` : (a.title ?? "Waiting for their answer")}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {canAssign && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="min-w-[12rem] flex-1">
                <Select
                  value={pick}
                  onChange={setPick}
                  disabled={busy || choices.length === 0}
                  options={[{ value: "", label: choices.length === 0 ? "No consultants to choose" : "Choose a consultant" }, ...choices.map((c) => ({ value: String(c.consultantId), label: c.score !== null ? `${c.name} (${c.score}% fit)` : c.name }))]}
                  aria-label="Consultant to put this in front of"
                />
              </div>
              <Button type="button" disabled={busy || !pick} onClick={() => void putForward()} data-put-forward>
                Put in front of them
              </Button>
              <p className="basis-full text-[12px] text-muted">The consultant sees it and decides. Nothing is applied or sent for them.</p>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <SideSheet id="accounts-requirement-sheet" side="right" mode={phone ? "fullscreen" : "overlay"} width={520} open={open} onClose={onClose} title="Requirement">
      {body}
    </SideSheet>
  );
}
