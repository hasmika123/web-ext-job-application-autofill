"use client";

import { useEffect } from "react";
import type { Resumed } from "@/lib/onboarding/useDraftSync";
import { useReaction } from "./delight/useCompanionLines";

/**
 * The one-line "you're back" notice on the first screen after resuming (DESIGN 5.12, kept copy): "Picked up where you
 * left off — 3 of 7 done." on the same device, "Picked up from your other device." when the server's draft beat the local
 * copy. Quiet, polite, and with the way out: Start over (delete the draft, keep the persona and everything confirmed).
 */
export default function ResumeBanner({ resumed, onStartOver, busy }: { resumed: Pick<Resumed, "device" | "stepsDone" | "stepsTotal">; onStartOver: () => void; busy?: boolean }) {
  // The companion waves hello on arrival (R1.14, DELIGHT 2.5); a reaction, so the screen's own line returns after it.
  const react = useReaction();
  const device = resumed.device;
  useEffect(() => {
    react("wave", device === "other" ? "resume.other" : "resume.back");
  }, [react, device]);
  return (
    <p role="status" data-testid="resume-banner" className="rounded-xl bg-paper-2 px-3 py-2 text-[13px] text-v2-ink-soft">
      {resumed.device === "other" ? "Picked up from your other device." : `Picked up where you left off — ${resumed.stepsDone} of ${resumed.stepsTotal} done.`}{" "}
      <button type="button" onClick={onStartOver} disabled={busy} className="font-semibold text-v2-blue hover:underline disabled:opacity-50 max-sm:min-h-11">
        Start over
      </button>
    </p>
  );
}
