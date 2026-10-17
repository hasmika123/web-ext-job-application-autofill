"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, Button, ClockIcon, Spinner, TrashIcon, useToast } from "@kiwiply/ui";
import { formatCountdown, type DeletionView } from "@/lib/account-privacy";
import { undoToast } from "@/lib/undo-toast";

const SPRING = "/api/account/deletion-request";
/** How often the countdown redraws, and how often we ask the server once the erasure has begun. */
const TICK_MS = 15_000;
const POLL_MS = 8_000;

type Load = { kind: "loading" } | { kind: "unavailable" } | { kind: "error" } | { kind: "ready"; view: DeletionView };

async function problem(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string; detail?: string } | null;
  return body?.error ?? body?.message ?? body?.detail ?? fallback;
}

/**
 * Settings > Privacy > Delete account. Deleting is scheduled, not immediate: the request starts an undo window (24 hours unless an
 * admin changed it) during which the account works as usual. This card shows that window as a countdown with a Cancel button, and a
 * toast with Undo right after the request. An account the API answers 404 for (an employer-managed enterprise account has no
 * self-service erasure) gets a plain note instead of controls.
 */
export default function AccountDeletion() {
  const router = useRouter();
  const toast = useToast();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Show a view of the request with the clock read at the same moment, so the countdown starts from the right number. */
  const show = useCallback((view: DeletionView) => {
    setNow(Date.now());
    setLoad({ kind: "ready", view });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(SPRING, { cache: "no-store" });
      if (!alive.current) return;
      if (res.status === 404) return setLoad({ kind: "unavailable" });
      if (res.status === 401) {
        // The erasure finished while this page was open: the session went with the account.
        router.push("/");
        return;
      }
      if (!res.ok) return setLoad({ kind: "error" });
      show((await res.json()) as DeletionView);
    } catch {
      if (alive.current) setLoad({ kind: "error" });
    }
  }, [router, show]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the pending request lives on the server, so it can only be read after mount
    void refresh();
  }, [refresh]);

  const view = load.kind === "ready" ? load.view : null;
  const pending = view?.status === "PENDING" || view?.status === "RUNNING";
  const deadline = view?.purgeAfter ? Date.parse(view.purgeAfter) : NaN;

  // Redraw the countdown; once it has run out (or the erasure has begun) keep asking until the account is gone.
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (view?.status === "RUNNING" || (Number.isFinite(deadline) && Date.now() >= deadline)) void refresh();
    }, view?.status === "RUNNING" ? POLL_MS : TICK_MS);
    return () => clearInterval(id);
  }, [pending, view?.status, deadline, refresh]);

  const cancel = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(SPRING, { method: "DELETE" });
      if (!res.ok) {
        setError(await problem(res, "Couldn't cancel the deletion. Please try again."));
        return;
      }
      show((await res.json()) as DeletionView);
      toast({ title: "Deletion cancelled", description: "Your account stays exactly as it is.", variant: "success" });
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [show, toast]);

  const schedule = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(SPRING, { method: "POST" });
      if (!res.ok) {
        setError(await problem(res, "Couldn't schedule the deletion. Please try again."));
        return;
      }
      const next = (await res.json()) as DeletionView;
      setConfirming(false);
      if (next.status === "DELETED") {
        router.push("/");
        router.refresh();
        return;
      }
      show(next);
      undoToast(toast, {
        title: "Account deletion scheduled",
        description: `It happens in ${next.graceHours} hours. Undo to keep your account.`,
        onUndo: () => void cancel(),
      });
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [cancel, router, show, toast]);

  if (load.kind === "unavailable") {
    return (
      <div data-account-deletion="unavailable" className="rounded-[var(--radius-lg)] border border-v2-line bg-paper-2 p-5 text-[13.5px] text-ink-soft">
        This account is managed by your organization, so it is removed by them rather than from here.
      </div>
    );
  }
  if (load.kind === "loading") {
    return (
      <div className="flex items-center gap-2 text-[13px] text-v2-muted">
        <Spinner aria-hidden label="Loading" className="h-4 w-4" />
        Checking your account…
      </div>
    );
  }
  if (load.kind === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-v2-line p-5 text-[13.5px] text-ink-soft">
        <span>Couldn&apos;t load your deletion settings.</span>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  const graceHours = load.view.graceHours;
  const remaining = Number.isFinite(deadline) ? deadline - now : NaN;
  const due = Number.isFinite(deadline) ? new Date(deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-danger/40 bg-paper p-5" data-account-deletion={pending ? "pending" : "none"}>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-danger-text">Danger zone</h3>
        <p className="mt-1 text-sm text-muted">
          Delete your account and everything in it: resumes, profile, applications and the rest. After the {graceHours}-hour undo window it can&apos;t be brought
          back.
        </p>
      </div>

      {pending && view ? (
        <div className="flex flex-col gap-3" role="status">
          <div className="flex items-start gap-2.5 rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-3 py-2.5 text-[13.5px] text-ink">
            <ClockIcon aria-hidden className="mt-0.5 h-4 w-4 flex-none text-danger-text" />
            <div className="min-w-0">
              {view.status === "RUNNING" ? (
                <p className="font-semibold">Deleting your account now…</p>
              ) : (
                <>
                  <p className="font-semibold">
                    Your account will be deleted in <span data-countdown>{formatCountdown(remaining)}</span>
                  </p>
                  {due && <p className="mt-0.5 text-[13px] text-ink-soft">On {due}. Until then everything works as usual.</p>}
                </>
              )}
            </div>
          </div>
          {view.canUndo && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => void cancel()} disabled={busy}>
                {busy ? "Cancelling…" : "Cancel deletion"}
              </Button>
            </div>
          )}
        </div>
      ) : !confirming ? (
        <div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 rounded-full border border-danger/40 px-4 py-2 text-sm font-semibold text-danger-text transition-colors hover:bg-danger/5"
          >
            <TrashIcon aria-hidden className="h-4 w-4" />
            Delete account
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-danger/30 bg-danger/5 p-3.5">
          <p className="flex items-start gap-2 text-[13.5px] text-ink">
            <AlertIcon aria-hidden className="mt-0.5 h-4 w-4 flex-none text-danger-text" />
            <span>We&apos;ll delete your account in {graceHours} hours. You can cancel any time before then, right here.</span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="danger" size="sm" onClick={() => void schedule()} disabled={busy}>
              {busy ? "Scheduling…" : "Schedule deletion"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={busy}
            >
              Keep my account
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
