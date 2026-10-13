"use client";

import type { ReactNode } from "react";
import { MemberAvatar, StatePill, Tooltip, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { REASON_LABEL, stageLabel, type ClientRef, type Marketer, type PersonRef } from "@/lib/ent/applications";

/** The application stage map of the StatePill: grey Assigned/Closed, amber Submitted/Interviewing, grey Under Review, green Offer. */
if (!hasStateMap("application")) {
  registerStateMap("application", {
    ASSIGNED: "grey-outline",
    SUBMITTED: "amber-outline",
    UNDER_REVIEW: "grey",
    INTERVIEWING: "amber",
    OFFER: "green",
    CLOSED: "grey-outline",
  });
}

/** The stage chip. A closed application says why in a tooltip ("Closed: Hired"); the chip itself stays "Closed" as on the board. */
export function StagePill({ stage, reason }: { stage: string; reason?: string | null }) {
  const pill = <StatePill domain="application" state={stage} label={stageLabel(stage)} />;
  if (stage === "CLOSED" && reason) {
    return (
      <Tooltip content={`Closed: ${REASON_LABEL[reason] ?? reason}`} side="top">
        <span tabIndex={0} className="inline-flex" aria-label={`Closed: ${REASON_LABEL[reason] ?? reason}`}>
          {pill}
        </span>
      </Tooltip>
    );
  }
  return pill;
}

/** No logos exist for a client: an initials tile in the same colour logic as the people avatars. */
export function ClientTile({ client, size = 34 }: { client: ClientRef; size?: number }) {
  return <MemberAvatar name={client.name} size={size} className="!rounded-[10px]" />;
}

/** Name over a muted second line. */
export function TwoLine({ top, sub }: { top: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 leading-tight">
      <div className="truncate text-[13.5px] font-semibold text-ink">{top}</div>
      {sub != null && sub !== "" && <div className="truncate text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

export function ConsultantCell({ consultant }: { consultant: PersonRef }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <MemberAvatar name={consultant.name} size={34} />
      <TwoLine top={consultant.name} sub="Consultant" />
    </span>
  );
}

export function ClientCell({ client, orgName }: { client: ClientRef; orgName: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <ClientTile client={client} />
      <TwoLine top={client.name} sub={orgName} />
    </span>
  );
}

/** A marketer as an avatar and, when there is room, the name; none assigned reads as an honest dash. */
export function MarketerCell({ marketer, withName = false }: { marketer: Marketer | null; withName?: boolean }) {
  if (!marketer) return <span className="text-muted">{"—"}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2" title={marketer.name}>
      <MemberAvatar name={marketer.name} size={28} />
      {withName && <span className="truncate text-[13px] text-ink">{marketer.name}</span>}
      {!withName && <span className="sr-only">{marketer.name}</span>}
    </span>
  );
}
