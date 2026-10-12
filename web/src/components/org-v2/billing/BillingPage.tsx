"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, CreditCardIcon, EmptyState, ErrorState, Tooltip, cn, useToast } from "@kiwiply/ui";
import { SectionCard } from "@/components/app-v2/common";
import { orgPath, orgRequest } from "@/lib/org-api";
import type { OrgBilling, OrgStatus } from "@/lib/org-types";
import OrgPageHero from "../shell/OrgPageHero";
import { useOrg } from "../shell/OrgContext";
import { statusLabel, typeLabel } from "../shell/org-labels";

/** What each lifecycle state means for the person looking at it (tenant-model.md section 3), in the console's voice. */
const STATUS_COPY: Record<OrgStatus, { title: string; body: string }> = {
  DRAFT: { title: "Your workspace is a draft", body: "Set things up and look around. Inviting people starts once the workspace is active." },
  PENDING_SETUP_FEE: { title: "Waiting for the setup payment", body: "Once it's confirmed the workspace goes live. We'll never show it as paid before it is." },
  ACTIVE: { title: "Your workspace is active", body: "People can be invited and given plans." },
  PAST_DUE: { title: "A payment is overdue", body: "Everyone keeps access until the end of the paid period. Update the payment method to stay on track." },
  SUSPENDED: { title: "Your workspace is paused", body: "Members' plans have ended. Billing is read-only until it's active again." },
  CLOSED: { title: "This workspace is closed", body: "Everything is read-only. Members keep their own accounts." },
};

/**
 * /org/billing (E2E-O4.0): the org's real state and, honestly, that billing is not connected here. No plan, seat count, card
 * or invoice is invented: until org billing ships (Wave 5) this page shows the workspace status, one empty state, and - in
 * dev, CI and the demo, for the owner of a draft - the "Activate workspace (dev)" path that stands in for the setup fee.
 */
export default function BillingPage({ initial }: { initial: OrgBilling | null }) {
  const { org, orgId } = useOrg();
  const router = useRouter();
  const toast = useToast();
  const [billing, setBilling] = useState<OrgBilling | null>(initial);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await orgRequest<OrgBilling>(orgPath(orgId, "/billing"));
    if (res.ok) setBilling(res.data);
    setLoading(false);
  }

  async function activate() {
    if (busy) return;
    setBusy(true);
    const res = await orgRequest<unknown>(orgPath(orgId, "/activate"), { method: "POST" });
    if (res.ok) {
      toast({ title: "Workspace activated", description: "You can invite people now.", variant: "success" });
      await load();
      router.refresh(); // the layout re-reads the org: the chip and the draft banner follow
    } else {
      toast({
        title: res.problem.code === "DEMO_READ_ONLY" ? "This is a demo account - changes aren't saved" : "Couldn't activate the workspace",
        description: res.problem.code === "DEMO_READ_ONLY" ? undefined : "Try again in a moment.",
        variant: "error",
      });
    }
    setBusy(false);
  }

  const hero = (
    <OrgPageHero
      title="Billing & Subscription"
      icon={<CreditCardIcon className="h-8 w-8" />}
      subtitle="Where your workspace stands and, later, what it costs."
      note="Money matters, handled plainly."
    />
  );

  if (!billing) {
    return (
      <div className="space-y-4">
        {hero}
        <ErrorState what="billing" onRetry={() => void load()} description={loading ? "Trying again…" : "We couldn't reach the server."} />
      </div>
    );
  }

  const status = statusLabel(billing.status);
  const copy = STATUS_COPY[billing.status];
  const unpaid = billing.status === "DRAFT" || billing.status === "PENDING_SETUP_FEE";

  return (
    <div className="space-y-4">
      {hero}

      <SectionCard title="Workspace status">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <span className={cn("rounded-md px-2.5 py-1 text-[13px] font-bold", status.tone)}>{status.label}</span>
          <div className="min-w-0 flex-1 basis-60">
            <p className="text-[15px] font-bold text-v2-navy">{copy.title}</p>
            <p className="mt-0.5 text-[13.5px] leading-snug text-ink-soft">{copy.body}</p>
            <p className="mt-2 text-[12.5px] text-v2-muted">
              {org.name} · {typeLabel(org.type)}
            </p>
          </div>
        </div>
      </SectionCard>

      {billing.billingEnabled ? (
        unpaid ? (
          <EmptyState
            mascot
            title="Set up billing"
            description="Pay the one-time setup fee to activate the workspace and start inviting people."
            action={
              <Tooltip content="Online payment opens with the next release">
                <span>
                  <Button variant="accent" disabled>
                    Set up billing
                  </Button>
                </span>
              </Tooltip>
            }
          />
        ) : (
          <EmptyState icon={<CreditCardIcon className="mx-auto h-8 w-8 text-v2-muted" />} title="No invoices yet" description="Invoices appear here after the first payment." />
        )
      ) : (
        <EmptyState
          mascot
          title="Billing isn't connected in this environment"
          description="Plans, seats and invoices show up here once billing is connected. Nothing here is charged."
          action={
            billing.devActivation ? (
              <div className="flex flex-col items-center gap-2">
                <Button variant="accent" onClick={() => void activate()} disabled={busy}>
                  {busy ? "Activating…" : "Activate workspace (dev)"}
                </Button>
                <p className="max-w-xs text-[12.5px] text-muted">Skips the payment step. It only exists here, never in production.</p>
              </div>
            ) : unpaid ? (
              <p className="max-w-xs text-[13px] text-muted">The workspace owner can activate it.</p>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
