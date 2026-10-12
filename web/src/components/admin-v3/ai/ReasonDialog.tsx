"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { BottomSheet, Button, Dialog, Input } from "@kiwiply/ui";
import type { AiFail } from "@/lib/ai-admin";
import { useNarrow } from "./useNarrow";

/**
 * The confirm-with-reason step before a HIGH-risk change (AI-ADMIN-CONFIG-DESIGN 5; copy in 5.3): a title, one sentence
 * of consequence, a **required** reason and `[Turn off] [Cancel]`. A Dialog on a desktop, a BottomSheet on a phone.
 * Turning things ON never comes here. A refusal from the API stays inside the dialog; `forceLabel` adds a second
 * danger button for the one refusal that can be overridden (a provider that routes still use).
 */
export interface ReasonSpec {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Offered after a 409 AI_PROVIDER_IN_USE: sends the same change with force. */
  forceLabel?: string;
  run: (reason: string, force: boolean) => Promise<{ ok: true } | AiFail>;
}

function ReasonForm({ spec, onClose }: { spec: ReasonSpec; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceable, setForceable] = useState(false);

  async function go(force: boolean) {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    const out = await spec.run(reason.trim(), force);
    setBusy(false);
    if (out.ok) {
      onClose();
      return;
    }
    setError(out.error);
    setForceable(out.code === "AI_PROVIDER_IN_USE" && !!spec.forceLabel);
  }

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void go(false);
      }}
      className="space-y-3"
    >
      <div className="text-[14px] leading-relaxed text-ink">{spec.body}</div>
      <label className="block">
        <span className="mb-1 block text-[12.5px] font-semibold text-ink">Reason (required)</span>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Gemini 5xx spike"
          autoFocus
          maxLength={200} // config-literal-ok: the audit log's reason column is 200 chars wide
        />
      </label>
      {error && (
        <p role="alert" className="text-[12.5px] leading-snug text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {forceable && spec.forceLabel && (
          <Button type="button" variant="danger" onClick={() => void go(true)} disabled={busy || !reason.trim()}>
            {spec.forceLabel}
          </Button>
        )}
        <Button type="submit" variant="danger" disabled={busy || !reason.trim()}>
          {busy ? "Working…" : spec.confirmLabel}
        </Button>
      </div>
    </form>
  );
}

export default function ReasonDialog({ spec, onClose }: { spec: ReasonSpec | null; onClose: () => void }) {
  const narrow = useNarrow();
  if (narrow) {
    return (
      <BottomSheet id="ai-reason-sheet" open={spec !== null} onClose={onClose} title={spec?.title ?? ""}>
        {spec && <ReasonForm spec={spec} onClose={onClose} />}
      </BottomSheet>
    );
  }
  return (
    <Dialog open={spec !== null} onClose={onClose} title={spec?.title}>
      {spec && <ReasonForm spec={spec} onClose={onClose} />}
    </Dialog>
  );
}
