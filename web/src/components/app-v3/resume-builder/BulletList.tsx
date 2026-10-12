"use client";

import type { KeyboardEvent } from "react";
import { PlusIcon, cn } from "@kiwiply/ui";
import type { ResumeBullet, ResumeListStyle } from "@kiwiply/ui";
import AutoTextarea from "./AutoTextarea";
import { useCanvas, useField } from "./canvasContext";
import { GHOST } from "./canvasStyles";
import { nowMs } from "./state/clock";
import { newId } from "./state/ids";

/**
 * The bullets of one item: an inline list of auto-sizing textareas with a disc (or `1.` when the
 * item's list style is numbered). Enter starts a new bullet (splitting at the caret); Backspace in an
 * empty one deletes it and at the start of a non-empty one merges it into the bullet above; Ctrl/Cmd
 * with the arrow keys moves the focused bullet. The mark toolbar's textarea (`MarkedTextarea`,
 * R2.11) replaces `AutoTextarea` here without touching the keyboard model.
 */
export default function BulletList({
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
  const { dispatch, limits, requestFocus } = useCanvas();

  const addBullet = () => {
    const bulletId = newId("b");
    requestFocus({ field: bulletId, caret: 0 });
    dispatch({ type: "bullet/add", sectionId, itemId, bulletId, at: nowMs() });
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
    <div>
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
            <BulletBox bullet={b} index={i} onKeyDown={(e) => onKeyDown(e, b, i)} onText={(text) => dispatch({ type: "bullet/edit", sectionId, itemId, bulletId: b.id, text, at: nowMs() })} />
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
  onKeyDown,
  onText,
}: {
  bullet: ResumeBullet;
  index: number;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onText: (text: string) => void;
}) {
  const { limits } = useCanvas();
  const field = useField(bullet.id);
  return (
    <AutoTextarea
      {...field}
      aria-label={`Bullet ${index + 1}`}
      value={bullet.text}
      maxLength={limits.bulletChars}
      placeholder={index === 0 ? "What you did and the result, e.g. Cut page load time 40%" : undefined}
      bare
      className={cn(GHOST, "flex-1 text-[14px] leading-snug")}
      onChange={(e) => onText(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
