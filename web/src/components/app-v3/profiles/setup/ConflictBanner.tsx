"use client";

import { Button } from "@kiwiply/ui";

/**
 * The draft was saved from another device since this one last synced (DESIGN 5.13 / 7.4, DECISIONS #33g): never a silent
 * last-writer-wins, so the person picks. "Use that" loads the other device's draft; "Keep mine" saves this one over it.
 * Until they choose, this device keeps its own copy on the device and stops sending.
 */
export default function ConflictBanner({ onUseThat, onKeepMine, busy }: { onUseThat: () => void; onKeepMine: () => void; busy?: boolean }) {
  return (
    <div role="alert" data-testid="conflict-banner" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-danger/40 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] px-3 py-2.5 text-[13.5px] text-v2-navy">
      <span className="min-w-0 flex-1 basis-56 font-medium">This was updated on another device. Use that version?</span>
      <span className="flex flex-none gap-2">
        <Button size="sm" variant="accent" onClick={onUseThat} disabled={busy} className="max-sm:min-h-11">
          Use that
        </Button>
        <Button size="sm" variant="ghost" onClick={onKeepMine} disabled={busy} className="max-sm:min-h-11">
          Keep mine
        </Button>
      </span>
    </div>
  );
}
