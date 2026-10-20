"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button, CalendarIcon, CheckIcon, ClockIcon, ErrorState, MemberAvatar, Skeleton, Tab, TabList, TabPanel, Tabs, Textarea, TimelineFeed, UsersIcon, XIcon, useToast } from "@kiwiply/ui";
import type { TimelineEvent } from "@kiwiply/ui";
import {
  dayParts,
  errorSentence,
  eventTitle,
  extensionSummary,
  formatDay,
  placementsApi,
  rateText,
  relativeDays,
  STATUS_LABEL,
  typeLabel,
  type DetailTab,
  type EventItem,
  type ExtensionItem,
  type PlacementDetail,
} from "@/lib/ent/placements";
import ExtensionDialog, { type ExtensionMode } from "./ExtensionDialog";
import { usePlacementAction, usePlacementDetail } from "./hooks";
import { ClientTile, StatusPill } from "./parts";

export interface DetailPanelProps {
  orgId: number | string;
  placementId: number;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  /** Draws the close (X) button of the docked card; the sheets have their own. */
  onClose?: () => void;
  /** A changed placement: the table row and the tiles refresh from it. */
  onChanged: (d: PlacementDetail) => void;
  /** Bumped by the page when something outside the panel changed this placement. */
  reloadToken: number;
  consultantsHref: string | null;
  clientsHref: string | null;
  /** The row menu asked for a dialog ("Extend placement..."): opens it once the placement has loaded. */
  intent?: ExtensionMode | null;
  onIntentHandled?: () => void;
}

const ROW = "grid grid-cols-[6.6rem_1fr] items-center gap-x-2 py-[3px] text-[10.5px] leading-snug";
const HEADING = "text-[13px] font-bold leading-tight text-[color:var(--ent-title)]";
const SOFT = "rounded-xl border border-[color:var(--ent-card-border)] bg-white p-3";
const TAB = "!px-2 !py-2 !text-[11px] !font-medium !text-[color:var(--pl-value)] aria-selected:!border-accent aria-selected:!text-accent-deep";
const OUTLINE_BTN =
  "inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-[color:var(--pl-blue-line)] bg-white px-3 text-[11.5px] font-semibold text-accent-deep transition hover:bg-accent-soft/60 disabled:pointer-events-none disabled:opacity-50";

function Row({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className={ROW} data-field={testId}>
      <dt className="text-[color:var(--pl-soft)]">{label}</dt>
      <dd className="min-w-0 text-[color:var(--pl-value)]">{children}</dd>
    </div>
  );
}

const TONE_TEXT: Record<string, string> = { amber: "text-[color:var(--pl-amber)]", red: "text-[color:var(--pl-red)]" };

/* ── Engagement timeline: started, midpoint, ends ─────────────────────────────────────────────────────── */

export function EngagementTimeline({ d }: { d: PlacementDetail }) {
  const e = d.engagement;
  const today = new Date().toISOString().slice(0, 10);
  const reached = (iso: string | null) => (iso ? iso <= today : false);
  const dots = [
    { iso: e.start, label: "Started", on: reached(e.start) },
    { iso: e.midpoint, label: "Midpoint", on: reached(e.midpoint) },
    { iso: e.end, label: "Ends", on: reached(e.end) },
  ];
  if (!e.end) {
    return (
      <p className="text-[12.5px] text-[color:var(--pl-soft)]" data-engagement>
        Started {formatDay(e.start)}. This placement is open-ended: no end date is recorded.
      </p>
    );
  }
  const lastOn = dots.reduce((n, x, i) => (x.on ? i : n), 0);
  return (
    <div data-engagement>
      <div className="relative mx-1.5 h-3">
        <span aria-hidden className="absolute left-0 right-0 top-[4.5px] h-[3px] rounded bg-[color:var(--pl-track)]" />
        <span aria-hidden className="absolute left-0 top-[4.5px] h-[3px] rounded bg-[color:var(--pl-green)]" style={{ width: `${lastOn * 50}%` }} />
        {dots.map((x, i) => (
          <span
            key={x.label}
            aria-hidden
            data-dot={x.label}
            data-on={x.on}
            className={`absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full ${x.on ? "bg-[color:var(--pl-green)]" : "bg-[color:var(--pl-track)]"}`}
            style={{ left: `${i * 50}%` }}
          />
        ))}
      </div>
      <ol className="mt-1.5 flex justify-between text-[10.5px] leading-[1.25] text-[color:var(--pl-soft)]">
        {dots.map((x, i) => {
          const p = dayParts(x.iso);
          return (
            <li key={x.label} className={i === 0 ? "text-left" : i === 1 ? "text-center" : "text-right"}>
              <span className="block font-bold text-[color:var(--ent-title)]">{p.md}</span>
              <span className="block">{p.year}</span>
              <span className="block">{x.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ── tabs ─────────────────────────────────────────────────────────────────────────────────────────────── */

function toFeed(events: EventItem[]): TimelineEvent[] {
  return events.map((e) => ({
    id: `t-${e.id}`,
    at: e.at,
    source: "application_event" as const,
    title: eventTitle(e),
    detail: e.type === "NOTE" || e.type === "UNDO" ? undefined : (e.detail ?? undefined),
    actor: e.actor ? { name: e.actor.name } : undefined,
  }));
}

const EXT_PILL: Record<string, { label: string; tone: string }> = {
  REQUESTED: { label: "Requested", tone: "amber" },
  APPROVED: { label: "Approved", tone: "green" },
  DECLINED: { label: "Declined", tone: "grey" },
  CANCELLED: { label: "Cancelled", tone: "grey" },
};

function ExtensionsPanel({ d, onDecide, onRequest, busy }: { d: PlacementDetail; onDecide: (x: ExtensionItem, decision: "APPROVE" | "DECLINE") => void; onRequest: () => void; busy: boolean }) {
  return (
    <div className="space-y-2.5" data-extensions-list>
      {d.actions.requestExtension && (
        <button type="button" className={`${OUTLINE_BTN} w-full`} onClick={onRequest}>
          Request Extension
        </button>
      )}
      {d.extensions.length === 0 ? (
        <p className="py-3 text-center text-[12.5px] text-muted">No extension has been requested or recorded for this placement.</p>
      ) : (
        <ul className="space-y-2">
          {d.extensions.map((x) => {
            const pill = EXT_PILL[x.status] ?? EXT_PILL.CANCELLED;
            return (
              <li key={x.id} data-extension-id={x.id} data-extension-status={x.status} className={SOFT}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-bold text-[color:var(--ent-title)]">{x.fromEndDate ? `${formatDay(x.fromEndDate)} to ${formatDay(x.requestedEndDate)}` : `Until ${formatDay(x.requestedEndDate)}`}</span>
                  <span className="ent-pill !px-2 !py-[2px] !text-[11px] !font-semibold" data-tone={pill.tone}>
                    {pill.label}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[color:var(--pl-soft)]">
                  {x.status === "REQUESTED" ? "Requested" : "Recorded"} by {(x.decidedBy ?? x.requestedBy)?.name ?? "someone"} on {formatDay(x.decidedAt ?? x.createdAt)}
                </p>
                {x.note && <p className="mt-1 break-words text-[12px] text-[color:var(--pl-value)]">{x.note}</p>}
                {x.status === "REQUESTED" && d.actions.decideExtension && (
                  <div className="mt-2 flex gap-2">
                    <Button type="button" variant="accent" size="sm" disabled={busy} onClick={() => onDecide(x, "APPROVE")} data-decide="APPROVE">
                      Approve
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onDecide(x, "DECLINE")} data-decide="DECLINE">
                      Decline
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NotesPanel({ orgId, d, onSaved }: { orgId: number | string; d: PlacementDetail; onSaved: (d: PlacementDetail) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function add() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    const r = await placementsApi.addNote(orgId, d.id, body);
    setBusy(false);
    if (!r.ok) {
      setErr(errorSentence(r));
      return;
    }
    setText("");
    toast({ title: "Note added", variant: "success" });
    onSaved(r.data);
  }
  return (
    <div className="space-y-3" data-notes>
      {d.actions.addNote && (
        <div>
          <Textarea
            aria-label="Add a note"
            placeholder="Add a note for your team"
            rows={3}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          {err && <p role="alert" className="mt-1 text-[12px] text-danger">{err}</p>}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[10.5px] text-muted">No ID numbers or other sensitive details. Ctrl+Enter adds it.</p>
            <Button type="button" size="sm" onClick={() => void add()} disabled={busy || text.trim() === ""}>
              Add note
            </Button>
          </div>
        </div>
      )}
      {d.notes.length === 0 ? (
        <p className="py-3 text-center text-[12.5px] text-muted">No notes on this placement yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {d.notes.map((n) => (
            <li key={n.id} data-note-id={n.id} className="rounded-xl border border-line bg-paper-2/40 p-3">
              <div className="flex items-center gap-2 text-[12px] text-muted">
                {n.author && <MemberAvatar name={n.author.name} size={22} />}
                <span className="font-semibold text-ink-soft">{n.author?.name ?? "Someone"}</span>
                <span>{formatDay(n.createdAt)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-ink">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading placement" className="space-y-3 py-2">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/* ── the panel ────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The placement drawer: the consultant header, four tabs, and on Overview the placement details, engagement timeline, extension status,
 * post-placement availability and the quick actions. Every action is a record with an Undo toast; nothing here moves money.
 */
export default function DetailPanel(p: DetailPanelProps) {
  const { state, replace } = usePlacementDetail(p.orgId, p.placementId, p.reloadToken);
  const [dialog, setDialog] = useState<ExtensionMode | null>(null);
  const [dialogErr, setDialogErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = usePlacementAction(p.orgId, (d) => {
    replace(d);
    p.onChanged(d);
  });

  const loaded = state.status === "ok";
  const { intent, onIntentHandled } = p;
  useEffect(() => {
    if (loaded && intent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the row menu asked for a dialog: open it once the placement has loaded
      setDialogErr(null);
      setDialog(intent);
      onIntentHandled?.();
    }
  }, [loaded, intent, onIntentHandled]);

  if (state.status === "idle" || state.status === "loading") return <Loading />;
  if (state.status === "gone") return <ErrorState variant="inline" what="this placement" description="It is no longer in your view. It may have moved out of your scope." />;
  if (state.status === "error") return <ErrorState variant="inline" what="this placement" description={state.message} />;
  const d = state.detail;
  const first = d.consultant.name.split(" ")[0];
  const ext = extensionSummary(d);
  const endTone = TONE_TEXT[d.nextAction.tone] ?? "";
  const rate = rateText(d.billRateMinor, d.rateUnit, d.currency);
  const hasQuick = d.actions.extend || d.actions.complete || d.actions.redeploy || d.actions.terminate || d.actions.giveNotice;

  async function submitDialog(date: string, note: string) {
    if (!dialog) return;
    setBusy(true);
    setDialogErr(null);
    const r =
      dialog === "extend"
        ? await act(d.id, { title: "Placement extended", description: `The end date is now ${formatDay(date)}.` }, () => placementsApi.extend(p.orgId, d.id, date, note))
        : dialog === "request"
          ? await act(d.id, { title: "Extension requested", description: `Waiting for a decision on ${formatDay(date)}.` }, () => placementsApi.requestExtension(p.orgId, d.id, date, note))
          : dialog === "notice"
            ? await act(d.id, { title: "Notice recorded", description: `${first} is on notice until ${formatDay(date)}.` }, () => placementsApi.giveNotice(p.orgId, d.id, date, note))
            : dialog === "terminate"
              ? await act(d.id, { title: "Placement terminated", description: `${first}'s placement at ${d.client.name} ended on ${formatDay(date)}.` }, () => placementsApi.terminate(p.orgId, d.id, note, date))
              : await act(d.id, { title: "Redeployment started", description: `${first} is in the pool from ${formatDay(date)}.` }, () => placementsApi.redeploy(p.orgId, d.id, date));
    setBusy(false);
    if (r) setDialog(null);
    else setDialogErr("That could not be recorded. Check the date and try again.");
  }

  async function complete() {
    setBusy(true);
    await act(d.id, { title: "Marked complete", description: `${first}'s placement at ${d.client.name} is complete.` }, () => placementsApi.complete(p.orgId, d.id));
    setBusy(false);
  }

  async function redeploy() {
    setBusy(true);
    await act(d.id, { title: "Redeployment started", description: `${first} is now in the redeployment pool.` }, () => placementsApi.redeploy(p.orgId, d.id));
    setBusy(false);
  }

  async function leavePool() {
    setBusy(true);
    await act(d.id, { title: "Removed from the pool" }, () => placementsApi.cancelRedeploy(p.orgId, d.id));
    setBusy(false);
  }

  async function decide(x: ExtensionItem, decision: "APPROVE" | "DECLINE") {
    setBusy(true);
    await act(
      d.id,
      decision === "APPROVE" ? { title: "Extension approved", description: `The end date is now ${formatDay(x.requestedEndDate)}.` } : { title: "Extension declined" },
      () => placementsApi.decide(p.orgId, d.id, x.id, decision),
    );
    setBusy(false);
  }

  const availableText = d.availability.availableFrom ? (
    <>
      {(d.status === "ENDED" || d.status === "TERMINATED") && (d.availability.inDays ?? 0) < 0 ? `${first} has been available since ` : `${first} will be available starting `}
      <span className={`font-semibold ${d.nextAction.kind === "ENDS_IN" ? TONE_TEXT[d.nextAction.tone] : "text-[color:var(--pl-amber)]"}`}>
        {formatDay(d.availability.availableFrom)}
        {d.availability.inDays !== null && d.availability.inDays > 0 ? ` (in ${d.availability.inDays} days)` : d.availability.inDays === 0 ? " (today)" : ""}.
      </span>
    </>
  ) : (
    "This placement is open-ended, so no availability date is known yet."
  );

  return (
    <div data-detail-body data-placement-id={d.id}>
      <div className="flex items-start gap-3" data-drawer-head>
        <MemberAvatar name={d.consultant.name} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="text-[13.5px] font-bold leading-tight text-[color:var(--ent-title)]">
              {p.consultantsHref ? (
                <Link href={p.consultantsHref} className="hover:underline">
                  {d.consultant.name}
                </Link>
              ) : (
                d.consultant.name
              )}
            </h3>
            <StatusPill status={d.status} />
          </div>
          <p className="mt-1 text-[10.5px] leading-tight text-[color:var(--pl-link-soft)]">{d.consultant.subtitle ?? d.roleTitle}</p>
        </div>
        {p.onClose && (
          <button type="button" onClick={p.onClose} aria-label="Close" className="grid h-7 w-7 flex-none place-items-center rounded-md text-accent-deep hover:bg-accent-soft" data-drawer-close>
            <XIcon size={16} aria-hidden />
          </button>
        )}
      </div>

      <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as DetailTab)} variant="underline" className="mt-3">
        <TabList aria-label="Placement details" className="!gap-0 justify-between !border-[color:var(--pl-track)]">
          <Tab value="overview" className={TAB}>Overview</Tab>
          <Tab value="timeline" className={TAB}>Timeline</Tab>
          <Tab value="extensions" className={TAB}>Extensions</Tab>
          <Tab value="notes" className={TAB}>Notes</Tab>
        </TabList>

        <TabPanel value="overview" className="pt-3.5">
          <h4 className={HEADING}>Placement details</h4>
          <dl className="mt-2">
            <Row label="Client" testId="client">
              <span className="flex items-center gap-2">
                <ClientTile client={d.client} size={22} />
                {clientLink(d, p.clientsHref)}
              </span>
            </Row>
            <Row label="Role" testId="role">{d.roleTitle}</Row>
            <Row label="Placement type" testId="type">{typeLabel(d.placementType)}</Row>
            <Row label="Start date" testId="start">
              {formatDay(d.startDate)}
              {d.startsInDays !== null && <span className="text-[color:var(--pl-soft)]"> (in {d.startsInDays} {d.startsInDays === 1 ? "day" : "days"})</span>}
            </Row>
            <Row label="End date" testId="end">
              {d.endDate ? (
                <span className={`font-medium ${d.status === "ACTIVE" || d.status === "ENDING" ? endTone : ""}`}>
                  {formatDay(d.endDate)}
                  {d.endsInDays !== null && d.status !== "ENDED" && d.status !== "TERMINATED" && d.endsInDays >= 0 ? ` (${relativeDays(d.endsInDays)})` : ""}
                </span>
              ) : (
                <span className="text-muted">Open-ended</span>
              )}
            </Row>
            <Row label="Account Manager" testId="manager">
              {d.accountManager ? (
                <span className="flex items-center gap-2">
                  <MemberAvatar name={d.accountManager.name} size={24} />
                  <span>{d.accountManager.name}</span>
                </span>
              ) : (
                <span className="text-muted">Not assigned</span>
              )}
            </Row>
            <Row label="Bill rate" testId="rate">{rate || <span className="text-muted">Not shown</span>}</Row>
            <Row label="Client contact" testId="contact">
              {d.clientContact ? (
                <span className="flex items-center gap-2">
                  <MemberAvatar name={d.clientContact.name} size={26} />
                  <span className="min-w-0 leading-tight">
                    <span className="block">{d.clientContact.name}</span>
                    {d.clientContact.title && <span className="block text-[10.5px] text-[color:var(--pl-link-soft)]">{d.clientContact.title}</span>}
                  </span>
                </span>
              ) : (
                <span className="text-muted">None recorded</span>
              )}
            </Row>
          </dl>

          <h4 className={`${HEADING} mt-4`}>Engagement timeline</h4>
          <div className="mt-2.5">
            <EngagementTimeline d={d} />
          </div>

          <section aria-labelledby="ext-h" className={`${SOFT} mt-3.5`} data-extension-status>
            <div className="flex items-start gap-2.5">
              <ClockIcon size={24} aria-hidden className="mt-0.5 flex-none text-[color:var(--pl-amber)]" />
              <div className="min-w-0 flex-1">
                <h4 id="ext-h" className="text-[12.5px] font-bold leading-tight text-[color:var(--ent-title)]">
                  {ext.title === "Extension status" ? "Extension status" : ext.title}
                </h4>
                <p className="mt-0.5 text-[10.5px] leading-snug text-[color:var(--pl-soft)]">{ext.body}</p>
              </div>
            </div>
            {d.actions.requestExtension && (
              <button type="button" className={`${OUTLINE_BTN} mt-2.5 w-full`} onClick={() => { setDialogErr(null); setDialog("request"); }} data-request-extension>
                Request Extension
              </button>
            )}
            {d.extensionPending && d.actions.decideExtension && (
              <div className="mt-2.5 flex gap-2">
                {d.extensions
                  .filter((x) => x.status === "REQUESTED")
                  .slice(0, 1)
                  .map((x) => (
                    <div key={x.id} className="flex w-full gap-2">
                      <Button type="button" variant="accent" size="sm" className="flex-1" disabled={busy} onClick={() => void decide(x, "APPROVE")}>
                        Approve
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="flex-1" disabled={busy} onClick={() => void decide(x, "DECLINE")}>
                        Decline
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section aria-labelledby="avail-h" className={`${SOFT} mt-2.5`} data-availability>
            <div className="flex items-start gap-2.5">
              <UsersIcon size={24} aria-hidden className="mt-0.5 flex-none text-accent" />
              <div className="min-w-0 flex-1">
                <h4 id="avail-h" className="text-[12.5px] font-bold leading-tight text-[color:var(--ent-title)]">
                  Post-Placement Availability
                </h4>
                {d.availability.availableFrom && <p className="mt-0.5 text-[10.5px] font-bold leading-snug text-[color:var(--pl-good)]">Available for redeployment</p>}
                <p className="text-[10.5px] leading-snug text-[color:var(--pl-soft)]">{availableText}</p>
                {d.availability.inPool && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px] text-[color:var(--pl-soft)]">
                    <span className="ent-pill !px-2 !py-[2px] !text-[11px] !font-semibold" data-tone="purple">In the redeployment pool</span>
                    {d.actions.addNote && (
                      <button type="button" className="font-semibold text-accent-deep hover:underline" onClick={() => void leavePool()} disabled={busy} data-leave-pool>
                        Remove from pool
                      </button>
                    )}
                  </p>
                )}
              </div>
            </div>
          </section>

          {hasQuick && (
            <section aria-labelledby="quick-h" className="mt-3.5" data-quick-actions>
              <h4 id="quick-h" className="text-[12.5px] font-bold text-[color:var(--ent-title)]">
                Actions
              </h4>
              <div className="mt-2 grid grid-cols-[1.14fr_1fr] gap-2">
                {d.actions.extend && (
                  <button
                    type="button"
                    onClick={() => {
                      setDialogErr(null);
                      setDialog("extend");
                    }}
                    disabled={busy}
                    data-quick="extend"
                    className="inline-flex h-[38px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-2 text-[11px] font-semibold text-on-accent transition hover:brightness-95 disabled:opacity-50"
                  >
                    <CalendarIcon size={16} aria-hidden /> Extend placement
                  </button>
                )}
                {d.actions.complete && (
                  <button type="button" onClick={() => void complete()} disabled={busy} data-quick="complete" className={`${OUTLINE_BTN} !h-[38px] !gap-1.5 whitespace-nowrap !px-2`}>
                    <CheckIcon size={16} aria-hidden /> Mark complete
                  </button>
                )}
                {d.actions.giveNotice && (
                  <button type="button" onClick={() => { setDialogErr(null); setDialog("notice"); }} disabled={busy} data-quick="notice" className={`${OUTLINE_BTN} !h-[38px] !gap-1.5 whitespace-nowrap !px-2`}>
                    <CalendarIcon size={16} aria-hidden /> Record notice
                  </button>
                )}
                {d.actions.terminate && (
                  <button type="button" onClick={() => { setDialogErr(null); setDialog("terminate"); }} disabled={busy} data-quick="terminate" className={`${OUTLINE_BTN} !h-[38px] !gap-1.5 whitespace-nowrap !px-2`}>
                    Terminate
                  </button>
                )}
                {d.actions.redeploy && (
                  <button type="button" onClick={() => void redeploy()} disabled={busy} data-quick="redeploy" className={`${OUTLINE_BTN} !h-[38px] col-span-2`}>
                    <UsersIcon size={16} aria-hidden /> Start redeployment
                  </button>
                )}
              </div>
            </section>
          )}
        </TabPanel>

        <TabPanel value="timeline" className="pt-3">
          <TimelineFeed events={toFeed(d.timeline)} empty="Nothing has been recorded on this placement yet." />
        </TabPanel>
        <TabPanel value="extensions" className="pt-3">
          <ExtensionsPanel d={d} onDecide={(x, v) => void decide(x, v)} onRequest={() => { setDialogErr(null); setDialog("request"); }} busy={busy} />
        </TabPanel>
        <TabPanel value="notes" className="pt-3">
          <NotesPanel
            orgId={p.orgId}
            d={d}
            onSaved={(next) => {
              replace(next);
              p.onChanged(next);
            }}
          />
        </TabPanel>
      </Tabs>

      <ExtensionDialog
        open={dialog !== null}
        mode={dialog ?? "extend"}
        currentEnd={d.endDate}
        start={d.startDate}
        defaultDate={dialog === "redeploy" ? (d.availability.availableFrom ?? undefined) : undefined}
        busy={busy}
        error={dialogErr}
        onClose={() => setDialog(null)}
        onSubmit={(date, note) => void submitDialog(date, note)}
      />
      <span className="sr-only" data-status-label>{STATUS_LABEL[d.status]}</span>
    </div>
  );
}

function clientLink(d: PlacementDetail, href: string | null): ReactNode {
  const name = <span className="font-medium text-accent-deep">{d.client.name}</span>;
  if (!href) return name;
  return (
    <Link href={href} className="hover:underline">
      {name}
    </Link>
  );
}
