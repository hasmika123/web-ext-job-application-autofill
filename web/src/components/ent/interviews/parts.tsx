"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Input, MemberAvatar, PhoneIcon, MapPinIcon, SEARCH_DEBOUNCE_MS, SearchIcon, StatePill, VideoIcon, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { modeLabel, statusLabel, type ClientRef, type Interviewer, type Mode, type PersonRef } from "@/lib/ent/interviews";

/** The interview status map of the StatePill: blue Scheduled, amber In Progress, green Completed, red Cancelled (the board's pills). */
if (!hasStateMap("interview")) {
  registerStateMap("interview", { SCHEDULED: "blue", IN_PROGRESS: "amber", COMPLETED: "green", CANCELLED: "red" });
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return <StatePill domain="interview" state={status} label={statusLabel(status)} className={className} />;
}

/** No logos exist for a client: an initials tile in the same colour logic as the people avatars. */
export function ClientTile({ client, size = 28 }: { client: ClientRef; size?: number }) {
  return <MemberAvatar name={client.name} size={size} className="!rounded-lg" />;
}

/** Name over a muted second line. */
export function TwoLine({ top, sub, strong = true }: { top: ReactNode; sub?: ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0 leading-tight">
      <div className={`truncate text-[12.5px] text-ink ${strong ? "font-semibold" : "font-medium"}`}>{top}</div>
      {sub != null && sub !== "" && <div className="truncate text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function ConsultantCell({ consultant }: { consultant: PersonRef }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <MemberAvatar name={consultant.name} size={28} />
      <TwoLine top={consultant.name} sub="Consultant" />
    </span>
  );
}

export function ClientCell({ client }: { client: ClientRef }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <ClientTile client={client} size={24} />
      <span className="text-[11.5px] leading-tight text-ink-soft">{client.name}</span>
    </span>
  );
}

/** Up to two interviewer avatars and a "+N" for the rest; none recorded reads as an honest dash. */
export function InterviewerStack({ people, max = 2 }: { people: Interviewer[]; max?: number }) {
  if (people.length === 0) return <span className="text-muted">{"—"}</span>;
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span className="flex items-center" title={people.map((p) => p.name).join(", ")} data-interviewers>
      <span className="flex -space-x-1.5">
        {shown.map((p, i) => (
          <MemberAvatar key={`${p.name}-${i}`} name={p.name} size={22} className="ring-2 ring-paper" />
        ))}
      </span>
      {more > 0 && <span className="ml-1 text-[11.5px] font-semibold text-ink-soft">+{more}</span>}
      <span className="sr-only">{people.map((p) => p.name).join(", ")}</span>
    </span>
  );
}

/** Video / Onsite / Phone with the board's icon in the accent colour. */
export function ModeCell({ mode }: { mode: Mode }) {
  const Icon = mode === "VIDEO" ? VideoIcon : mode === "ONSITE" ? MapPinIcon : PhoneIcon;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink-soft" data-mode={mode}>
      <Icon size={15} aria-hidden className="text-accent" /> {modeLabel(mode)}
    </span>
  );
}

/**
 * The wide search box of the board. Typing is debounced, Enter sends at once, Esc clears, and a value that changes from outside (the URL,
 * "Clear filters") shows up in the box.
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
    <div className="relative min-w-0 flex-1">
      <SearchIcon aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
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
        className="pl-9 !text-[12.5px]"
      />
    </div>
  );
}
