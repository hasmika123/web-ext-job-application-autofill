"use client";

import { useEffect, useState } from "react";
import { SaveStatusChip } from "@kiwiply/ui";
import type { UseAutosaveResult } from "@/lib/autosave";
import { useOnline } from "../resume-builder/useOnline";

/** How often the "Saved 5 minutes ago" wording is refreshed. */
const TICK_MS = 30_000; // config-literal-ok: UI refresh cadence of a relative-time label, not a product tunable

/**
 * The page kit's save chip wired to a `useAutosave` result: it follows the browser's online state and re-words
 * "Saved 5 minutes ago" on its own. One per autosaving thing on the sheet (the next step, a note, an interview).
 */
export default function AutosaveChip({ autosave, className }: { autosave: UseAutosaveResult; className?: string }) {
  const online = useOnline();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <SaveStatusChip
      status={autosave.status}
      savedAt={autosave.savedAt}
      now={Math.max(now, autosave.savedAt ?? 0)}
      error={autosave.error}
      online={online}
      onRetry={autosave.retry}
      className={className}
    />
  );
}
