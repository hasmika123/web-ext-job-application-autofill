"use client";

import { Button, CheckCircleIcon, Tooltip } from "@kiwiply/ui";
import type { OrgBilling } from "@/lib/org-types";

/**
 * Screen 3: "Activate". What the workspace is for, and the one honest thing about paying in THIS environment: the dev path
 * ("Activate workspace (dev)") when billing is off, a not-yet button when Stripe is connected (Wave 5), and always "Skip for now"
 * to land in the draft console. No price is written here: prices are admin-configured, never typed into a screen.
 * The buttons live in the flow's sticky bottom bar (`Step3Actions`); this is the copy.
 */
export default function Step3({ name, billing }: { name: string; billing: OrgBilling | null }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold leading-tight text-ink">{name} is ready</h1>
        <p className="mt-1.5 text-[14.5px] text-ink-soft">One last step: activate it so you can start inviting people.</p>
      </div>

      <ul className="space-y-3 rounded-2xl border border-line bg-paper p-4">
        {["A workspace for your team and its admins", "Invite people with a link or by email", "See the progress each person chooses to share, nothing more"].map((t) => (
          <li key={t} className="flex items-start gap-3 text-[14px] text-ink">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-none text-accent-deep" />
            {t}
          </li>
        ))}
      </ul>

      {billing?.devActivation ? (
        <p className="text-[13px] text-muted">Billing isn&apos;t connected here, so activating skips the payment step. That shortcut only exists in development and demo environments.</p>
      ) : billing?.billingEnabled ? (
        <p className="text-[13px] text-muted">Online payment opens with the next release. Until then you can explore the draft workspace.</p>
      ) : (
        <p className="text-[13px] text-muted">The workspace stays a draft until billing is connected. You can still look around.</p>
      )}
    </div>
  );
}

/** The primary and secondary actions of screen 3, for the sticky bottom bar. */
export function Step3Actions({
  billing,
  busy,
  onActivate,
  onSkip,
}: {
  billing: OrgBilling | null;
  busy: boolean;
  onActivate: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {billing?.devActivation ? (
        <Button type="button" variant="accent" size="lg" className="w-full" disabled={busy} onClick={onActivate}>
          {busy ? "Activating…" : "Activate workspace (dev)"}
        </Button>
      ) : billing?.billingEnabled ? (
        <Tooltip content="Online payment opens with the next release">
          <span className="block">
            <Button type="button" variant="accent" size="lg" className="w-full" disabled>
              Pay with card
            </Button>
          </span>
        </Tooltip>
      ) : null}
      <Button type="button" variant={billing?.devActivation || billing?.billingEnabled ? "ghost" : "primary"} size="lg" className="w-full" disabled={busy} onClick={onSkip}>
        Skip for now, explore my workspace
      </Button>
    </div>
  );
}
