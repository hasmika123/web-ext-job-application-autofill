"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { CheckIcon, Input, cn } from "@kiwiply/ui";
import type { AdminOutcome } from "@/lib/admin-client";

const FLASH_MS = 1600; // config-literal-ok: how long the saved tick stays

/**
 * A box that saves when you leave it (blur or Enter), never per keystroke; Escape puts the saved value back. `onCommit` sends the
 * change (a draft autosave) and answers with the outcome: a refusal stays under the box and the box shows the saved value again.
 * `validate` returns a message when the text is not worth sending.
 */
export default function CommitInput({
  label,
  value,
  onCommit,
  validate,
  placeholder,
  inputMode,
  disabled,
  suffix,
  className,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => Promise<AdminOutcome> | AdminOutcome | void;
  validate?: (draft: string) => string | null;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal";
  disabled?: boolean;
  suffix?: ReactNode;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const skipBlur = useRef(false);

  async function commit() {
    if (draft === null) return;
    const next = draft.trim();
    if (next === value.trim()) {
      setDraft(null);
      setProblem(null);
      return;
    }
    const bad = validate?.(next) ?? null;
    if (bad) {
      setProblem(bad);
      return;
    }
    setProblem(null);
    const out = await onCommit(next);
    setDraft(null);
    if (out && !out.ok) setProblem(out.error);
    else {
      setFlash(true);
      setTimeout(() => setFlash(false), FLASH_MS);
    }
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-2">
        <Input
          inputMode={inputMode}
          aria-label={label}
          aria-invalid={problem ? true : undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={draft ?? value}
          onChange={(e) => {
            setDraft(e.target.value);
            setProblem(null);
          }}
          onBlur={() => {
            if (!skipBlur.current) void commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              skipBlur.current = true;
              void commit().finally(() => {
                skipBlur.current = false;
              });
            } else if (e.key === "Escape") {
              setDraft(null);
              setProblem(null);
            }
          }}
          className="min-w-0 flex-1"
        />
        {suffix}
        {flash && <CheckIcon size={16} role="img" aria-label="Saved" className="flex-none text-accent-deep" />}
      </div>
      {problem && (
        <p role="alert" className="mt-1 text-[12.5px] leading-snug text-danger-text">
          {problem}
        </p>
      )}
    </div>
  );
}

/** Whole non-negative number, or blank for "use the service default" (null). */
export function parseCount(text: string): number | null | undefined {
  const t = text.trim();
  if (t === "") return null;
  return /^\d{1,9}$/.test(t) ? Number(t) : undefined;
}
