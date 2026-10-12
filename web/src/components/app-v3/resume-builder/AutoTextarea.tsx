"use client";

import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn, inputClass } from "@kiwiply/ui";

/**
 * A textarea that grows with its content (a bullet is "a single-line autosizing textarea",
 * DESIGN 3.2). Styled with the design system's `inputClass`. The parent keeps `value` and gets
 * every change; the height follows `value` (also after undo/redo, which change it from outside).
 */
const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function AutoTextarea(
  { className, value, rows = 1, ...props },
  forwardedRef,
) {
  const local = useRef<HTMLTextAreaElement | null>(null);

  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      local.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    const el = local.current;
    if (!el) return;
    el.style.height = "auto";
    // Hidden (display: none, e.g. the other phone tab) measures 0: keep the natural height then.
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return <textarea ref={setRef} rows={rows} value={value} className={cn(inputClass, "resize-none overflow-hidden leading-snug", className)} {...props} />;
});

export default AutoTextarea;
