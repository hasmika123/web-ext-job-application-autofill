"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Field, Input, Switch, useToast } from "@/components/ui";
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
  status: "CONNECTED" | "NEEDS_RECONNECT" | "ERROR" | "NO_ENTITLEMENT" | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  /** Messages read so far (headers for all; text only for job mail). */
  messages: number;
  /** Email me about interviews and offers (14.6). */
  notifyEmail: boolean;
  /** Consultant workspace only: why a stopped connection is not being read ("Your organization no longer includes inbox tracking."). */
  stoppedNote?: string | null;
  /** Demo stack only: the mailbox is a built-in sample; `sandboxAddress` is the one address it accepts (a test value). */
  sandbox?: boolean;
  sandboxAddress?: string | null;
}

/** Where the component talks to. The personal Settings page uses the defaults; the consultant workspace passes its tenant-bound routes. */
export interface InboxEndpoints {
  connect: string;
  notify: string;
  /** Optional: "Check now" (read the mailbox straight away). Only the consultant workspace passes it; without it no button is shown. */
  checkNow?: string;
}

/** The in-app links of this component. The personal Settings page uses the defaults; a tenant workspace passes tenant-relative ones. */
export interface InboxLinks {
  privacy: string;
  profile: string;
  pricing: string;
  /** What the text calls the product: "Kiwiply" on the personal pages, the organization's own wording in a workspace. */
  appName: string;
  /** "Kiwiply account" on the personal pages, "account" in a workspace (as in "Sent to your account's email"). */
  accountName: string;
  /** The name suggested for the Google app password. */
  passwordLabel: string;
}

const PERSONAL_LINKS: InboxLinks = { privacy: "/privacy", profile: "/profile", pricing: "/pricing", appName: "Kiwiply", accountName: "Kiwiply account", passwordLabel: "Kiwiply" };

const PERSONAL_ENDPOINTS: InboxEndpoints = { connect: "/api/inbox", notify: "/api/inbox/notify" };

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

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const external = "font-semibold text-accent-deep underline-offset-2 hover:underline";

export default function InboxConnect({
  isPro,
  view,
  endpoints = PERSONAL_ENDPOINTS,
  locked,
  onChanged,
  links = PERSONAL_LINKS,
}: {
  /** Whether inbox tracking is included for this person (their Pro plan, or in a workspace their organization's license). */
  isPro: boolean;
  view: InboxView | null;
  endpoints?: InboxEndpoints;
  /** What to show instead of the Pro offer when it is not included (the workspace says so in its own words). */
  locked?: ReactNode;
  /** Called after a connect or disconnect; the default refreshes the server-rendered page. */
  onChanged?: () => void;
  /** Where the in-text links go. A workspace of an organization passes its OWN host's pages (privacy policy, profile), never the Kiwiply site's. */
  links?: InboxLinks;
}) {
  const router = useRouter();
  const toast = useToast();
  const [address, setAddress] = useState(view?.address ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(view?.notifyEmail ?? true);
  // "Check now": the read runs in the background, so after a 202 the page is re-read every few seconds until "Last checked" moves (or 90 s pass).
  const [checking, setChecking] = useState<{ since: string | null; started: number } | null>(null);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const lastCheckedAt = view?.lastCheckedAt ?? null;
  // Still reading while "Last checked" has not moved since the click (derived, so the effect never sets state on its own).
  const checkingNow = checking && checking.since === lastCheckedAt ? checking : null;
  useEffect(() => {
    if (!checkingNow) return;
    const t = setTimeout(() => {
      if (Date.now() - checkingNow.started > 90_000) setChecking(null);
      else if (onChanged) onChanged();
      else router.refresh();
    }, 4000);
    return () => clearTimeout(t);
  }, [checkingNow, onChanged, router]);

  async function checkNow() {
    if (!endpoints.checkNow || checkingNow) return;
    setCheckNote(null);
    const res = await fetch(endpoints.checkNow, { method: "POST", headers: { accept: "application/json" } });
    if (res.ok) {
      setChecking({ since: lastCheckedAt, started: Date.now() });
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setCheckNote(res.status === 429 ? (body.message ?? "Checked a moment ago. Try again in a minute.") : (body.message ?? body.error ?? "Couldn't check right now. Please try again."));
  }

  async function toggleNotify(on: boolean) {
    setNotifyEmail(on);
    const res = await fetch(endpoints.notify, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: on }),
    });
    if (!res.ok) {
      setNotifyEmail(!on);
      toast({ variant: "error", title: "Couldn't change that right now." });
    }
  }

  const changed = () => (onChanged ? onChanged() : router.refresh());

  if (!isPro && locked) return <>{locked}</>;
  if (!isPro) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-6 shadow-[var(--shadow)]">
        <h2 className="font-display text-lg font-semibold text-ink">Let your inbox update your board</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Connect the Gmail you apply from and {links.appName}{" "}reads replies from employers — confirmations, interview invites,
          rejections, offers — and moves each application along for you. It only ever reads.
        </p>
        <Link href={links.pricing} className={cn(buttonVariants("primary", "sm"), "mt-4 inline-flex")}>
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
    const res = await fetch(endpoints.connect, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, appPassword: password }),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(body.message ?? body.error ?? "Connecting didn't work. Please try again.");
      return;
    }
    setPassword("");
    toast({ variant: "success", title: "Inbox connected." });
    changed();
  }

  async function disconnect() {
    setBusy(true);
    const res = await fetch(endpoints.connect, { method: "DELETE" });
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      toast({ variant: "error", title: "Disconnecting didn't work. Please try again." });
      return;
    }
    setAddress("");
    toast({ variant: "success", title: "Inbox disconnected." });
    changed();
  }

  const readOnly = (
    <p className="text-[12.5px] leading-relaxed text-muted">
      {sentenceCase(links.appName)} only reads. We never send, move or delete mail — and you can cut us off at any time by deleting the app
      password in your Google account. Mail we read is kept for 12 months after it was sent, then deleted. See the{" "}
      <Link href={links.privacy} className="underline">
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
            {view.status === "ERROR" ? (
              <Badge variant="review">Having trouble</Badge>
            ) : view.status === "NO_ENTITLEMENT" ? (
              <Badge variant="review">Stopped</Badge>
            ) : (
              <Badge>Connected</Badge>
            )}
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
          {view.status === "NO_ENTITLEMENT" ? (
            <p role="status" data-inbox-stopped className="mt-3 text-[13px] text-ink-soft">
              {view.stoppedNote ?? "Inbox tracking is no longer included, so nothing is being read."} Nothing is being read from this Gmail. You can disconnect it below; if it is included again, reading
              starts again by itself.
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-ink-soft">
              We check it every 15 minutes, the inbox and the sent mail.
              {endpoints.checkNow ? (
                <>
                  {" "}
                  <button type="button" onClick={() => void checkNow()} disabled={!!checkingNow} data-inbox-check-now className={cn("font-semibold text-accent-deep underline-offset-2 hover:underline", checkingNow && "opacity-60")}>
                    {checkingNow ? "Checking now…" : "Check now"}
                  </button>
                </>
              ) : null}
            </p>
          )}
          {checkingNow ? (
            <p role="status" data-inbox-checking className="mt-2 text-[13px] text-ink-soft">
              Reading your mailbox now. New mail shows below in under a minute.
            </p>
          ) : checkNote ? (
            <p role="status" data-inbox-check-note className="mt-2 text-[13px] text-ink-soft">
              {checkNote}
            </p>
          ) : null}

          <div className="mt-4 border-t border-line pt-4">
            <Switch
              label="Email me about interviews and offers"
              description={`Sent to your ${links.accountName}'s email, not this Gmail. Every other update shows under Notifications.`}
              checked={notifyEmail}
              onCheckedChange={(v) => void toggleNotify(v)}
            />
          </div>

          <div className="mt-4 border-t border-line pt-4">
            {confirming ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-ink">
                  Disconnecting deletes the saved app password and any mail {links.appName}{" "}has read from this inbox. To be sure we
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
              <button type="button" onClick={() => setConfirming(true)} className="text-[13px] font-semibold text-danger-text hover:underline">
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
          <Link href={links.profile} className={external}>
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
          , name it &ldquo;{links.passwordLabel}&rdquo;, and copy the 16 letters Google shows. It&apos;s shown once.
        </Step>
      </ol>

      <form onSubmit={(e) => void connect(e)} className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
        <div className="text-[14px] font-semibold text-ink">4. Connect it</div>
        {view.sandbox && view.sandboxAddress ? (
          <p data-inbox-sandbox className="rounded-[var(--radius)] border border-line bg-paper-2 px-3 py-2 text-[12.5px] text-ink-soft">
            This is a demo workspace, so it has a sample mailbox instead of a real Gmail. Use the address <b className="font-semibold text-ink">{view.sandboxAddress}</b> and any 16 letters as the app
            password.
          </p>
        ) : null}
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
          <p role="alert" className="text-[13px] font-medium text-danger-text">
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
