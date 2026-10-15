"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, ArrowRightIcon, CheckIcon, EyeIcon, EyeOffIcon, LockIcon, cn } from "@kiwiply/ui";
import TenantLogo from "@/components/ent/login/TenantLogo";
import { SCOPE_COPY, newPasswordProblem, type JoinPreview, type ShareScope } from "@/lib/ent/join";

/**
 * The invitation page on an organization's own host (S9, decision O4; `/join/t/{token}`). Steps: the invitation, then (only when the
 * invitation creates an account) choosing a password, then the consent choice, then the workspace.
 *
 * Wording is deliberate: an invitation to a SEPARATE organization creates a NEW account that belongs to the organization and is
 * separate from any personal Kiwiply account. There is no "sign in with your existing account" step and nothing here reads, links or
 * reveals another account. A legacy (shared account) invitation (`createsAccount` false) needs the person to be signed in on this host.
 */
export interface JoinInviteProps {
  token: string;
  name: string;
  logoUrl?: string | null;
  preview: JoinPreview;
  /** The visitor holds a valid session on THIS host (only matters when the invitation does not create an account). */
  signedIn: boolean;
}

type Step = "invitation" | "password" | "consent";

export default function JoinInvite({ token, name, logoUrl, preview, signedIn }: JoinInviteProps) {
  const router = useRouter();
  const uid = useId();
  const needsLogin = !preview.createsAccount && !signedIn;
  const [step, setStep] = useState<Step>("invitation");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [scope, setScope] = useState<ShareScope>(preview.consent.defaultScope);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problem = preview.createsAccount ? newPasswordProblem(password, again) : null;

  function next() {
    if (step === "invitation") setStep(preview.createsAccount ? "password" : "consent");
    else if (step === "password") {
      setSubmitted(true);
      if (!problem) setStep("consent");
    }
  }

  async function accept(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/join/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shareScope: scope, consentVersion: preview.consent.version, ...(preview.createsAccount ? { password } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; signedIn?: boolean };
      if (!res.ok) {
        setError(data.error ?? "The invitation could not be accepted.");
        return;
      }
      setPassword("");
      setAgain("");
      setDone(true);
      router.push(data.signedIn === false ? "/login" : "/");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";
  const invitedBy = preview.inviterName ? `${preview.inviterName} invited you to join ${name}.` : `You have been invited to join ${name}.`;

  return (
    <main className="tenant-sky relative isolate min-h-dvh overflow-x-hidden text-[var(--brand-900)]" data-tenant-join>
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center px-4 py-10">
        <section aria-label="Join" className="tenant-glass rounded-[28px] px-5 py-7 sm:px-9 sm:py-9">
          <div className="mb-6 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="font-body text-[30px] font-extrabold leading-tight tracking-tight sm:text-[34px]">
                {step === "password" ? "Choose your password" : step === "consent" ? "What you share" : `Join ${name}`}
              </h1>
              <p className="mt-1 text-[15px] leading-snug text-[var(--brand-800)]">{invitedBy}</p>
            </div>
            <span aria-hidden className="h-16 w-px shrink-0 bg-[var(--brand-border)]" />
            <div className="grid h-[68px] w-[92px] shrink-0 place-items-center rounded-2xl p-2">
              <TenantLogo name={name} logoUrl={logoUrl} size="slot" />
            </div>
          </div>

          {done ? (
            <p role="status" className="flex items-center gap-2 text-[16px] font-semibold">
              <CheckIcon size={18} aria-hidden /> You&apos;re in. Opening your workspace...
            </p>
          ) : !preview.open ? (
            <p role="status" className="text-[15px] leading-snug">
              {name} is not accepting new members yet. Try this link again later, or ask the person who invited you.
            </p>
          ) : step === "invitation" ? (
            <div>
              <dl className="mb-5 grid gap-2 text-[15px]">
                {preview.role ? <Row label="Role">{preview.roles && preview.roles.length ? preview.roles.join(", ") : preview.role}</Row> : null}
                {preview.department ? <Row label="Department">{preview.department}</Row> : null}
                {preview.team ? <Row label="Team">{preview.team}</Row> : null}
                {preview.invitedEmailMasked ? <Row label="Invitation for">{preview.invitedEmailMasked}</Row> : null}
              </dl>
              {preview.message ? <p className="mb-5 rounded-xl bg-[var(--brand-subtle)] px-3 py-2.5 text-[15px] leading-snug">{preview.message}</p> : null}
              {preview.createsAccount ? (
                <p data-join-account-note className="mb-5 text-[14px] leading-snug text-[var(--brand-800)]">
                  Accepting creates a new {name} account for you. It belongs to {name} and is separate from any personal Kiwiply account: nothing is shared or linked between them.
                </p>
              ) : null}
              {needsLogin ? (
                <a href={`/login?next=${encodeURIComponent(`/join/t/${token}`)}`} className={SUBMIT}>
                  Sign in to continue
                </a>
              ) : (
                <button type="button" onClick={next} className={SUBMIT}>
                  Continue <ArrowRightIcon size={20} />
                </button>
              )}
            </div>
          ) : step === "password" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
              noValidate
            >
              <p className="mb-4 text-[14px] leading-snug text-[var(--brand-800)]">
                This is the password of your new {name} account. You sign in to {name} with it, on this address only.
              </p>
              <Field id={`${uid}-pw`} label="Password" hint="At least 4 characters. Longer is safer.">
                <input id={`${uid}-pw`} name="new-password" type={type} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={cn(INPUT, "pr-12")} />
              </Field>
              <Field id={`${uid}-again`} label="Repeat the password">
                <input id={`${uid}-again`} name="confirm-password" type={type} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={cn(INPUT, "pr-12")} />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide passwords" : "Show passwords"}
                  aria-pressed={show}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-[var(--brand-800)] transition-colors hover:text-[var(--brand-900)]"
                >
                  {show ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
                </button>
              </Field>
              <Alert text={submitted ? problem : null} />
              <button type="submit" className={SUBMIT}>
                Continue <ArrowRightIcon size={20} />
              </button>
            </form>
          ) : (
            <form onSubmit={accept} noValidate>
              <fieldset className="mb-4">
                <legend className="mb-2 text-[15px] font-semibold">What {name} can see about you</legend>
                {preview.consent.options.map((o) => (
                  <label key={o} className="mb-2 flex cursor-pointer items-start gap-3 rounded-xl bg-[var(--brand-subtle)] px-3 py-2.5">
                    <input type="radio" name="share-scope" value={o} checked={scope === o} onChange={() => setScope(o)} className="mt-1" />
                    <span>
                      <span className="block text-[15px] font-semibold">{SCOPE_COPY[o].title}</span>
                      <span className="block text-[13.5px] leading-snug text-[var(--brand-800)]">{SCOPE_COPY[o].detail}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {preview.consent.text ? (
                <details className="mb-4 text-[14px]">
                  <summary className="cursor-pointer font-semibold">What exactly?</summary>
                  <p className="mt-2 whitespace-pre-wrap leading-snug text-[var(--brand-800)]">{preview.consent.text}</p>
                </details>
              ) : null}
              <Alert text={error} />
              <button type="submit" disabled={busy} aria-busy={busy} className={SUBMIT}>
                {busy ? (
                  "Joining..."
                ) : (
                  <>
                    {preview.createsAccount ? "Create my account and join" : "Join"} <ArrowRightIcon size={20} />
                  </>
                )}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

const INPUT = "tenant-glass-field h-[52px] w-full rounded-xl pl-12 pr-4 text-[16px] text-[var(--brand-900)] placeholder:text-[var(--brand-700)]/80";
const SUBMIT = "tenant-signin inline-flex h-[54px] w-full items-center justify-center gap-3 rounded-xl text-[18px] font-semibold transition-[filter] hover:brightness-105 disabled:cursor-not-allowed";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 font-semibold">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Alert({ text }: { text: string | null }) {
  return (
    <div role="alert" aria-live="polite" className={text ? "mb-4 flex items-start gap-2 rounded-lg bg-v2-coral-soft px-3 py-2.5 text-[14px] font-medium text-danger-text" : "sr-only"}>
      {text ? (
        <>
          <AlertIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{text}</span>
        </>
      ) : null}
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-3.5">
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-semibold">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-800)]">
          <LockIcon size={20} />
        </span>
        {children}
      </div>
      {hint ? <p className="mt-1.5 text-[13px] text-[var(--brand-800)]">{hint}</p> : null}
    </div>
  );
}
