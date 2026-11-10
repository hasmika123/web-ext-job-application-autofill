"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Input, SavedTick, cn } from "@kiwiply/ui";
import { SOURCE_LABEL } from "@/lib/admin-client";
import type { Source } from "@/lib/admin-client";
import { StatusChip } from "@/components/app-v2/common";
import { useAdminSave } from "./useAdminSave";
import type { AdminSaveOutcome } from "./useAdminSave";

/**
 * The small pieces every autosaving control shares (lifted from the AI page's `controls.tsx`, E2E-A15.0). They read the
 * nearest `AdminSaveProvider` (`useAdminSave`), so the tick, the busy state and the inline error are keyed by the same
 * `key` the control passes to `save()`.
 */

/** The ✓ that follows a control for a moment after its change was saved. */
export function Tick({ k, className }: { k: string; className?: string }) {
  const { flash } = useAdminSave();
  return <SavedTick flash={flash} id={k} className={cn("ml-0.5", className)} />;
}

/** The API's refusal, in red under the control. `local` is a client-side message (a draft not worth sending). */
export function FieldError({ k, local }: { k: string; local?: string | null }) {
  const { error } = useAdminSave();
  const msg = local ?? error(k);
  if (!msg) return null;
  return (
    <p role="alert" className="mt-1 text-[12.5px] leading-snug text-danger-text">
      {msg}
    </p>
  );
}

/** "Admin / Env / Default" chip and, when an admin value overrides env, the "overrides env · Reset" link. */
export function SourceTag({ source, onReset, what, resetBusy, className }: { source: Source; onReset?: () => void; what: string; resetBusy?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5", className)}>
      <StatusChip tone={source === "db" ? "blue" : "slate"} className="px-2 py-0.5 text-[11px]">
        {SOURCE_LABEL[source]}
      </StatusChip>
      {source === "db" && onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={resetBusy}
          aria-label={`Reset ${what} to default`}
          title="Reset to default"
          className="inline-flex min-h-11 items-center text-[12px] font-semibold text-v2-blue-ink hover:underline disabled:opacity-60 sm:min-h-0"
        >
          overrides env · Reset
        </button>
      )}
    </span>
  );
}

/**
 * A text / number box that saves on blur or Enter (never per keystroke). Escape puts the saved value back. `onCommit`
 * does the save; a refusal reverts the box (the message shows under it).
 */
export function AutosaveInput({
  k,
  label,
  value,
  onCommit,
  type = "text",
  inputMode,
  placeholder,
  validate,
  disabled,
  className,
  suffix,
}: {
  k: string;
  label: string;
  value: string;
  onCommit: (next: string) => Promise<AdminSaveOutcome> | void;
  type?: "text" | "number";
  inputMode?: "text" | "numeric" | "decimal" | "url";
  placeholder?: string;
  /** Returns a message when the draft is not worth sending. */
  validate?: (draft: string) => string | null;
  disabled?: boolean;
  className?: string;
  suffix?: ReactNode;
}) {
  const a = useAdminSave();
  const [draft, setDraft] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const skipBlur = useRef(false);
  const shown = draft ?? a.shown(k, value);

  async function commit() {
    if (draft === null) return;
    const next = draft.trim();
    if (next === value.trim()) {
      setDraft(null);
      setLocal(null);
      return;
    }
    const bad = validate?.(next) ?? null;
    if (bad) {
      setLocal(bad);
      return;
    }
    setLocal(null);
    setDraft(null);
    await onCommit(next);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      skipBlur.current = true;
      void commit().finally(() => {
        skipBlur.current = false;
      });
    } else if (e.key === "Escape") {
      setDraft(null);
      setLocal(null);
    }
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-2">
        <Input
          type={type}
          inputMode={inputMode}
          aria-label={label}
          aria-busy={a.busy(k) || undefined}
          aria-invalid={local || a.error(k) ? true : undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={shown}
          onChange={(e) => {
            setDraft(e.target.value);
            setLocal(null);
            a.clearError(k);
          }}
          onBlur={() => {
            if (!skipBlur.current) void commit();
          }}
          onKeyDown={onKey}
          className="min-w-0 flex-1"
        />
        {suffix}
        <Tick k={k} />
      </div>
      <FieldError k={k} local={local} />
    </div>
  );
}

/** A label above a control (used by the stacked / sheet layouts). */
export function LabeledField({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="min-w-0">
      <p id={id} className="mb-1 text-[12.5px] font-semibold text-ink">
        {label}
      </p>
      {children}
      {hint && <p className="mt-1 text-[12px] text-v2-muted">{hint}</p>}
    </div>
  );
}
