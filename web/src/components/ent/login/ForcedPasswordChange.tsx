"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, ArrowRightIcon, EyeIcon, EyeOffIcon, LockIcon, cn } from "@kiwiply/ui";
import TenantLogo from "@/components/ent/login/TenantLogo";

/**
 * The forced first-sign-in password change on a tenant host. An administrator created this account with a temporary password;
 * until the person chooses their own, the API answers every other call with 403 PASSWORD_CHANGE_REQUIRED and the proxy sends every
 * page here. Same branded look as the sign-in (the tenant colour variables and glass card), no navigation, no way around it except
 * signing out. On success the session cookies are already swapped for a clean pair, so the person goes to their normal landing.
 */
export const PASSWORD_MIN = 4; // the platform rule (ManagedUserVM.PASSWORD_MIN_LENGTH); the API enforces it, this is only so the button is not lit for nothing
export const PASSWORD_MAX = 100; // config-literal-ok: the platform rule's other end, mirrored for the hint only

export interface ForcedPasswordChangeProps {
  name: string;
  logoUrl?: string | null;
}

/** Why the form cannot be sent yet, or null. */
export function passwordProblem(current: string, next: string, again: string): string | null {
  if (!current) return "Enter the temporary password you were given.";
  if (next.length < PASSWORD_MIN) return `Choose a password of at least ${PASSWORD_MIN} characters.`;
  if (next.length > PASSWORD_MAX) return `Choose a password of at most ${PASSWORD_MAX} characters.`;
  if (next === current) return "Choose a password different from the temporary one.";
  if (next !== again) return "The two new passwords do not match.";
  return null;
}

export default function ForcedPasswordChange({ name, logoUrl }: ForcedPasswordChangeProps) {
  const router = useRouter();
  const uid = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = passwordProblem(current, next, again);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "The password could not be changed.");
        return;
      }
      setCurrent("");
      setNext("");
      setAgain("");
      router.push("/");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";
  return (
    <main className="tenant-sky relative isolate min-h-dvh overflow-x-hidden text-[var(--brand-900)]" data-tenant-change-password>
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center px-4 py-10">
        <section aria-label="Choose your password" className="tenant-glass rounded-[28px] px-5 py-7 sm:px-9 sm:py-9">
          <div className="mb-6 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="font-body text-[30px] font-extrabold leading-tight tracking-tight sm:text-[34px]">Choose your password</h1>
              <p className="mt-1 text-[15px] leading-snug text-[var(--brand-800)]">
                Your administrator gave you a temporary password for {name}. Choose one only you know to continue.
              </p>
            </div>
            <span aria-hidden className="h-16 w-px shrink-0 bg-[var(--brand-border)]" />
            <div className="grid h-[68px] w-[92px] shrink-0 place-items-center rounded-2xl p-2">
              <TenantLogo name={name} logoUrl={logoUrl} size="slot" />
            </div>
          </div>

          <form onSubmit={onSubmit} noValidate>
            <Field id={`${uid}-current`} label="Temporary password">
              <input id={`${uid}-current`} name="current-password" type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={cn(INPUT, "pr-12")} />
            </Field>
            <Field id={`${uid}-new`} label="New password" hint={`At least ${PASSWORD_MIN} characters. Longer is safer.`}>
              <input id={`${uid}-new`} name="new-password" type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={cn(INPUT, "pr-12")} />
            </Field>
            <Field id={`${uid}-again`} label="Repeat the new password">
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

            <div role="alert" aria-live="polite" className={submitted && (problem || error) ? "mb-4 flex items-start gap-2 rounded-lg bg-v2-coral-soft px-3 py-2.5 text-[14px] font-medium text-danger-text" : "sr-only"}>
              {submitted && (problem || error) ? (
                <>
                  <AlertIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>{problem ?? error}</span>
                </>
              ) : null}
            </div>

            <button type="submit" disabled={busy} aria-busy={busy} className={SUBMIT}>
              {busy ? (
                "Saving..."
              ) : (
                <>
                  Save and continue <ArrowRightIcon size={20} />
                </>
              )}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

const INPUT = "tenant-glass-field h-[52px] w-full rounded-xl pl-12 pr-4 text-[16px] text-[var(--brand-900)] placeholder:text-[var(--brand-700)]/80";
const SUBMIT = "tenant-signin inline-flex h-[54px] w-full items-center justify-center gap-3 rounded-xl text-[18px] font-semibold transition-[filter] hover:brightness-105 disabled:cursor-not-allowed";

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
