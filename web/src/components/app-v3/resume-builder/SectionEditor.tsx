"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent } from "react";
import { Button, Field, IconButton, Input, PlusIcon, TrashIcon } from "@kiwiply/ui";
import type { ExperienceItem, ResumeBullet, ResumeSection } from "@kiwiply/ui";
import AutoTextarea from "./AutoTextarea";
import { nowMs } from "./state/clock";
import { newId } from "./state/ids";
import { MAX_BULLETS, MAX_BULLET_CHARS, MAX_ITEMS, MAX_SHORT_CHARS, MAX_SUMMARY_CHARS } from "./state/reducer";
import type { EditorAction, ItemTextField } from "./state/types";

/** Where to put the caret once the next render has the bullet in the DOM. */
interface PendingFocus {
  bulletId: string;
  caret: number | "end";
}
type RequestFocus = (f: PendingFocus) => void;

/** Same rule as the server validator: `YYYY` or `YYYY-MM`. */
export const DATE_OK = /^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/;

/** `MM/YYYY`, `M/YYYY` and `YYYY/MM` become `YYYY-MM`; anything else is returned trimmed. */
export function normalizeDate(raw: string): string {
  const s = raw.trim();
  const mdy = /^(\d{1,2})[/.](\d{4})$/.exec(s);
  if (mdy) return `${mdy[2]}-${mdy[1].padStart(2, "0")}`;
  const ymd = /^(\d{4})[/.](\d{1,2})$/.exec(s);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}`;
  return s;
}

/**
 * The editor for one section (R0.5: SUMMARY and EXPERIENCE). Inline, no modals: a summary is one
 * textarea; an experience item is a card with title / company / location / dates / "current" and a
 * bullet list. In a bullet, Enter starts a new bullet (splitting at the caret) and Backspace in an
 * empty one deletes it (Backspace at the start of a non-empty one merges it into the bullet above).
 */
export default function SectionEditor({
  section,
  dispatch,
}: {
  section: ResumeSection;
  dispatch: Dispatch<EditorAction>;
}) {
  const pending = useRef<PendingFocus | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const requestFocus = useCallback<RequestFocus>((f) => {
    pending.current = f;
  }, []);

  // After every render: honour a queued focus request (a bullet that just appeared or merged).
  useEffect(() => {
    const p = pending.current;
    if (!p || !root.current) return;
    pending.current = null;
    const el = root.current.querySelector<HTMLTextAreaElement>(`[data-bullet-id="${p.bulletId}"]`);
    if (!el) return;
    el.focus();
    const at = p.caret === "end" ? el.value.length : p.caret;
    el.setSelectionRange(at, at);
  });

  if (section.kind === "SUMMARY") {
    const text = section.items[0]?.text ?? "";
    return (
      <div ref={root}>
        <Field label="Summary" hint={`${text.length} / ${MAX_SUMMARY_CHARS}`}>
          <AutoTextarea
            rows={4}
            maxLength={MAX_SUMMARY_CHARS}
            value={text}
            placeholder="Two or three sentences: who you are, what you do best, what you want next."
            onChange={(e) =>
              dispatch({ type: "summary/edit", sectionId: section.id, text: e.target.value, newItemId: newId("i"), at: nowMs() })
            }
          />
        </Field>
      </div>
    );
  }

  if (section.kind === "EXPERIENCE") {
    const items = section.items;
    return (
      <div ref={root} className="flex flex-col gap-4">
        {items.length === 0 && <p className="text-[13.5px] text-ink-soft">No experience yet. Add your most recent role first.</p>}
        {items.map((item, idx) => (
          <ExperienceCard key={item.id} sectionId={section.id} item={item} index={idx} dispatch={dispatch} requestFocus={requestFocus} />
        ))}
        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={items.length >= MAX_ITEMS}
            onClick={() => {
              const bulletId = newId("b");
              dispatch({ type: "item/add", sectionId: section.id, itemId: newId("i"), bulletId, at: nowMs() });
            }}
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add experience
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={root} className="rounded-xl border border-dashed border-line bg-paper-2/60 p-4 text-[13.5px] text-ink-soft">
      Editing {section.title?.trim() || section.kind.toLowerCase()} arrives in a later release. It still appears in your preview
      exactly as imported.
    </div>
  );
}

function ExperienceCard({
  sectionId,
  item,
  index,
  dispatch,
  requestFocus,
}: {
  sectionId: string;
  item: ExperienceItem;
  index: number;
  dispatch: Dispatch<EditorAction>;
  requestFocus: RequestFocus;
}) {
  const bullets = item.bullets ?? [];
  const current = item.current === true;
  const field = (f: ItemTextField, value: string) =>
    dispatch({ type: "item/field", sectionId, itemId: item.id, field: f, value, at: nowMs() });
  const heading = [item.title?.trim(), item.org?.trim()].filter(Boolean).join(" · ") || `Experience ${index + 1}`;

  return (
    <article aria-label={heading} className="rounded-2xl border border-line bg-paper p-4 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-display text-[15px] font-bold text-ink">{heading}</h3>
        <IconButton
          aria-label={`Remove ${heading}`}
          title="Remove this experience"
          onClick={() => dispatch({ type: "item/remove", sectionId, itemId: item.id, at: nowMs() })}
        >
          <TrashIcon className="h-4 w-4" />
        </IconButton>
      </header>

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Job title">
          <Input value={item.title ?? ""} maxLength={MAX_SHORT_CHARS} onChange={(e) => field("title", e.target.value)} placeholder="Software Engineer" />
        </Field>
        <Field label="Company">
          <Input value={item.org ?? ""} maxLength={MAX_SHORT_CHARS} onChange={(e) => field("org", e.target.value)} placeholder="Acme Inc." />
        </Field>
        <Field label="Location" className="sm:col-span-2">
          <Input value={item.location ?? ""} maxLength={MAX_SHORT_CHARS} onChange={(e) => field("location", e.target.value)} placeholder="Austin, TX" />
        </Field>
        <DateField label="Start" value={item.start ?? ""} onCommit={(v) => field("start", v)} placeholder="2022-06" />
        <DateField
          label="End"
          value={current ? "" : (item.end ?? "")}
          disabled={current}
          onCommit={(v) => field("end", v)}
          placeholder={current ? "Present" : "2024-03"}
        />
      </div>

      <label className="mb-4 flex min-h-11 cursor-pointer items-center gap-2 text-[13.5px] text-ink sm:min-h-0">
        <input
          type="checkbox"
          className="h-4 w-4 accent-accent"
          checked={current}
          onChange={(e) => dispatch({ type: "item/current", sectionId, itemId: item.id, current: e.target.checked, at: nowMs() })}
        />
        I currently work here
      </label>

      <BulletList sectionId={sectionId} itemId={item.id} bullets={bullets} dispatch={dispatch} requestFocus={requestFocus} />
    </article>
  );
}

/**
 * A `YYYY-MM` field. Only valid values (or empty) reach the document, so autosave never sends a
 * date the server would refuse with 422: while the text is incomplete or malformed it lives in a
 * local draft and the field shows the format hint. `MM/YYYY` is accepted and normalised on blur.
 * The draft remembers the document value it was typed over, so an undo/redo (which changes that
 * value) shows the document again instead of a stale draft.
 */
function DateField({
  label,
  value,
  onCommit,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<{ text: string; base: string } | null>(null);
  const shown = draft && draft.base === value ? draft.text : value;
  const invalid = draft !== null && draft.base === value && draft.text !== "" && !DATE_OK.test(draft.text);

  return (
    <Field label={label} hint={disabled ? "Present" : "YYYY-MM"} error={invalid ? "Use YYYY-MM or YYYY" : undefined}>
      <Input
        value={shown}
        disabled={disabled}
        placeholder={placeholder}
        inputMode="numeric"
        maxLength={10}
        onChange={(e) => {
          const text = e.target.value;
          if (text === "" || DATE_OK.test(text)) {
            setDraft(null);
            onCommit(text);
          } else {
            setDraft({ text, base: value });
          }
        }}
        onBlur={() => {
          if (!draft || draft.base !== value) return;
          const n = normalizeDate(draft.text);
          if (n === "" || DATE_OK.test(n)) {
            setDraft(null);
            onCommit(n);
          }
        }}
      />
    </Field>
  );
}

function BulletList({
  sectionId,
  itemId,
  bullets,
  dispatch,
  requestFocus,
}: {
  sectionId: string;
  itemId: string;
  bullets: ResumeBullet[];
  dispatch: Dispatch<EditorAction>;
  requestFocus: RequestFocus;
}) {
  const addBullet = () => {
    const bulletId = newId("b");
    requestFocus({ bulletId, caret: 0 });
    dispatch({ type: "bullet/add", sectionId, itemId, bulletId, at: nowMs() });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, bullet: ResumeBullet, i: number) => {
    if (e.nativeEvent.isComposing) return; // IME composition: Enter/Backspace belong to the IME
    const el = e.currentTarget;
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (bullets.length >= MAX_BULLETS) return;
      const before = el.value.slice(0, el.selectionStart);
      const after = el.value.slice(el.selectionEnd);
      const newBulletId = newId("b");
      requestFocus({ bulletId: newBulletId, caret: 0 });
      dispatch({ type: "bullet/split", sectionId, itemId, bulletId: bullet.id, before, after, newBulletId, at: nowMs() });
      return;
    }
    if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (bullet.text === "") {
        e.preventDefault();
        const neighbour = bullets[i - 1] ?? bullets[i + 1];
        if (neighbour) requestFocus({ bulletId: neighbour.id, caret: i > 0 ? "end" : 0 });
        dispatch({ type: "bullet/remove", sectionId, itemId, bulletId: bullet.id, at: nowMs() });
      } else if (i > 0) {
        const prev = bullets[i - 1];
        if (prev.text.length + bullet.text.length > MAX_BULLET_CHARS) return;
        e.preventDefault();
        requestFocus({ bulletId: prev.id, caret: prev.text.length });
        dispatch({ type: "bullet/mergeUp", sectionId, itemId, bulletId: bullet.id, at: nowMs() });
      }
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-[12.5px] font-semibold text-ink-soft">Bullets</p>
      <ul className="flex flex-col gap-2">
        {bullets.map((b, i) => (
          <li key={b.id} className="flex items-start gap-2">
            <span aria-hidden className="mt-3 h-1.5 w-1.5 flex-none rounded-full bg-ink-soft" />
            <AutoTextarea
              data-bullet-id={b.id}
              aria-label={`Bullet ${i + 1}`}
              value={b.text}
              maxLength={MAX_BULLET_CHARS}
              placeholder={i === 0 ? "What you did and the result, e.g. Cut page load time 40%" : undefined}
              className="min-w-0 flex-1"
              onChange={(e) =>
                dispatch({ type: "bullet/edit", sectionId, itemId, bulletId: b.id, text: e.target.value, at: nowMs() })
              }
              onKeyDown={(e) => onKeyDown(e, b, i)}
            />
          </li>
        ))}
      </ul>
      {bullets.length === 0 && <p className="text-[13px] text-ink-soft">No bullets yet.</p>}
      <div className="mt-2">
        <Button variant="ghost" size="sm" disabled={bullets.length >= MAX_BULLETS} onClick={addBullet}>
          <PlusIcon className="h-3.5 w-3.5" /> Add bullet
        </Button>
      </div>
    </div>
  );
}
