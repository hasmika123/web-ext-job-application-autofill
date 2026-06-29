"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

export interface SessionFamily {
  familyId: string;
  createdAt?: string | null;
  expiresAt?: string | null;
  tokenCount: number;
  active: boolean;
}

function day(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

/**
 * A user's sign-in sessions (refresh-token families) with per-session revoke (Phase 9.A2.3b).
 * Listing is passed in from the server; revoke calls the BFF (Spring audits + checks ownership).
 */
export default function SessionsList({ login, families }: { login: string; families: SessionFamily[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function revoke(familyId: string) {
    setBusy(familyId);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(login)}/sessions/${encodeURIComponent(familyId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "error", title: data.error ?? "Couldn't revoke the session." });
        return;
      }
      toast({ variant: "success", title: "Session revoked" });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  const active = families.filter((f) => f.active);

  return (
    <section className="rounded-[var(--radius)] border border-line bg-paper p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Sessions</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {active.length} active{active.length === 1 ? " session" : " sessions"}. Revoking signs that session out.
      </p>

      {families.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No sessions on record.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {families.map((f) => (
            <li key={f.familyId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] text-ink">{f.familyId.slice(0, 8)}</span>
                  {f.active ? (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-ink">Active</span>
                  ) : (
                    <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-soft ring-1 ring-line">
                      Revoked / expired
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-soft">
                  Signed in {day(f.createdAt)} · expires {day(f.expiresAt)} · {f.tokenCount} token{f.tokenCount === 1 ? "" : "s"}
                </div>
              </div>
              {f.active && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => revoke(f.familyId)}
                  className="rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-paper-2 disabled:opacity-50"
                >
                  {busy === f.familyId ? "Revoking…" : "Revoke"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
