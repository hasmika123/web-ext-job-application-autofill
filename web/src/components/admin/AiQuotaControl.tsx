"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

interface Props {
  login: string;
  /** The Pro plan's monthly AI budget, in US cents. */
  defaultBudgetCents: number;
  /** This user's override in cents, or null when their plan decides. */
  overrideCents: number | null;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Per-user AI override (Phase 9.A2.2b). Since 13.1b server AI is metered by what it costs, so the
 * override is a monthly AI budget in dollars. It outranks the plan: set one to give a Free user
 * server AI, or to give anyone a different budget; $0 means no server AI. Clear hands the decision
 * back to their plan (Pro gets the default budget, Free gets none). Calls the BFF, which proxies
 * Spring; the server validates the user, clamps the amount, and audits.
 */
export default function AiQuotaControl({ login, defaultBudgetCents, overrideCents }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(overrideCents === null ? "" : (overrideCents / 100).toFixed(2));
  const [busy, setBusy] = useState(false);

  async function save() {
    const amount = Number(value);
    if (value.trim() === "" || !Number.isFinite(amount) || amount < 0) {
      toast({ variant: "error", title: "Enter a dollar amount of 0 or more (or use Clear)." });
      return;
    }
    const cents = Math.round(amount * 100);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(login)}/ai-quota`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budgetCents: cents }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "error", title: data.error ?? "Couldn't set the budget." });
        return;
      }
      toast({ variant: "success", title: `AI budget set to ${dollars(cents)}/mo` });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(login)}/ai-quota`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "error", title: data.error ?? "Couldn't clear the override." });
        return;
      }
      setValue("");
      toast({ variant: "success", title: "Back to their plan's AI budget" });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[var(--radius)] border border-line bg-paper p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">AI monthly budget</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {overrideCents === null ? (
          <>
            Set by their plan: Pro gets <span className="font-semibold text-ink">{dollars(defaultBudgetCents)}/mo</span> of
            model cost; Free gets no server AI beyond resume parsing.
          </>
        ) : (
          <>
            Override: <span className="font-semibold text-ink">{dollars(overrideCents)}/mo</span>, whatever their plan
            (Pro default is {dollars(defaultBudgetCents)}).
          </>
        )}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-[var(--radius)] border border-line bg-paper focus-within:border-ink">
          <span className="pl-3 text-sm text-muted" aria-hidden>
            $
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={(defaultBudgetCents / 100).toFixed(2)}
            aria-label="Monthly AI budget override, in dollars"
            className="w-24 bg-transparent px-2 py-2 text-sm text-ink outline-none"
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Set override
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={busy || overrideCents === null}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-2 disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
