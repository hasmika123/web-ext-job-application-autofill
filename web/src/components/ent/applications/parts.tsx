"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Input, MemberAvatar, SEARCH_DEBOUNCE_MS, SearchIcon, StatePill, Tooltip, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { REASON_LABEL, stageLabel, type ClientRef, type Marketer, type PersonRef } from "@/lib/ent/applications";

/** The application stage map of the StatePill (the board): Assigned and Closed grey, Under Review blue, Submitted purple, Interviewing amber, Offer green. */
if (!hasStateMap("application")) {
  registerStateMap("application", {
    ASSIGNED: "grey",
    SUBMITTED: "purple",
    UNDER_REVIEW: "blue",
    INTERVIEWING: "amber",
    OFFER: "green",
    CLOSED: "grey",
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
export function ClientTile({ client, size = 30 }: { client: ClientRef; size?: number }) {
  return <MemberAvatar name={client.name} size={size} className="!rounded-[10px]" />;
}

/** Name over a muted second line. */
export function TwoLine({ top, sub }: { top: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 leading-tight">
      <div className="truncate text-[11px] font-bold text-[var(--ent-title)]">{top}</div>
      {sub != null && sub !== "" && <div className="truncate text-[9.5px] text-[var(--ent-soft)]">{sub}</div>}
    </div>
  );
}

export function ConsultantCell({ consultant }: { consultant: PersonRef }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <MemberAvatar name={consultant.name} size={30} />
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
      <MemberAvatar name={marketer.name} size={30} />
      {withName && <span className="truncate text-[11px] text-[var(--ent-title)]">{marketer.name}</span>}
      {!withName && <span className="sr-only">{marketer.name}</span>}
    </span>
  );
}

/**
 * The wide search box of the board (the shared FilterBar keeps its box narrow beside its dropdowns). Same behaviour: typing is debounced,
 * Enter sends at once, Esc clears, and a value that changes from outside (the URL, "Clear filters") shows up in the box.
 */
export function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (q: string) => void; label: string; placeholder: string }) {
  const [text, setText] = useState(value);
  const sent = useRef(value);
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    if (text === sent.current) return;
    const timer = setTimeout(() => {
      if (text === sent.current) return;
      sent.current = text;
      onChange(text);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // the page's setter changes identity on every render; the timer restarts on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div role="search" className="relative min-w-0 flex-1">
      <SearchIcon aria-hidden size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#3b5ba5]" />
      <Input
        type="search"
        value={text}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (text !== sent.current) {
              sent.current = text;
              onChange(text);
            }
          } else if (e.key === "Escape" && text !== "") setText("");
        }}
        className="ent-search pl-10"
      />
    </div>
  );
}
