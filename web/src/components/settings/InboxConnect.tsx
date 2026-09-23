"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Field, Input, useToast } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import LocalDate from "@/components/LocalDate";
import { cn } from "@/lib/cn";

/**
 * Connect a dedicated Gmail (Phase 14.1, Pro). Three steps Google needs first — a Gmail just for
 * job hunting, 2-Step Verification, an app password — then the address and app password, which the
 * server checks against Gmail before keeping (encrypted). Each way Gmail can say no comes back as
 * its own sentence, so the user knows which step to redo.
 *
 * The password field is never pre-filled and never shown again; once connected, the page only
 * shows the address and how the inbox is doing.
 */

export interface InboxView {
  available: boolean;
  connected: boolean;
  address: string | null;
  status: "CONNECTED" | "NEEDS_RECONNECT" | "ERROR" | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  /** Messages read so far (headers for all; text only for job mail). */
  messages: number;
}

const WHEN = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-deep">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[14px] font-semibold text-ink">{title}</div>
        <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">{children}</div>
      </div>
    </li>
  );
}

const external = "font-semibold text-accent-deep underline-offset-2 hover:underline";

export default function InboxConnect({ isPro, view }: { isPro: boolean; view: InboxView | null }) {
  const router = useRouter();
  const toast = useToast();
  const [address, setAddress] = useState(view?.address ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!isPro) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-6 shadow-[var(--shadow)]">
        <h2 className="font-display text-lg font-semibold text-ink">Let your inbox update your board</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Connect the Gmail you apply from and Kiwiply reads replies from employers — confirmations, interview invites,
          rejections, offers — and moves each application along for you. It only ever reads.
        </p>
        <Link href="/pricing" className={cn(buttonVariants("primary", "sm"), "mt-4 inline-flex")}>
          Part of Pro →
        </Link>
      </div>
    );
  }

  if (!view) return <p className="text-sm text-ink-soft">Couldn&apos;t load your inbox settings. Please refresh the page.</p>;

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/inbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, appPassword: password }),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    setBusy(false);
    if (!res.ok) {
      setError(body.message ?? "Connecting didn't work. Please try again.");
      return;
    }
    setPassword("");
    toast({ variant: "success", title: "Inbox connected." });
    router.refresh();
  }

  async function disconnect() {
    setBusy(true);
    const res = await fetch("/api/inbox", { method: "DELETE" });
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      toast({ variant: "error", title: "Disconnecting didn't work. Please try again." });
      return;
    }
    setAddress("");
    toast({ variant: "success", title: "Inbox disconnected." });
    router.refresh();
  }

  const readOnly = (
    <p className="text-[12.5px] leading-relaxed text-muted">
      Kiwiply only reads. We never send, move or delete mail — and you can cut us off at any time by deleting the app
      password in your Google account. See the{" "}
      <Link href="/privacy" className="underline">
        Privacy Policy
      </Link>
      .
    </p>
  );

  // Connected (and working, or failing for a reason other than the password).
  if (view.connected && view.status !== "NEEDS_RECONNECT") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-ink">{view.address}</span>
            {view.status === "ERROR" ? <Badge variant="review">Having trouble</Badge> : <Badge>Connected</Badge>}
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
            {view.connectedAt && (
              <>
                <dt className="text-muted">Connected</dt>
                <dd className="text-ink">
                  <LocalDate iso={view.connectedAt} options={WHEN} />
                </dd>
              </>
            )}
            <dt className="text-muted">Last checked</dt>
            <dd className="text-ink">{view.lastCheckedAt ? <LocalDate iso={view.lastCheckedAt} options={WHEN} /> : "Not yet — it's reading now"}</dd>
            <dt className="text-muted">Messages read</dt>
            <dd className="text-ink tabular-nums">{view.messages.toLocaleString()}</dd>
          </dl>
          {view.status === "ERROR" && view.lastError && (
            <p role="status" className="mt-3 text-[13px] text-ink-soft">
              {view.lastError} We&apos;ll keep trying.
            </p>
          )}
          <p className="mt-3 text-[13px] text-ink-soft">We check it every 15 minutes, the inbox and the sent mail.</p>

          <div className="mt-4 border-t border-line pt-4">
            {confirming ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-ink">
                  Disconnecting deletes the saved app password and any mail Kiwiply has read from this inbox. To be sure we
                  can&apos;t sign in again, also delete the app password in{" "}
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className={external}>
                    your Google account
                  </a>
                  .
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void disconnect()} disabled={busy} className={cn(buttonVariants("danger", "sm"), "disabled:opacity-60")}>
                    {busy ? "Disconnecting…" : "Disconnect"}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className={buttonVariants("ghost", "sm")}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="text-[13px] font-semibold text-danger hover:underline">
                Disconnect this inbox
              </button>
            )}
          </div>
        </div>
        {readOnly}
      </div>
    );
  }

  if (!view.available) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 text-[13.5px] text-ink-soft">
        Connecting an inbox isn&apos;t available right now. Please check back later.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {view.status === "NEEDS_RECONNECT" && (
        <p role="alert" className="rounded-[var(--radius)] border border-brown/40 bg-brown-soft px-4 py-3 text-[13px] text-brown-deep">
          Gmail stopped accepting the app password for {view.address} — it may have been deleted or changed. Create a new
          one (step 3) and connect again.
        </p>
      )}

      <ol className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
        <Step n={1} title="Use a Gmail just for job hunting">
          An app password can read everything in its account, so keep your personal mail out of it:{" "}
          <a href="https://accounts.google.com/signup" target="_blank" rel="noopener noreferrer" className={external}>
            create a new Gmail
          </a>{" "}
          and apply from it. Put it as the email on your{" "}
          <Link href="/profile" className={external}>
            profile
          </Link>{" "}
          so autofill uses it.
        </Step>
        <Step n={2} title="Turn on 2-Step Verification">
          Google only offers app passwords once it&apos;s on.{" "}
          <a href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noopener noreferrer" className={external}>
            Turn it on for that Gmail
          </a>
          .
        </Step>
        <Step n={3} title="Create an app password">
          Signed in as that Gmail, open{" "}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className={external}>
            App passwords
          </a>
          , name it &ldquo;Kiwiply&rdquo;, and copy the 16 letters Google shows. It&apos;s shown once.
        </Step>
      </ol>

      <form onSubmit={(e) => void connect(e)} className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
        <div className="text-[14px] font-semibold text-ink">4. Connect it</div>
        <Field label="Gmail address" htmlFor="inbox-address">
          <Input
            id="inbox-address"
            type="email"
            autoComplete="email"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="yourname.jobs@gmail.com"
            required
          />
        </Field>
        <Field label="App password" htmlFor="inbox-password" hint="16 letters, with or without the spaces. Not your Gmail password.">
          <Input
            id="inbox-password"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="abcd efgh ijkl mnop"
            required
          />
        </Field>
        {error && (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </p>
        )}
        <div>
          <button type="submit" disabled={busy || !address.trim() || !password.trim()} className={cn(buttonVariants("primary", "sm"), "disabled:opacity-60")}>
            {busy ? "Checking with Gmail…" : "Check and connect"}
          </button>
        </div>
        {readOnly}
      </form>
    </div>
  );
}
