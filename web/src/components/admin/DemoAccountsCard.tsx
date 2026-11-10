"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog, useToast } from "@/components/ui";
import type { DemoAdminState } from "@/lib/demo";
import { AdminPanel } from "@/components/admin-v3/common";

/**
 * Demo accounts panel (phase demo, APP-V2-SPEC section 9.2): a READ-ONLY status for the public
 * "Try the demo" buttons, the two accounts, and a data reset. The on/off switch is server config
 * only (`DEMO_ENABLED` + an API restart), so there is no toggle here. Reset goes through the BFF
 * route `/api/admin/settings/demo/reset`; Spring enforces ROLE_ADMIN and writes the audit entry.
 * `initial` is null when the API couldn't be read.
 */
export default function DemoAccountsCard({ initial }: { initial: DemoAdminState | null }) {
  const router = useRouter();
  const toast = useToast();
  const state = initial;
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  if (!state) {
    return (
      <AdminPanel title="Demo accounts" description="Public demo logins and their data.">
        <p className="mt-2 text-sm text-ink-soft">Demo controls unavailable: couldn&apos;t read the status from the API.</p>
      </AdminPanel>
    );
  }

  async function reset() {
    setResetting(true);
    try {
      const res = await fetch("/api/admin/settings/demo/reset", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "error", title: data.error ?? "Couldn't reset the demo data." });
        return;
      }
      setConfirmReset(false);
      toast({ variant: "success", title: "Demo data reset" });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setResetting(false);
    }
  }

  return (
    <AdminPanel title="Demo accounts" description="Public demo logins and their data.">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant={state.enabled ? "ready" : "default"}>{state.enabled ? "Enabled" : "Disabled"}</Badge>
        <p className="text-[13px] text-ink-soft">Controlled by server config (DEMO_ENABLED)</p>
      </div>

      <ul className="mt-4 divide-y divide-v2-line/70 rounded-xl border border-v2-line/70 text-sm">
        {state.accounts.map((a) => (
          <li key={a.login} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
            <span className="font-mono text-[13px] text-ink">{a.login}</span>
            <span className="text-ink-soft">{a.label}</span>
            <span className="font-mono text-[13px] text-ink-soft">{a.landing}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={resetting || !state.enabled}>
          Reset demo data
        </Button>
      </div>

      <Dialog
        open={confirmReset}
        onClose={() => !resetting && setConfirmReset(false)}
        title="Reset the demo data?"
        description="This wipes everything the two demo accounts have (applications, resumes, profile, notifications, inbox) and re-seeds the job seeker with the sample search. Real users are not touched."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button onClick={() => void reset()} disabled={resetting}>
              {resetting ? "Resetting…" : "Reset demo data"}
            </Button>
          </>
        }
      />
    </AdminPanel>
  );
}
