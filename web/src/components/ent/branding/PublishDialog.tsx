"use client";

import { useState } from "react";
import { ArrowRightIcon, Dialog, isHexColor as isHex } from "@kiwiply/ui";
import { Button } from "@/components/ui";
import type { ChangeRow } from "@/lib/ent/branding";

/** The value of one side of a changed row: a swatch and the code for colours, plain text otherwise. */
function Side({ row, value }: { row: ChangeRow; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {row.colour && isHex(value) ? <span aria-hidden className="h-4 w-4 flex-none rounded border border-line" style={{ background: value }} /> : null}
      <span className="min-w-0 break-words">{value}</span>
    </span>
  );
}

/**
 * The explicit Publish step (X2.18): everything that will change on the live sign-in page, key by key, then one button.
 * Publishing is the only deliberate action on the page; editing the draft never goes live.
 */
export default function PublishDialog({
  open,
  rows,
  onClose,
  onPublish,
}: {
  open: boolean;
  rows: ChangeRow[];
  onClose: () => void;
  /** Resolves null on success, else the sentence to show under the list. */
  onPublish: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const problem = await onPublish();
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) {
          setError(null);
          onClose();
        }
      }}
      title="Publish branding"
      description="Your sign-in page changes for everyone as soon as you publish."
      dismissable={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy} className="max-sm:min-h-11">
            Not yet
          </Button>
          <Button variant="accent" onClick={go} disabled={busy || rows.length === 0} className="max-sm:min-h-11" data-publish-confirm>
            {busy ? "Publishing…" : "Publish now"}
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing has changed since the last publish.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-[var(--radius)] border border-line" aria-label="Changes to publish" data-publish-diff>
          {rows.map((r) => (
            <li key={r.key} className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between" data-diff-row={r.key}>
              <span className="font-semibold text-ink">{r.label}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-2 text-ink-soft">
                <Side row={r} value={r.from} />
                <ArrowRightIcon className="h-3.5 w-3.5 flex-none text-muted" aria-label="changes to" />
                <Side row={r} value={r.to} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger-text" data-publish-error>
          {error}
        </p>
      )}
    </Dialog>
  );
}
