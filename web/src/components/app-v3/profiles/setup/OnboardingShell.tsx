"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ChevronLeftIcon, Dialog, IconButton, Menu, MoreHorizontalIcon, ProgressBar, Tooltip, XIcon, cn } from "@kiwiply/ui";
import type { OfflineReason, SyncStatus } from "@/lib/onboarding/useDraftSync";
import SaveStatusPill, { pillLabel } from "./SaveStatusPill";

export const EXIT_LABEL = "Exit setup — your progress is saved";
export const RESTART_TITLE = "Start over?";
export const RESTART_BODY = "Your confirmed profile stays; only the unfinished steps reset.";

/**
 * The frame of every setup screen (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN 5.0): a slim top bar (‹ Back, the quiet
 * autosave pill, a ⋯ menu, ✕ Exit), ONE 4 px progress bar with its estimate, then the screen. There are no step labels and
 * no numbered dots; the old `Stepper` is not used here.
 *
 * It owns the things that belong to the frame, not to a screen: moving focus to the new screen's `<h1>` and announcing
 * "Step i of n" when the screen changes (DESIGN 14), the slide / crossfade between screens (DESIGN 13, in `globals.css`),
 * the "Start over?" confirm, and the Exit link (the draft is already saved; Exit just leaves). Every icon-only control has
 * a tooltip and an `aria-label`.
 */
export interface OnboardingShellProps {
  /** Identity of the screen on show: focus, the announcement and the slide re-run when it changes. */
  screenKey: string;
  /** Which way the person is travelling, for the slide. */
  direction: "forward" | "back";
  /** 0 to 1: (steps done + how far through the current one) / steps. */
  progress: number;
  /** The label right of the bar ("~2 min", "about 1 min left"); null hides it. */
  label: string | null;
  /** The bar's `aria-valuetext`, "Step 3 of 7, about 1 minute left". */
  valueText: string;
  /** What the polite live region says on a screen change, "Step 3 of 7". */
  announce: string;
  /** Back one screen; null hides it (the first screen). */
  onBack: (() => void) | null;
  sync: { status: SyncStatus; reason: OfflineReason; onRetry: () => void };
  /** ⋯ "Change who I am"; omitted when the persona step is off. */
  onChangePersona?: () => void;
  /** ⋯ "Start over" (after the confirm). */
  onStartOver: () => void;
  /** Called when the person leaves through ✕ or ⋯ Exit (analytics). */
  onExit?: () => void;
  /** The conflict / "picked up" lines, under the bar. */
  banners?: ReactNode;
  children: ReactNode;
}

export default function OnboardingShell({
  screenKey,
  direction,
  progress,
  label,
  valueText,
  announce,
  onBack,
  sync,
  onChangePersona,
  onStartOver,
  onExit,
  banners,
  children,
}: OnboardingShellProps) {
  const router = useRouter();
  const body = useRef<HTMLDivElement>(null);
  const shownKey = useRef(screenKey);
  const [heard, setHeard] = useState("");
  const [confirming, setConfirming] = useState(false);

  // A new screen: focus its heading (not on the first paint, which would scroll the page) and announce the step.
  useEffect(() => {
    // Compared with the screen last shown (not a "first run" flag), so a dev-mode double run of the effect cannot steal focus on load.
    if (shownKey.current === screenKey) return;
    shownKey.current = screenKey;
    // A screen that put the cursor in its own first answer (the guided questions) keeps it.
    if (body.current?.contains(document.activeElement)) return;
    const h1 = body.current?.querySelector<HTMLElement>("h1");
    if (h1 && !h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1");
    h1?.focus();
    // Announcing is a reaction to the screen change, so it is set from the effect.
    setHeard(announce);
    // `announce` is read at the moment the screen changes, not a trigger of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);

  const exit = () => {
    onExit?.();
    router.push("/dashboard");
  };

  // A problem with saving (offline, refused, conflict) is long: on a phone it gets its own line instead of squeezing the bar.
  const pill = pillLabel(sync.status, sync.reason);
  const problem = pill !== null && pill.tone !== "calm";

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col" data-testid="onboarding-shell">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 inline-flex min-h-11 flex-none items-center gap-0.5 rounded-full pl-1 pr-3 text-[14px] font-semibold text-v2-ink-soft transition-colors hover:text-v2-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ChevronLeftIcon size={18} aria-hidden /> Back
          </button>
        ) : null}
        <span className="min-w-0 flex-1" />
        <SaveStatusPill status={sync.status} reason={sync.reason} onRetry={sync.onRetry} className={cn("mr-1", problem && "max-sm:order-last max-sm:mr-0 max-sm:basis-full max-sm:justify-end")} />
        <Tooltip content="More options">
          <Menu
            trigger={
              <IconButton aria-label="More options" className="max-sm:h-11 max-sm:w-11">
                <MoreHorizontalIcon size={20} aria-hidden />
              </IconButton>
            }
            items={[
              ...(onChangePersona ? [{ label: "Change who I am", onSelect: onChangePersona }] : []),
              { label: "Start over", onSelect: () => setConfirming(true) },
              { label: "Exit", onSelect: exit },
            ]}
          />
        </Tooltip>
        <Tooltip content="Exit">
          <Link href="/dashboard" aria-label={EXIT_LABEL} onClick={onExit} className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:h-11 max-sm:w-11">
            <XIcon size={18} aria-hidden />
          </Link>
        </Tooltip>
      </div>

      <div className="mt-1.5 flex items-center gap-3">
        <ProgressBar value={progress} label="Profile setup" valueText={valueText} className="min-w-0 flex-1" />
        {label && (
          <span data-testid="bar-label" className="flex-none text-[12.5px] font-semibold tabular-nums text-v2-muted">
            {label}
          </span>
        )}
      </div>

      {banners && <div className="mt-3 flex flex-col gap-2">{banners}</div>}

      {/* The slide-in moves `.ob-screen` itself, so the clip lives on a wrapper that stays put (clipping the moving box would let
          its 16 px shift show as a sideways scroll for the length of the animation). On a phone the wrapper reaches the window
          edges, so the sticky footer's full-bleed gradient is not cut off. `clip`, not `hidden`, keeps `position: sticky` working. */}
      <div className="mt-6 overflow-x-clip max-sm:-mx-3.5 max-sm:px-3.5">
        <div key={screenKey} data-dir={direction} className="ob-screen">
          <div ref={body}>{children}</div>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only" data-testid="step-announce">
        {heard}
      </p>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={RESTART_TITLE}
        description={RESTART_BODY}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} className="max-sm:min-h-11">
              Keep going
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                setConfirming(false);
                onStartOver();
              }}
              className="max-sm:min-h-11"
            >
              Start over
            </Button>
          </>
        }
      />
    </div>
  );
}
