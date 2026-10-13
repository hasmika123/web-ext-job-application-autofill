"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@kiwiply/ui";
import { Button } from "@/components/ui";
import type { ChangeSummary } from "@/lib/ent/roles";
import ChangeList from "./ChangeList";

export interface ConfirmSpec {
  title: string;
  /** One sentence of consequence, above the list. */
  intro: ReactNode;
  confirmLabel: string;
  summary: ChangeSummary;
  /** Runs the write; `null` closes the dialog, a string stays and shows the refusal under the list. */
  run: () => Promise<string | null>;
}

/**
 * The explicit confirm step before a permission change is written (HIGH risk: the API audits it). Permissions are NOT autosaved:
 * the admin sees exactly what is added, removed and moved, then confirms. A refusal from the API (ceiling, a newer version, ...)
 * stays here as one sentence, so nothing is lost and nothing half-applies.
 */
export default function ConfirmChangesDialog({ spec, onClose, labelOf }: { spec: ConfirmSpec | null; onClose: () => void; labelOf: (key: string) => string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setError(null);
    onClose();
  }

  async function go() {
    if (!spec || busy) return;
    setBusy(true);
    setError(null);
    let out: string | null;
    try {
      out = await spec.run();
    } catch {
      out = "Something went wrong. Try again.";
    }
    setBusy(false);
    if (out) setError(out);
    else onClose();
  }

  return (
    <Dialog
      open={spec !== null}
      onClose={close}
      title={spec?.title ?? ""}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={busy} data-confirm-cancel>
            Keep editing
          </Button>
          <Button onClick={go} disabled={busy} data-confirm-go>
            {busy ? "Saving…" : (spec?.confirmLabel ?? "Confirm")}
          </Button>
        </div>
      }
    >
      {spec && (
        <div data-confirm-changes className="flex flex-col gap-3">
          <p className="text-[13.5px] leading-relaxed text-ink-soft">{spec.intro}</p>
          <ChangeList summary={spec.summary} labelOf={labelOf} />
          {error && (
            <p role="alert" data-confirm-error className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-[13px] text-ink">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
