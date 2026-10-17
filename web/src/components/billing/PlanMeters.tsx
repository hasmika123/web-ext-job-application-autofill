"use client";

import { AllowanceMeter, Meter } from "@kiwiply/ui";
import type { EntitlementSet } from "@/lib/subscription/types";

/**
 * "Usage this period" on My plan (docs/subscriptions/05-customer-ux.md section 4): one meter per entitlement that has an allowance and a usage count
 * (GET /api/entitlements/me), and the AI budget as a percentage. Meters are absent, not zero, until the usage ledger reports numbers.
 */
export default function PlanMeters({ ent }: { ent: EntitlementSet | null | "error" }) {
  if (ent === null) return <p className="text-[13px] text-muted">Loading usage...</p>;
  if (ent === "error") return <p className="text-[13px] text-muted">Usage isn&apos;t available right now.</p>;
  const metered = ent.features.filter((f) => f.allowance != null && f.used != null);
  const ai = ent.aiPct;
  if (metered.length === 0 && ai == null) return <p className="text-[13px] text-muted">Usage meters appear here once your plan reports usage.</p>;
  return (
    <div className="flex flex-col gap-4" data-testid="plan-meters">
      {ai != null ? (
        <div className="space-y-1.5">
          <Meter value={ai} max={100} label="AI budget" valueText={`${ai} % used`} />
          <p className="text-[12px] tabular-nums text-muted">AI budget {ai} % used</p>
        </div>
      ) : null}
      {metered.map((f) => (
        <AllowanceMeter key={f.featureKey} used={f.used!} limit={f.allowance!} label={f.name} resetsAt={f.resetsAt} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone} />
      ))}
    </div>
  );
}
