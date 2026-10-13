"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input, MemberAvatar, SearchIcon, Spinner } from "@kiwiply/ui";
import { groupsApi, type PersonOption } from "@/lib/ent/groups";

export const PERSON_SEARCH_MS = 250; // config-literal-ok: how long typing rests before the people list is asked (UI timing)

/**
 * A search box over the organization's ACTIVE people (the API narrows the list to what the caller's scope reaches). Picking
 * someone calls `onPick`; the parent decides whether that sets a lead or adds a member. Nothing here shows an email.
 */
export default function PersonSearch({
  orgId,
  label,
  placeholder = "Search by name",
  exclude = [],
  onPick,
  disabled,
}: {
  orgId: number | string;
  label: string;
  placeholder?: string;
  exclude?: number[];
  onPick: (p: PersonOption) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PersonOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the busy flag brackets the debounced fetch below
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await groupsApi.people(orgId, text.trim());
      if (mine !== seq.current) return;
      setBusy(false);
      setFailed(!r.ok);
      setRows(r.ok ? r.data : []);
    }, text === "" ? 0 : PERSON_SEARCH_MS);
    return () => clearTimeout(t);
  }, [text, open, orgId]);

  const shown = rows.filter((p) => !exclude.includes(p.memberId));

  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOpen(false)}>
      <SearchIcon aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <Input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="pl-9"
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label}: results`} className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-line bg-paper p-1 shadow-lg">
          {busy && shown.length === 0 && (
            <li className="flex items-center gap-2 px-3 py-2 text-[13px] text-muted">
              <Spinner width={14} height={14} /> Looking…
            </li>
          )}
          {!busy && failed && <li className="px-3 py-2 text-[13px] text-danger-text">Couldn&apos;t load people. Try again.</li>}
          {!busy && !failed && shown.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">{text.trim() ? "Nobody matches that name." : "No one to add."}</li>}
          {shown.map((p) => (
            <li key={p.memberId} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p);
                  setText("");
                  setOpen(false);
                }}
              >
                <MemberAvatar name={p.name} size={30} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{p.name}</span>
                  <span className="block truncate text-[12px] text-muted">{[p.roleName, p.teamName ?? p.departmentName].filter(Boolean).join(" · ") || "No department yet"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
