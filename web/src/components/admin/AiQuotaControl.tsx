"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

interface Props {
  login: string;
  defaultQuota: number;
  /** Current override, or null when the user is on the global default. */
  override: number | null;
}

/**
 * Per-user AI monthly-quota override (Phase 9.A2.2b). Empty = use the global default; setting a
 * number overrides it; Clear reverts. Calls the BFF (which proxies Spring; the server clamps,
 * validates the user, and audits). The effective quota is `override ?? defaultQuota`.
 */
export default function AiQuotaControl({ login, defaultQuota, override }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(override === null ? "" : String(override));
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = Number(value);
    if (value.trim() === "" || !Number.isInteger(n) || n < 0) {
      toast({ variant: "error", title: "Enter a whole number ≥ 0 (or use Clear)." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(login)}/ai-quota`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quota: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "error", title: data.error ?? "Couldn't set the quota." });
        return;
      }
      toast({ variant: "success", title: `AI quota set to ${n}/mo` });
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
      toast({ variant: "success", title: "Reverted to the default quota" });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  const effective = override ?? defaultQuota;

  return (
    <section className="rounded-[var(--radius)] border border-line bg-paper p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">AI monthly quota</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Effective: <span className="font-semibold text-ink">{effective}/mo</span>
        {override === null ? " (global default)" : ` (override; default is ${defaultQuota})`}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${defaultQuota}`}
          aria-label="Monthly AI quota override"
          className="w-28 rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
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
          disabled={busy || override === null}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-2 disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
