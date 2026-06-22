"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <section className="flex flex-col gap-3 rounded-xl border border-red-600/30 p-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
          Danger zone
        </h2>
        <p className="mt-1 text-sm text-foreground/60">
          Permanently delete your account and all your data — resumes, profile, and
          everything else. This can&apos;t be undone.
        </p>
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="self-start rounded-full border border-red-600/40 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-600/5 dark:text-red-400"
        >
          Delete account
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Type <span className="font-semibold">{CONFIRM_WORD}</span> to confirm
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              className="max-w-xs rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-base outline-none focus:border-red-600/60"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={onDelete}
              disabled={busy || text !== CONFIRM_WORD}
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
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
              className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
