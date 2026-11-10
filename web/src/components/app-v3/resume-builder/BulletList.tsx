"use client";

import type { FocusEvent, KeyboardEvent } from "react";
import { PlusIcon, allowedMarks } from "@kiwiply/ui";
import type { ResumeBullet, ResumeListStyle, ResumeMark } from "@kiwiply/ui";
import RewriteMenu from "./ai/RewriteMenu";
import { useCanvas, useField } from "./canvasContext";
import { ScopedMarkToolbar } from "./MarkToolbar";
import MarkedTextarea from "./MarkedTextarea";
import { MarkScope, useMarkScope } from "./markScope";
import { nowMs } from "./state/clock";
import { newId } from "./state/ids";

/**
 * The bullets of one item: an inline list of marked textareas with a disc (or `1.` when the item's
 * list style is numbered). Enter starts a new bullet (splitting at the caret); Backspace in an
 * empty one deletes it and at the start of a non-empty one merges it into the bullet above; Ctrl/Cmd
 * with the arrow keys moves the focused bullet. Each bullet is a `MarkedTextarea` (R2.11): the
 * item's bullets share one mark toolbar, which floats above the list while one of them has focus.
 */
export default function BulletList(props: { sectionId: string; itemId: string; bullets: ResumeBullet[]; listStyle?: ResumeListStyle | null }) {
  return (
    <MarkScope>
      <Bullets {...props} />
    </MarkScope>
  );
}

function Bullets({
  sectionId,
  itemId,
  bullets,
  listStyle,
}: {
  sectionId: string;
  itemId: string;
  bullets: ResumeBullet[];
  listStyle?: ResumeListStyle | null;
}) {
  const { dispatch, limits, requestFocus, aiAllowed, aiVisible, ai } = useCanvas();
  const scope = useMarkScope();

  const addBullet = () => {
    const bulletId = newId("b");
    requestFocus({ field: bulletId, caret: 0 });
    dispatch({ type: "bullet/add", sectionId, itemId, bulletId, at: nowMs() });
  };

  // Focus left the whole list (and its toolbar): nothing to format until a bullet is focused again.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scope?.clear();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, bullet: ResumeBullet, i: number) => {
    if (e.nativeEvent.isComposing) return; // IME composition: Enter/Backspace belong to the IME
    const el = e.currentTarget;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const to = e.key === "ArrowUp" ? i - 1 : i + 1;
      if (to < 0 || to >= bullets.length) return;
      requestFocus({ field: bullet.id, caret: el.selectionStart });
      dispatch({ type: "bullet/move", sectionId, itemId, bulletId: bullet.id, to, at: nowMs() });
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (bullets.length >= limits.bullets) return;
      const before = el.value.slice(0, el.selectionStart);
      const after = el.value.slice(el.selectionEnd);
      const newBulletId = newId("b");
      requestFocus({ field: newBulletId, caret: 0 });
      dispatch({ type: "bullet/split", sectionId, itemId, bulletId: bullet.id, before, after, newBulletId, at: nowMs() });
      return;
    }
    if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (bullet.text === "") {
        e.preventDefault();
        const neighbour = bullets[i - 1] ?? bullets[i + 1];
        if (neighbour) requestFocus({ field: neighbour.id, caret: i > 0 ? "end" : 0 });
        dispatch({ type: "bullet/remove", sectionId, itemId, bulletId: bullet.id, at: nowMs() });
      } else if (i > 0) {
        const prev = bullets[i - 1];
        if (prev.text.length + bullet.text.length > limits.bulletChars) return;
        e.preventDefault();
        requestFocus({ field: prev.id, caret: prev.text.length });
        dispatch({ type: "bullet/mergeUp", sectionId, itemId, bulletId: bullet.id, at: nowMs() });
      }
    }
  };

  return (
    <div className="relative" onBlur={onBlur}>
      {scope?.target && <ScopedMarkToolbar className="absolute -top-10 right-0 z-20" />}
      <ul className="flex flex-col gap-1">
        {bullets.map((b, i) => (
          <li key={b.id} className="flex items-start gap-2">
            {listStyle === "number" ? (
              <span aria-hidden className="mt-1.5 w-4 flex-none text-right text-[13px] tabular-nums text-ink-soft">
                {i + 1}.
              </span>
            ) : (
              <span aria-hidden className="mt-3 h-1.5 w-1.5 flex-none rounded-full bg-ink-soft" />
            )}
            <BulletBox
              bullet={b}
              index={i}
              listStyle={listStyle ?? null}
              onListStyle={(style) => dispatch({ type: "list/set", sectionId, itemId, style, at: nowMs() })}
              onKeyDown={(e) => onKeyDown(e, b, i)}
              onText={(text, marks, format) => dispatch({ type: "bullet/edit", sectionId, itemId, bulletId: b.id, text, marks, format, at: nowMs() })}
            />
            {/* "Rewrite this bullet" (R4.2): one line, any mode; Free sees the lock. An empty bullet has nothing to rewrite. */}
            {aiVisible && b.text.trim() !== "" && (
              <RewriteMenu
                variant="bullet"
                locked={!aiAllowed}
                subject={`bullet ${i + 1}`}
                className="mt-0.5 flex-none"
                onPick={(mode) => ai.start({ refs: [b.id], scope: "This bullet", from: "bullet" }, mode)}
                onLockedClick={() => ai.onLocked("bullet")}
              />
            )}
          </li>
        ))}
      </ul>
      <div className={bullets.length > 0 ? "mt-1.5" : ""}>
        <button
          type="button"
          disabled={bullets.length >= limits.bullets}
          onClick={addBullet}
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink disabled:pointer-events-none disabled:opacity-50 max-sm:min-h-11"
        >
          <PlusIcon className="h-3 w-3" /> Add bullet
        </button>
      </div>
    </div>
  );
}

function BulletBox({
  bullet,
  index,
  listStyle,
  onListStyle,
  onKeyDown,
  onText,
}: {
  bullet: ResumeBullet;
  index: number;
  listStyle: ResumeListStyle | null;
  onListStyle: (style: ResumeListStyle | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onText: (text: string, marks: ResumeMark[], format?: boolean) => void;
}) {
  const { limits, caps } = useCanvas();
  const field = useField(bullet.id);
  return (
    <MarkedTextarea
      {...field}
      aria-label={`Bullet ${index + 1}`}
      value={bullet.text}
      marks={bullet.marks}
      allowed={allowedMarks(caps)}
      listStyle={listStyle}
      onListStyle={onListStyle}
      maxLength={limits.bulletChars}
      placeholder={index === 0 ? "What you did and the result, e.g. Cut page load time 40%" : undefined}
      textClass="text-[14px] leading-snug"
      className="flex-1"
      onChange={(text, marks) => onText(text, marks)}
      onFormat={(marks) => onText(bullet.text, marks, true)}
      onKeyDown={onKeyDown}
    />
  );
}
