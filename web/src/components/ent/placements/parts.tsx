"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Input, MemberAvatar, SEARCH_DEBOUNCE_MS, SearchIcon } from "@kiwiply/ui";
import { STATUS_LABEL, type ClientRef, type NextAction, type PersonRef, type PlacementStatus } from "@/lib/ent/placements";

/** The six pastel tones of the KPI icon tiles (theme-tenant.css) double as the client logo tones: a client without a logo is an initials tile. */
const TILE_TONES = ["blue", "violet", "green", "indigo", "orange", "pink"] as const;

function toneOf(name: string): (typeof TILE_TONES)[number] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TILE_TONES[h % TILE_TONES.length];
}

/** No logos exist for a client: the first letter on a soft tile (the board's "A", "G", "I" squares). */
export function ClientTile({ client, size = 26, letters = 1 }: { client: ClientRef; size?: number; letters?: 1 | 2 }) {
  const tone = toneOf(client.name);
  return (
    <span
      aria-hidden
      data-client-tile
      className="inline-grid flex-none place-items-center font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        fontSize: Math.round(size * 0.46),
        background: `var(--ent-kpi-${tone}-bg)`,
        color: `var(--ent-kpi-${tone}-fg)`,
      }}
    >
      {letters === 1 ? client.name.trim().charAt(0).toUpperCase() : client.initials}
    </span>
  );
}

/** The consultant: avatar, name over their job title (as the board does). */
export function ConsultantCell({ consultant, size = 34 }: { consultant: PersonRef; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <MemberAvatar name={consultant.name} size={size} />
      <span className="min-w-0 leading-[1.2]">
        <span className="block truncate text-[12px] font-bold text-[color:var(--ent-title)]">{consultant.name}</span>
        {consultant.subtitle && <span className="block text-[10.5px] leading-[1.25] text-[color:var(--pl-link-soft)]">{consultant.subtitle}</span>}
      </span>
    </span>
  );
}

export function ManagerCell({ name, size = 26 }: { name: string | null; size?: number }) {
  if (!name) return <span className="text-muted">{"—"}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={name}>
      <MemberAvatar name={name} size={size} />
      <span className="min-w-0 text-[12px] leading-tight text-[color:var(--pl-body)]">{name}</span>
    </span>
  );
}

const PILL = "!rounded-md !px-3 !py-[3px] !text-[12px] !font-medium";

/** The row's status chip: Active is green, Upcoming blue, Completed grey. */
export function StatusPill({ status }: { status: PlacementStatus }) {
  const tone = status === "ACTIVE" ? "green" : status === "UPCOMING" ? "blue" : "grey";
  return (
    <span className={`ent-pill ${PILL}`} data-tone={tone} data-status-pill={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** The Next Action pill: No action (grey), Ends in N days (amber, red when urgent), Schedule review and Starts in (blue). */
export function NextPill({ next }: { next: NextAction }) {
  const tone = next.tone === "neutral" ? "grey" : next.tone;
  return (
    <span className={`ent-pill ${PILL}`} data-tone={tone} data-next-action={next.kind} data-next-tone={next.tone}>
      {next.label}
    </span>
  );
}

/** Name over a muted second line. */
export function TwoLine({ top, sub }: { top: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 leading-tight">
      <div className="truncate text-[13px] font-semibold text-ink">{top}</div>
      {sub != null && sub !== "" && <div className="truncate text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

/**
 * The wide search box of the board: typing is debounced, Enter sends at once, Esc clears, and a value that changes from outside (the URL,
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
    <div role="search" className="relative min-w-0 flex-1">
      <SearchIcon aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--pl-icon)]" />
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
        className="!h-10 !rounded-[10px] !border-[color:var(--pl-blue-line)] !bg-[color:var(--ent-field-bg)] !py-0 pl-9 !text-[12.5px]"
      />
    </div>
  );
}
