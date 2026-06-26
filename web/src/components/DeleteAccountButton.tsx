"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * "Delete account" with a typed confirmation guard. Deletion is permanent and erases all
 * of the user's data server-side (resumes, bio, applications, etc.), so it requires the
 * user to type DELETE before the button arms. On success the session cookies are already
 * cleared by the route handler, so we just send them home.
 */
const CONFIRM_WORD = "DELETE";

export default function DeleteAccountButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't delete your account.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-danger/40 bg-paper p-5">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-danger">Danger zone</h3>
        <p className="mt-1 text-sm text-muted">
          Permanently delete your account and all your data — resumes, profile, and everything else.
          This can&apos;t be undone.
        </p>
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="self-start rounded-full border border-danger/40 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/5"
        >
          Delete account
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex max-w-xs flex-col gap-1.5 text-sm text-ink-soft">
            Type <span className="font-semibold text-ink">{CONFIRM_WORD}</span> to confirm
            <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label="Type DELETE to confirm" />
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={onDelete}
              disabled={busy || text !== CONFIRM_WORD}
              className={cn(
                "rounded-full bg-danger px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90",
                "disabled:opacity-40",
              )}
            >
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setText("");
                setError(null);
              }}
              disabled={busy}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-2 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
