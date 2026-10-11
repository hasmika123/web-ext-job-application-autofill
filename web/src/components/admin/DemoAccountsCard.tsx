"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Switch, useToast } from "@/components/ui";
import LocalDate from "@/components/LocalDate";
import type { DemoAdminState } from "@/lib/demo";

/**
 * Demo accounts control (phase demo, APP-V2-SPEC section 9.2): the on/off switch for the public
 * "Try the demo" buttons on the login page, the two accounts, and a data reset. The switch is
 * optimistic (it flips at once and rolls back with an error toast if the API refuses). Everything
 * goes through the BFF routes under `/api/admin/settings/demo`; Spring enforces ROLE_ADMIN and
 * writes the audit entries shown on /admin/audit. `initial` is null when the API couldn't be read.
 */
export default function DemoAccountsCard({ initial }: { initial: DemoAdminState | null }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<DemoAdminState | null>(initial);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  if (!state) {
    return (
      <section className="mb-5 rounded-[var(--radius)] border border-line bg-paper p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Demo accounts</h2>
        <p className="mt-2 text-sm text-ink-soft">Demo controls unavailable: couldn&apos;t read the setting from the API.</p>
      </section>
    );
  }

  async function toggle(next: boolean) {
    const before = state;
    setState((s) => (s ? { ...s, enabled: next } : s)); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings/demo", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState(before);
        toast({ variant: "error", title: data.error ?? "Couldn't change the demo setting." });
        return;
      }
      setState({
        enabled: !!data.enabled,
        accounts: Array.isArray(data.accounts) ? data.accounts : (before?.accounts ?? []),
        updatedBy: data.updatedBy ?? null,
        updatedDate: data.updatedDate ?? null,
      });
      toast({ variant: "success", title: next ? "Demo accounts are on" : "Demo accounts are off" });
      router.refresh();
    } catch {
      setState(before);
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setBusy(false);
    }
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
    <section className="mb-5 rounded-[var(--radius)] border border-line bg-paper p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Demo accounts</h2>

      <div className="mt-3">
        <Switch
          checked={state.enabled}
          onCheckedChange={(v) => void toggle(v)}
          disabled={busy}
          label="Demo accounts enabled"
          description="When off, demo logins are refused and the login page hides the demo buttons."
        />
      </div>

      <ul className="mt-4 divide-y divide-line rounded-[var(--radius)] border border-line text-sm">
        {state.accounts.map((a) => (
          <li key={a.login} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
            <span className="font-mono text-[13px] text-ink">{a.login}</span>
            <span className="text-ink-soft">{a.label}</span>
            <span className="font-mono text-[13px] text-ink-soft">{a.landing}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-soft">
          {state.updatedBy && state.updatedDate ? (
            <>
              Last changed by <span className="font-medium text-ink">{state.updatedBy}</span> on{" "}
              <LocalDate iso={state.updatedDate} />
            </>
          ) : (
            "Not changed yet. Ships off."
          )}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={resetting}>
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
    </section>
  );
}
