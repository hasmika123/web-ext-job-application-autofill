"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon } from "./icons";
import { cn } from "./cn";

/**
 * SavedTick - the small inline "saved" check shown beside the control or field the user just changed
 * (Notion-style autosave: no Save buttons, quiet proof that the edit stuck). Pair it with `useSavedFlash`:
 *
 *   const saved = useSavedFlash();            // one per surface
 *   ... saved.flash("name");                  // when "name" has persisted
 *   <SavedTick flash={saved} id="name" />     // next to the control
 *
 * The check shows for `durationMs` (default 1 s) and fades out over its last part; with reduced motion it just
 * appears and disappears. It is decorative-but-announced: an image labelled "Saved" while it is on screen.
 */
export const SAVED_TICK_MS = 1000;

export interface SavedFlash<K extends string = string> {
  /** The key that is showing its tick right now, or null. */
  active: K | null;
  /** Bumped on every `flash`, so repeating a key restarts the animation. */
  nonce: number;
  flash: (key: K) => void;
}

export function useSavedFlash<K extends string = string>(durationMs: number = SAVED_TICK_MS): SavedFlash<K> {
  const [state, setState] = useState<{ key: K; n: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback(
    (key: K) => {
      if (timer.current !== null) clearTimeout(timer.current);
      setState((prev) => ({ key, n: (prev?.n ?? 0) + 1 }));
      timer.current = setTimeout(() => {
        timer.current = null;
        setState(null);
      }, durationMs);
    },
    [durationMs],
  );
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return useMemo(() => ({ active: state?.key ?? null, nonce: state?.n ?? 0, flash }), [state, flash]);
}

export interface SavedTickProps<K extends string = string> {
  flash: SavedFlash<K>;
  /** The key this tick belongs to; it renders only while `flash.active === id`. */
  id: K;
  label?: string;
  /** Total time on screen, must match the hook's `durationMs` (drives the fade). */
  durationMs?: number;
  className?: string;
}

const KEYFRAMES =
  "@keyframes kiwi-saved-tick{0%{opacity:0;transform:scale(.7)}12%{opacity:1;transform:scale(1)}65%{opacity:1}100%{opacity:0}}" +
  "@media (prefers-reduced-motion:reduce){[data-saved-tick]{animation:none!important}}";

export default function SavedTick<K extends string = string>({ flash, id, label = "Saved", durationMs = SAVED_TICK_MS, className }: SavedTickProps<K>) {
  if (flash.active !== id) return null;
  return (
    <span
      key={flash.nonce}
      role="img"
      aria-label={label}
      data-saved-tick={id}
      style={{ animation: `kiwi-saved-tick ${durationMs}ms ease-out forwards` }}
      className={cn("pointer-events-none inline-flex flex-none items-center justify-center rounded-full bg-ok p-0.5 text-white", className)}
    >
      <style>{KEYFRAMES}</style>
      <CheckIcon className="h-3 w-3" strokeWidth={3.5} />
    </span>
  );
}
