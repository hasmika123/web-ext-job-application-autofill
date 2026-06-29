"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

interface Props {
  login: string;
  activated: boolean;
  isAdmin: boolean;
  /** True when the admin is viewing their OWN account — self-harming actions are disabled. */
  isSelf: boolean;
}

const SUCCESS: Record<string, string> = {
  activate: "Account activated",
  deactivate: "Account deactivated",
  "grant-admin": "Admin granted",
  "revoke-admin": "Admin revoked",
  "reset-password": "Password-reset email sent",
  "force-logout": "Sessions revoked",
};

/**
 * Admin actions on one user (Phase 9.A1.4b). Each calls the BFF (which proxies Spring); the
 * server is the real authority — it audits everything and rejects self-harming actions. The UI
 * also disables those for the admin's own account, and delete requires typing the login.
 */
export default function UserActions({ login, activated, isAdmin, isSelf }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function run(action: string) {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(login)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "error", title: data.error ?? "The action failed." });
        return;
      }
      toast({ variant: "success", title: SUCCESS[action] ?? "Done" });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(login)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "error", title: data.error ?? "Couldn't delete the account." });
        return;
      }
      toast({ variant: "success", title: `Deleted ${login}` });
      router.push("/admin/users");
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  const secondary = "rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-2 disabled:opacity-50";

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[var(--radius)] border border-line bg-paper p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {activated ? (
            <button
              type="button"
              className={secondary}
              disabled={busy !== null || isSelf}
              title={isSelf ? "You can't deactivate your own account" : undefined}
              onClick={() => run("deactivate")}
            >
              Deactivate
            </button>
          ) : (
            <button type="button" className={secondary} disabled={busy !== null} onClick={() => run("activate")}>
              Activate
            </button>
          )}

          {isAdmin ? (
            <button
              type="button"
              className={secondary}
              disabled={busy !== null || isSelf}
              title={isSelf ? "You can't revoke your own admin role" : undefined}
              onClick={() => run("revoke-admin")}
            >
              Revoke admin
            </button>
          ) : (
            <button type="button" className={secondary} disabled={busy !== null} onClick={() => run("grant-admin")}>
              Grant admin
            </button>
          )}

          <button type="button" className={secondary} disabled={busy !== null} onClick={() => run("reset-password")}>
            Send password reset
          </button>

          <button
            type="button"
            className={secondary}
            disabled={busy !== null || isSelf}
            title={isSelf ? "You can't force-logout your own session" : undefined}
            onClick={() => run("force-logout")}
          >
            Force logout
          </button>
        </div>
      </section>

      <section className="rounded-[var(--radius)] border border-danger/40 bg-paper p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-danger">Danger zone</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Permanently delete this account and all of its data — resumes, profile, applications, everything.
          This can&apos;t be undone.
        </p>
        {isSelf ? (
          <p className="mt-3 text-sm text-ink-soft">You can&apos;t delete your own account from here.</p>
        ) : !confirmOpen ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="mt-3 self-start rounded-full border border-danger/40 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/5"
          >
            Delete account
          </button>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <label className="text-sm text-ink-soft">
              Type <span className="font-semibold text-ink">{login}</span> to confirm:
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              className="w-full max-w-xs rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-danger"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={confirmText !== login || busy !== null}
                onClick={remove}
                className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy === "delete" ? "Deleting…" : "Permanently delete"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmText("");
                }}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
