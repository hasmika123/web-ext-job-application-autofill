"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { notifyExtension } from "@/lib/extension-signal";
import { FIELD_LABELS, FIELD_OPTIONS } from "@/lib/profile-options";

/**
 * "We learned N things about you — keep these?" (Phase 10.3e, Tier C of the self-building profile).
 *
 * Each row is an answer the extension saw the user give while applying, offered back as a
 * profile value. Keep writes it into the profile; Edit lets them adjust it first; Dismiss means
 * it's never suggested again. Nothing reaches the profile any other way. The server decides what
 * is worth showing (blank fields at once, changes only after two applications), so this card just
 * renders the list it's given and disappears when it's empty.
 */

export type Suggestion = {
  id: number;
  fieldKey: string;
  value: string;
  currentValue: string;
};

function Row({ s, onDone }: { s: Suggestion; onDone: (id: number, kept: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = FIELD_LABELS[s.fieldKey] ?? s.fieldKey;
  const options = FIELD_OPTIONS[s.fieldKey];
  const inputId = `suggestion-${s.id}`;

  async function decide(action: "accept" | "dismiss", value?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/suggestions/${s.id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: value === undefined ? undefined : JSON.stringify({ value }),
      });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save that. Please try again.");
        return;
      }
      // 404 = already decided elsewhere (another tab): just drop the row.
      onDone(s.id, action === "accept" && res.ok);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-[var(--radius)] border border-line p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* A floor on the text column so the buttons wrap below it on a phone instead of covering it. */}
        <div className="min-w-[12rem] flex-1 break-words">
          <div className="text-[12.5px] font-semibold text-muted">{label}</div>
          {editing ? (
            <div className="mt-1.5 max-w-sm">
              {options ? (
                <Select id={inputId} aria-label={label} value={draft} onChange={setDraft}>
                  {options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={inputId}
                  aria-label={label}
                  value={draft}
                  maxLength={500}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draft.trim()) void decide("accept", draft.trim());
                    if (e.key === "Escape") setEditing(false);
                  }}
                />
              )}
            </div>
          ) : (
            <div className="mt-0.5 text-sm text-ink">
              {s.currentValue ? (
                <>
                  <span className="text-muted line-through">{s.currentValue}</span>
                  <span className="mx-1.5 text-muted" aria-hidden>→</span>
                  <span className="sr-only">change to </span>
                  <b className="font-semibold">{s.value}</b>
                </>
              ) : (
                <b className="font-semibold">{s.value}</b>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-none items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() => void decide("accept", draft.trim())}
                className={cn(buttonVariants("accent", "sm"), "disabled:opacity-50")}
              >
                Save
              </button>
              <button type="button" disabled={busy} onClick={() => setEditing(false)} className={buttonVariants("ghost", "sm")}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide("accept")}
                className={cn(buttonVariants("accent", "sm"), "disabled:opacity-50")}
                aria-label={`Keep ${label}: ${s.value}`}
              >
                Keep
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft(options && !options.includes(s.value) ? options[0] : s.value);
                  setEditing(true);
                }}
                className={buttonVariants("ghost", "sm")}
                aria-label={`Edit ${label} before keeping`}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide("dismiss")}
                className="px-1.5 text-[12.5px] font-semibold text-muted hover:text-ink hover:underline disabled:opacity-50"
                aria-label={`Dismiss ${label}: ${s.value}`}
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] font-medium text-danger">{error}</p>
      )}
    </li>
  );
}

export default function SuggestionsCard({ initial }: { initial: Suggestion[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [keptAny, setKeptAny] = useState(false);

  if (!items.length && !keptAny) return null;

  function onDone(id: number, kept: boolean) {
    setItems((list) => list.filter((s) => s.id !== id));
    if (kept) {
      setKeptAny(true);
      // The profile changed: tell the extension to pull, and refresh the dashboard's checklist.
      notifyExtension("changed");
      router.refresh();
    }
  }

  const n = items.length;
  return (
    <section
      aria-labelledby="suggestions-title"
      className="rounded-[var(--radius-lg)] border border-line bg-paper p-[22px] shadow-[var(--shadow)]"
    >
      {n ? (
        <>
          <h2 id="suggestions-title" className="font-display text-lg font-semibold text-ink">
            We learned {n} thing{n === 1 ? "" : "s"} about you — keep {n === 1 ? "it" : "these"}?
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            From answers you gave while applying. Nothing changes in your profile unless you keep it.
          </p>
          <ul className="mt-4 flex flex-col gap-2.5">
            {items.map((s) => (
              <Row key={s.id} s={s} onDone={onDone} />
            ))}
          </ul>
        </>
      ) : (
        <p id="suggestions-title" role="status" className="text-sm font-semibold text-accent-deep">
          Saved to your profile. Kiwiply will fill it from now on.
        </p>
      )}
    </section>
  );
}
