"use client";

import { useState } from "react";
import { cn } from "@kiwiply/ui";
import { useField } from "./canvasContext";
import { GHOST } from "./canvasStyles";
import { DATE_OK, formatDate, parseDateInput } from "./dates";

/**
 * A month-year field. The document stores `YYYY` / `YYYY-MM`; the field shows "Mar 2022" and accepts
 * "Mar 2022", "03/2022", "2022-03" or "2022". Only valid values (or empty) reach the document, so
 * autosave never sends a date the server would answer 422 to: while the text is incomplete it lives in
 * a local draft with an inline hint. The draft remembers the document value it was typed over, so an
 * undo / redo (which changes that value) shows the document again instead of a stale draft.
 */
export default function DateField({
  fieldId,
  label,
  value,
  onCommit,
  disabled,
  placeholder = "Mar 2022",
  className,
}: {
  /** The `data-field` id of the input. */
  fieldId: string;
  label: string;
  /** The stored value (`YYYY`, `YYYY-MM` or empty). */
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const field = useField(fieldId);
  const [draft, setDraft] = useState<{ text: string; base: string } | null>(null);
  const live = draft && draft.base === value ? draft : null;
  const shown = live ? live.text : formatDate(value);
  const invalid = live !== null && live.text.trim() !== "" && !DATE_OK.test(parseDateInput(live.text));
  const hintId = `${fieldId}-hint`;

  return (
    <span className={cn("inline-flex min-w-0 flex-col", className)}>
      <input
        {...field}
        aria-label={label}
        aria-invalid={invalid || field["aria-invalid"] ? true : undefined}
        aria-describedby={invalid ? hintId : undefined}
        value={disabled ? "" : shown}
        disabled={disabled}
        placeholder={disabled ? "Present" : placeholder}
        autoComplete="off"
        // config-literal-ok: longest accepted text ("September 2022"), a field-width bound
        maxLength={16}
        className={cn(GHOST, "text-[13px] text-ink-soft")}
        onChange={(e) => {
          const text = e.target.value;
          const parsed = parseDateInput(text);
          if (parsed === "" || DATE_OK.test(parsed)) {
            // Valid: commit it, but keep what was typed on screen until the field is left.
            setDraft(parsed === formatDate(value) || parsed === value ? null : { text, base: parsed === "" ? "" : parsed });
            onCommit(parsed);
          } else {
            setDraft({ text, base: value });
          }
        }}
        onBlur={() => setDraft(null)}
      />
      {invalid && (
        <span id={hintId} role="alert" className="px-1.5 text-[11px] text-danger">
          Try Mar 2022 or 2022
        </span>
      )}
    </span>
  );
}
