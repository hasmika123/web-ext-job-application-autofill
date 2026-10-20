"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { AlertIcon, ArrowRightIcon, LockIcon, MailIcon } from "@kiwiply/ui";
import TenantLogo from "@/components/ent/login/TenantLogo";
import { AUTH_CARD_COLUMN, LoginBackdrop } from "@/components/ent/login/AuthBackdrop";
import PolicyLinks from "@/components/ent/policy/PolicyLinks";
import { newPasswordProblem } from "@/lib/ent/join";

/**
 * Forgot / reset password on an organization's own host (S9, decision O4). The account being reset is the person's {name} account:
 * the API looks the address up among THIS organization's accounts only and builds the emailed link on this host, so a reset here can
 * never touch a personal Kiwiply account (and a reset on kiwiply.com never touches this one). The answer is the same whether or not an
 * account exists: the page never says, and never mentions any other account that address may have.
 */
const INPUT = "tenant-glass-field h-[52px] w-full rounded-xl pl-12 pr-4 text-[16px] text-[var(--brand-900)] placeholder:text-[var(--brand-700)]/80";
const SUBMIT = "tenant-signin inline-flex h-[54px] w-full items-center justify-center gap-3 rounded-xl text-[18px] font-semibold transition-[filter] hover:brightness-105 disabled:cursor-not-allowed";

function Shell({ name, logoUrl, title, children }: { name: string; logoUrl?: string | null; title: string; children: ReactNode }) {
  return (
    <main className="tenant-sky relative isolate min-h-dvh overflow-x-hidden text-[var(--brand-900)]" data-tenant-password-reset>
      <LoginBackdrop />
      <div className={`mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col items-center justify-center px-4 py-10 ${AUTH_CARD_COLUMN}`}>
        <section aria-label={title} className="tenant-glass w-full max-w-[520px] rounded-[28px] px-5 py-7 sm:px-9 sm:py-9">
          <div className="mb-6 flex items-center gap-4">
            <h1 className="min-w-0 flex-1 font-body text-[30px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{title}</h1>
            <span aria-hidden className="h-16 w-px shrink-0 bg-[var(--brand-border)]" />
            <div className="grid h-[68px] w-[92px] shrink-0 place-items-center rounded-2xl p-2">
              <TenantLogo name={name} logoUrl={logoUrl} size="slot" />
            </div>
          </div>
          {children}
        </section>
        <PolicyLinks tone="plain" className="mt-5 w-full max-w-[520px] text-[var(--brand-800)]" />
      </div>
    </main>
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

function Field({ id, label, icon, children }: { id: string; label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-3.5">
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-semibold">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-800)]">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

const BACK = "mt-5 inline-flex min-h-[44px] items-center font-semibold text-accent-deep hover:underline";

export function TenantForgotPassword({ name, logoUrl, supportEmail }: { name: string; logoUrl?: string | null; supportEmail?: string | null }) {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter the email address of your account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Shell name={name} logoUrl={logoUrl} title="Check your email">
        <p role="status" className="text-[16px] leading-snug">
          If an account for <strong className="break-all">{email.trim()}</strong> exists at {name}, we&apos;ve sent a link to reset its password. The link opens on this address and only works for your {name} account.
        </p>
        <a href="/login" className={BACK}>
          Back to sign in
        </a>
      </Shell>
    );
  }

  return (
    <Shell name={name} logoUrl={logoUrl} title="Reset your password">
      <p className="mb-4 text-[15px] leading-snug text-[var(--brand-800)]">
        Enter the email address of your {name} account and we&apos;ll send you a link to set a new password. This only changes your {name} account: it belongs to {name} and is separate from any personal job-search account.
      </p>
      <form onSubmit={onSubmit} noValidate>
        <Field id={`${uid}-email`} label="Email address" icon={<MailIcon size={20} />}>
          <input id={`${uid}-email`} name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </Field>
        <Alert text={error} />
        <button type="submit" disabled={busy} aria-busy={busy} className={SUBMIT}>
          {busy ? (
            "Sending..."
          ) : (
            <>
              Send reset link <ArrowRightIcon size={20} />
            </>
          )}
        </button>
      </form>
      <a href="/login" className={BACK}>
        Back to sign in
      </a>
      {supportEmail ? (
        <p className="mt-2 text-[13.5px] text-[var(--brand-800)]">
          Not getting the email? Ask {name} support: <a href={`mailto:${supportEmail}`} className="font-semibold text-accent-deep hover:underline">{supportEmail}</a>.
        </p>
      ) : null}
    </Shell>
  );
}

export function TenantResetPassword({ name, logoUrl, resetKey }: { name: string; logoUrl?: string | null; resetKey: string }) {
  const uid = useId();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const problem = newPasswordProblem(password, again);

  if (!resetKey) {
    return (
      <Shell name={name} logoUrl={logoUrl} title="Invalid reset link">
        <p className="text-[16px] leading-snug">This password-reset link is missing or malformed. Request a new one and try again.</p>
        <a href="/forgot-password" className={BACK}>
          Request a new link
        </a>
      </Shell>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: resetKey, newPassword: password }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "This reset link is invalid or has expired. Request a new one.");
        return;
      }
      setPassword("");
      setAgain("");
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Shell name={name} logoUrl={logoUrl} title="Password updated">
        <p role="status" className="text-[16px] leading-snug">
          Your {name} password has been changed. Sign in with the new one.
        </p>
        <a href="/login" className={SUBMIT + " mt-5"}>
          Sign in
        </a>
      </Shell>
    );
  }

  return (
    <Shell name={name} logoUrl={logoUrl} title="Set a new password">
      <p className="mb-4 text-[15px] leading-snug text-[var(--brand-800)]">Choose a new password for your {name} account. It does not change any personal job-search account.</p>
      <form onSubmit={onSubmit} noValidate>
        <Field id={`${uid}-pw`} label="New password" icon={<LockIcon size={20} />}>
          <input id={`${uid}-pw`} name="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
        </Field>
        <Field id={`${uid}-again`} label="Repeat the new password" icon={<LockIcon size={20} />}>
          <input id={`${uid}-again`} name="confirm-password" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={INPUT} />
        </Field>
        <Alert text={submitted ? (problem ?? error) : error} />
        <button type="submit" disabled={busy} aria-busy={busy} className={SUBMIT}>
          {busy ? (
            "Saving..."
          ) : (
            <>
              Save new password <ArrowRightIcon size={20} />
            </>
          )}
        </button>
      </form>
    </Shell>
  );
}
