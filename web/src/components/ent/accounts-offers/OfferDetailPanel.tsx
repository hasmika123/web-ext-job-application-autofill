"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the loader starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Dialog, ErrorState, Field, MemberAvatar, Skeleton, Textarea, TimelineFeed, useToast } from "@kiwiply/ui";
import type { TimelineEvent } from "@kiwiply/ui";
import { deadlineText, errorSentence, formatDay, offersApi, packageText, termText, type OfferDetail } from "@/lib/ent/offers";
import { StatePill } from "./parts";

type State = { status: "loading" } | { status: "gone" } | { status: "error"; message: string } | { status: "ok"; detail: OfferDetail };

function feed(d: OfferDetail): TimelineEvent[] {
  return d.timeline.map((e) => ({
    id: `o-${e.id}`,
    at: e.at,
    source: "application_event" as const,
    title: e.label,
    detail: e.detail ?? undefined,
    actor: { name: e.actorName, tag: e.actorKind === "CONSULTANT" ? "Consultant" : undefined },
  }));
}

const FACT = "flex items-start justify-between gap-3 border-b border-[color:var(--ent-table-line)] py-2 text-[13px] last:border-b-0";

/**
 * One offer: who and what, the recorded package, the timeline (who did what: an org user, the consultant or the system), and the actions the API allows.
 * The consultant alone accepts or declines; this panel says so and offers no such control.
 */
export default function OfferDetailPanel({
  orgId,
  offerId,
  reloadToken,
  onChanged,
  onEdit,
}: {
  orgId: number;
  offerId: number;
  reloadToken: number;
  onChanged: (d: OfferDetail) => void;
  onEdit: (d: OfferDetail) => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState("");
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const r = await offersApi.detail(orgId, offerId);
    if (mine !== seq.current) return;
    if (r.ok) setState({ status: "ok", detail: r.data });
    else setState(r.status === 404 ? { status: "gone" } : { status: "error", message: errorSentence(r) });
  }, [orgId, offerId]);

  useEffect(() => {
    setState({ status: "loading" });
    void load();
  }, [load, reloadToken]);

  async function run(title: string, description: string, call: () => ReturnType<typeof offersApi.extend>) {
    setBusy(true);
    const r = await call();
    setBusy(false);
    if (!r.ok) {
      toast({ title: "Couldn't record that", description: errorSentence(r), variant: "error" });
      return;
    }
    setState({ status: "ok", detail: r.data });
    onChanged(r.data);
    toast({ title, description, variant: "success" });
  }

  if (state.status === "loading")
    return (
      <div role="status" aria-label="Loading offer" className="space-y-3 py-2">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  if (state.status === "gone") return <ErrorState variant="inline" what="this offer" description="It is no longer in your view." />;
  if (state.status === "error") return <ErrorState variant="inline" what="this offer" description={state.message} />;

  const d = state.detail;
  const o = d.offer;
  const first = o.consultant.name.split(" ")[0];
  const canAct = d.actions.edit || d.actions.extend || d.actions.withdraw || d.actions.createPlacement;

  return (
    <div data-offer-detail={o.id} className="space-y-4">
      <header className="flex items-start gap-3">
        <MemberAvatar name={o.consultant.name} size={44} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold leading-tight text-[color:var(--ent-title)]">{o.consultant.name}</h3>
          <p className="mt-0.5 text-[13px] text-muted">
            {o.roleTitle} at {o.clientName}
          </p>
        </div>
        <StatePill state={o.state} label={o.stateLabel} />
      </header>

      <p className="rounded-lg bg-accent-soft/50 px-3 py-2 text-[12.5px] text-ink" data-consent-note>
        {o.state === "DRAFT"
          ? "Only you can see this draft. Record it as extended when the client has made the offer; then " + first + " can answer it."
          : o.state === "EXTENDED" || o.state === "NEGOTIATING"
            ? `Only ${first} can accept or decline this offer. Nothing is signed or sent from here.`
            : "This records the offer and the answer. Nothing was signed or sent from here."}
      </p>

      <section aria-label="Offer details">
        <dl>
          <div className={FACT}>
            <dt className="text-muted">Package</dt>
            <dd className="font-medium text-ink">{packageText(o)}</dd>
          </div>
          <div className={FACT}>
            <dt className="text-muted">Term</dt>
            <dd className="text-right text-ink">{termText(o)}</dd>
          </div>
          {o.deadline && (
            <div className={FACT}>
              <dt className="text-muted">Answer by</dt>
              <dd className="text-right text-ink">
                {formatDay(o.deadline)}
                {deadlineText(o) && o.daysLeft !== null ? <span className="block text-[12px] text-muted">{deadlineText(o)}</span> : null}
              </dd>
            </div>
          )}
          {o.workMode && (
            <div className={FACT}>
              <dt className="text-muted">Work mode</dt>
              <dd className="text-ink">{o.workMode.charAt(0) + o.workMode.slice(1).toLowerCase()}</dd>
            </div>
          )}
          {d.benefits && (
            <div className={FACT}>
              <dt className="text-muted">Benefits</dt>
              <dd className="text-right text-ink">{d.benefits}</dd>
            </div>
          )}
          {d.notes && (
            <div className={FACT}>
              <dt className="text-muted">Notes</dt>
              <dd className="text-right text-ink">{d.notes}</dd>
            </div>
          )}
          {d.responseNote && (
            <div className={FACT}>
              <dt className="text-muted">{first}&apos;s note</dt>
              <dd className="text-right text-ink">{d.responseNote}</dd>
            </div>
          )}
        </dl>
      </section>

      {(d.placement || d.placementNote) && (
        <section aria-label="Placement" className="rounded-lg border border-[color:var(--ent-card-border)] p-3 text-[13px]" data-offer-placement>
          <h4 className="font-bold text-[color:var(--ent-title)]">Placement</h4>
          {d.placement ? (
            <p className="mt-1 text-ink">
              Created from this offer: {d.placement.status === "PENDING_START" ? `starts ${formatDay(d.placement.startDate)}` : "active"}.
            </p>
          ) : (
            <p className="mt-1 text-muted">{d.placementNote}</p>
          )}
        </section>
      )}

      {canAct && (
        <section aria-label="Actions" className="flex flex-wrap gap-2" data-offer-actions>
          {d.actions.extend && (
            <Button
              type="button"
              variant="accent"
              disabled={busy}
              data-action="extend"
              onClick={() => void run("Recorded as extended", `${first} can now see this offer and answer it.`, () => offersApi.extend(orgId, o.id))}
            >
              Record as extended
            </Button>
          )}
          {d.actions.createPlacement && (
            <Button type="button" variant="accent" disabled={busy} data-action="placement" onClick={() => void run("Placement created", `${first}'s placement was recorded from this offer.`, () => offersApi.createPlacement(orgId, o.id))}>
              Create placement
            </Button>
          )}
          {d.actions.edit && (
            <Button type="button" variant="ghost" disabled={busy} data-action="edit" onClick={() => onEdit(d)}>
              Edit
            </Button>
          )}
          {d.actions.withdraw && (
            <Button type="button" variant="ghost" disabled={busy} data-action="withdraw" onClick={() => setWithdrawing(true)}>
              Withdraw
            </Button>
          )}
        </section>
      )}

      <section aria-label="Timeline">
        <h4 className="mb-2 text-[13px] font-bold text-[color:var(--ent-title)]">Timeline</h4>
        <TimelineFeed events={feed(d)} empty="Nothing has been recorded on this offer yet." />
      </section>

      <Dialog
        open={withdrawing}
        onClose={() => setWithdrawing(false)}
        title="Withdraw this offer"
        description={`This records that the offer was withdrawn${o.state === "DRAFT" ? "." : `, and ${first} is told in their notifications.`} Nothing is sent to the client.`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setWithdrawing(false)}>
              Keep offer
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={busy}
              data-withdraw-submit
              onClick={() => {
                setWithdrawing(false);
                void run("Offer withdrawn", "The offer is closed.", () => offersApi.withdraw(orgId, o.id, reason.trim()));
              }}
            >
              Withdraw offer
            </Button>
          </>
        }
      >
        <Field label="Reason" hint="Optional. No ID numbers or other sensitive details.">
          <Textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
        </Field>
      </Dialog>
    </div>
  );
}
