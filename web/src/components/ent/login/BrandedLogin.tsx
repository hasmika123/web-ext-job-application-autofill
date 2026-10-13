"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BarChartIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  MicrosoftIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import TenantLogo from "@/components/ent/login/TenantLogo";

/**
 * The tenant sign-in (X2.3), one component for every organization, drawn from the PUBLISHED branding at runtime:
 * the logo (or the name as a wordmark), the headline "Welcome to {name} Portal", the subtitle, the primary / secondary
 * colours (through the tenant CSS variables, never a literal), the support address and whether the Microsoft button exists.
 * Nothing is hard-coded to one organization and nothing falls back to another organization or to the Kiwiply site.
 *
 * Layout (design/enterprise-login boards): two panels from 1024 px (welcome + scene on the left, the card on the right);
 * below that one column - logo, title, three feature chips, the scene, then the card overlapping the scene.
 *
 * States: the form; the admin / org MFA code step; NOT_A_MEMBER (correct credentials, no seat: a calm panel with "use a
 * different account" and no organization data); UNAVAILABLE (the API could not be reached: try again); 401 (an inline
 * error); 429 (too many attempts).
 */
export interface BrandedLoginProps {
  name: string;
  logoUrl?: string | null;
  welcomeTitle?: string | null;
  welcomeMessage?: string | null;
  supportEmail?: string | null;
  /** Up to three published chip labels (defaults fill the rest). */
  featureChips?: string[] | null;
  /** The org's login config enables Microsoft sign-in (Phase 12). Default hidden. */
  microsoft?: boolean;
  /** Same-host relative path to land on after sign-in. */
  next?: string;
}

type View = "form" | "mfa" | "notMember" | "unavailable";

const DEFAULT_MESSAGE = "Secure access for employees, consultants, and teams.";

/** Only a same-host relative path is allowed as a post-login redirect (no open redirects). */
export function safeNext(next?: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/** Defaults for the three chips; an organization's published `featureChips` replace them label by label. Tints come from the theme. */
const DEFAULT_CHIPS = ["Secure Access", "Connect & Collaborate", "Tools for What's Next"];
const CHIP_STYLE: { Icon: typeof ShieldIcon; tone: string }[] = [
  { Icon: ShieldIcon, tone: "bg-[var(--brand-subtle)] text-[var(--brand-text)]" },
  { Icon: UsersIcon, tone: "bg-[var(--brand-2-subtle)] text-[var(--brand-2-text)]" },
  { Icon: BarChartIcon, tone: "bg-[var(--brand-100)] text-[var(--brand-800)]" },
];

/** The three chip labels: the published ones where given, else the defaults (never fewer than three). */
export function chipLabels(custom?: string[] | null): string[] {
  return DEFAULT_CHIPS.map((d, i) => custom?.[i]?.trim() || d);
}

export default function BrandedLogin({ name, logoUrl, welcomeTitle, welcomeMessage, supportEmail, featureChips, microsoft = false, next }: BrandedLoginProps) {
  const router = useRouter();
  const uid = useId();
  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;
  const errorId = `${uid}-error`;
  const emailRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<View>("form");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // "Remember me" remembers the work email on this device (the session itself is the usual rolling one).
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem(`tenant_email:${location.host}`);
        if (saved) {
          setUsername(saved);
          setRemember(true);
        }
      } catch {
        /* storage blocked: nothing to remember */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const emailErr = submitted && !username.trim() ? "Enter your work email." : "";
  const passwordErr = submitted && !password ? "Enter your password." : "";

  function finish() {
    try {
      if (remember) localStorage.setItem(`tenant_email:${location.host}`, username.trim());
      else localStorage.removeItem(`tenant_email:${location.host}`);
    } catch {
      /* ignore */
    }
    router.push(safeNext(next) ?? "/");
    router.refresh();
  }

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; mfaRequired?: boolean; mfaToken?: string };
      return { res, data };
    } catch {
      setView("unavailable");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!username.trim() || !password) return;
    const r = await post("/api/auth/login", { username: username.trim(), password });
    if (!r) return;
    const { res, data } = r;
    if (res.status === 403 && data.code === "NOT_A_MEMBER") return setView("notMember");
    if (res.status >= 500) return setView("unavailable");
    if (res.status === 429) return setError("Too many attempts. Wait a few minutes and try again.");
    if (!res.ok) return setError(res.status === 401 ? "Incorrect email or password." : (data.error ?? "Sign in failed."));
    if (data.mfaRequired && data.mfaToken) {
      setMfaToken(data.mfaToken);
      setView("mfa");
      return;
    }
    finish();
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError("Enter the code we emailed you.");
    const r = await post("/api/auth/login/mfa", { mfaToken, code });
    if (!r) return;
    const { res, data } = r;
    if (res.status === 403 && data.code === "NOT_A_MEMBER") return setView("notMember");
    if (res.status >= 500) return setView("unavailable");
    if (!res.ok) return setError(data.error ?? "That code is incorrect or expired.");
    finish();
  }

  function switchAccount() {
    setView("form");
    setPassword("");
    setSubmitted(false);
    setError(null);
    setMfaToken(null);
    setCode("");
    setUsername("");
    setTimeout(() => emailRef.current?.focus(), 0);
  }

  const headline = welcomeTitle?.trim() || null;

  return (
    <main className="tenant-sky relative min-h-dvh overflow-x-hidden text-[var(--brand-900)]" data-tenant-login>
      <div className="mx-auto flex min-h-dvh w-full max-w-[1480px] flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,540px)] lg:items-center lg:gap-10 lg:px-10 xl:px-16">
        {/* ── welcome panel ── */}
        <section className="flex flex-col items-center px-5 pt-8 text-center lg:items-start lg:px-0 lg:py-14 lg:text-left" aria-labelledby={`${uid}-title`}>
          <TenantLogo name={name} logoUrl={logoUrl} size="lg" className="max-w-full" />

          <h1 id={`${uid}-title`} className="font-body mt-6 max-w-[16ch] text-[34px] font-extrabold leading-[1.04] tracking-tight sm:max-w-none sm:text-[44px] lg:mt-12 lg:text-[56px] xl:text-[64px]">
            {headline ? (
              headline
            ) : (
              <>
                Welcome to
                <br />
                <span className="tenant-headline-accent">{name} Portal</span>
              </>
            )}
          </h1>
          <p className="mt-3 max-w-[34ch] text-[16px] leading-snug text-[var(--brand-700)] sm:text-[18px] lg:mt-5 lg:max-w-[28ch] lg:text-[24px]">
            {welcomeMessage?.trim() || DEFAULT_MESSAGE}
          </p>

          <ul className="mt-5 flex w-full max-w-[460px] items-start justify-center gap-4 sm:gap-8 lg:mt-8 lg:max-w-none lg:justify-start lg:gap-8">
            {chipLabels(featureChips).map((label, i) => {
              const { Icon, tone } = CHIP_STYLE[i];
              return (
              <li key={i} className="flex flex-col items-center gap-1.5 text-center text-[13.5px] font-medium leading-tight sm:text-[14.5px] lg:flex-row lg:gap-3 lg:text-left">
                <span aria-hidden className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full lg:h-14 lg:w-14", tone)}>
                  <Icon size={22} />
                </span>
                <span className="max-w-[12ch] lg:max-w-[14ch]">{label}</span>
              </li>
              );
            })}
          </ul>

          {/* the scene art: its edges are masked so it melts into the sky (theme-tenant.css) */}
          <div className="tenant-scene relative mt-2 hidden w-full max-w-[640px] lg:-ml-6 lg:mt-4 lg:block" aria-hidden>
            <Image src="/ent/login/scene-desktop.png" alt="" width={826} height={581} sizes="(min-width: 1280px) 640px, 520px" priority className="h-auto w-full select-none" />
          </div>
          <div className="tenant-scene relative -mb-6 mt-1 w-full max-w-[560px] sm:max-w-[640px] lg:hidden" aria-hidden>
            <Image src="/ent/login/scene-mobile.png" alt="" width={941} height={408} sizes="(min-width: 640px) 640px, 100vw" priority className="h-auto w-full select-none" />
          </div>
        </section>

        {/* ── sign-in card (overlaps the scene on a phone) ── */}
        <section className="relative z-10 mx-auto w-full max-w-[540px] px-4 pb-10 sm:px-0 lg:px-0 lg:py-12" aria-label="Sign in">
          <div className="tenant-card rounded-[24px] bg-white px-6 py-8 sm:px-10 sm:py-10">
            {view === "notMember" && <NotMember name={name} onDifferent={switchAccount} />}
            {view === "unavailable" && <Unavailable onRetry={() => setView(mfaToken ? "mfa" : "form")} />}
            {view === "mfa" && (
              <form onSubmit={onVerify} noValidate>
                <CardTitle title="Check your email" subtitle="We emailed a 6-digit code to verify it's you. Enter it to finish signing in." />
                <Field id={`${uid}-code`} label="Verification code" icon={<ShieldCheckIcon size={20} />} error={undefined}>
                  <input
                    id={`${uid}-code`}
                    name="one-time-code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    autoFocus
                    aria-describedby={error ? errorId : undefined}
                    className={INPUT}
                  />
                </Field>
                <ErrorLine id={errorId} message={error} />
                <button type="submit" disabled={busy} aria-busy={busy} className={buttonVariants("accent", "lg", PRIMARY)}>
                  {busy ? "Verifying..." : "Verify & sign in"}
                </button>
                <button type="button" onClick={switchAccount} className="mt-4 inline-flex min-h-[44px] items-center text-[14px] font-semibold text-accent-deep hover:underline">
                  <ArrowLeftIcon size={15} className="mr-1.5" /> Back to sign in
                </button>
              </form>
            )}
            {view === "form" && (
              <form onSubmit={onSubmit} noValidate>
                <div className="mb-6 hidden justify-center lg:flex">
                  <TenantLogo name={name} logoUrl={logoUrl} />
                </div>
                <CardTitle title="Sign In" subtitle={`Access your ${name} account to continue.`} />

                <Field id={emailId} label="Work Email" icon={<MailIcon size={20} />} error={emailErr}>
                  <input
                    ref={emailRef}
                    id={emailId}
                    name="username"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={`you@${domainHint(supportEmail)}`}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={emailErr ? true : undefined}
                    aria-describedby={emailErr ? `${emailId}-msg` : undefined}
                    className={INPUT}
                  />
                </Field>

                <Field id={passwordId} label="Password" icon={<LockIcon size={20} />} error={passwordErr}>
                  <input
                    id={passwordId}
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={passwordErr ? true : undefined}
                    aria-describedby={passwordErr ? `${passwordId}-msg` : undefined}
                    className={cn(INPUT, "pr-12")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-v2-muted transition-colors hover:text-[var(--brand-900)]"
                  >
                    {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
                  </button>
                </Field>

                <div className="mb-5 flex items-center justify-between gap-3">
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[15px] font-medium">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-[22px] w-[22px] rounded-md border border-line accent-[var(--brand-solid)]" />
                    Remember me
                  </label>
                  <a href="/forgot-password" className="text-[15px] font-semibold text-accent-deep hover:underline">
                    Forgot Password?
                  </a>
                </div>

                <ErrorLine id={errorId} message={error} />

                <button type="submit" disabled={busy} aria-busy={busy} className={buttonVariants("accent", "lg", PRIMARY)}>
                  {busy ? "Signing in..." : <>Sign In <ArrowRightIcon size={18} /></>}
                </button>

                {microsoft && (
                  <>
                    <div className="my-5 flex items-center gap-4 text-[14px] text-v2-muted" role="separator" aria-label="or">
                      <span className="h-px flex-1 bg-line" />
                      or
                      <span className="h-px flex-1 bg-line" />
                    </div>
                    <a href="/sso/microsoft" className="flex h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-line bg-paper text-[16px] font-semibold transition-colors hover:bg-paper-2">
                      <MicrosoftIcon size={22} />
                      Sign in with Microsoft
                    </a>
                  </>
                )}

                <div className="mt-6 space-y-1.5 text-center text-[13.5px] text-v2-muted">
                  <p className="flex items-center justify-center gap-2">
                    <LockIcon size={14} aria-hidden /> Secure access protected by {name}.
                  </p>
                  {supportEmail ? (
                    <p>
                      Need help? Contact IT Support at{" "}
                      <a href={`mailto:${supportEmail}`} className="font-semibold text-accent-deep hover:underline">
                        {supportEmail}
                      </a>
                    </p>
                  ) : null}
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

const INPUT =
  "h-[52px] w-full rounded-xl border border-line bg-paper pl-12 pr-4 text-[16px] text-[var(--brand-900)] placeholder:text-v2-muted/80 focus-visible:border-[var(--brand-ring)]";
const PRIMARY = "h-[52px] w-full gap-3 rounded-xl text-[17px]";

function domainHint(email?: string | null): string {
  const at = email?.indexOf("@") ?? -1;
  return email && at > 0 ? email.slice(at + 1) : "company.com";
}

function CardTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-7 text-center">
      <h2 className="font-body text-[30px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{title}</h2>
      <p className="mx-auto mt-2 max-w-[30ch] text-[16px] leading-snug text-v2-ink-soft">{subtitle}</p>
    </div>
  );
}

function Field({ id, label, icon, error, children }: { id: string; label: string; icon: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-2 block text-[15px] font-semibold">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-v2-ink-soft">
          {icon}
        </span>
        {children}
      </div>
      {error ? (
        <p id={`${id}-msg`} className="mt-1.5 text-[13px] font-medium text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Always in the DOM (an empty polite live region) so a screen reader announces the message when it appears. */
function ErrorLine({ id, message }: { id: string; message: string | null }) {
  return (
    <div id={id} role="alert" aria-live="polite" className={message ? "mb-4 flex items-start gap-2 rounded-lg bg-v2-coral-soft px-3 py-2.5 text-[14px] font-medium text-danger-text" : "sr-only"}>
      {message ? (
        <>
          <AlertIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{message}</span>
        </>
      ) : null}
    </div>
  );
}

function NotMember({ name, onDifferent }: { name: string; onDifferent: () => void }) {
  return (
    <div role="status" className="py-4 text-center" data-login-state="not-a-member">
      <span aria-hidden className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[var(--brand-subtle)] text-[var(--brand-text)]">
        <ShieldIcon size={26} />
      </span>
      <h2 className="font-body text-[26px] font-extrabold leading-tight tracking-tight">You&apos;re not a member of {name}</h2>
      <p className="mx-auto mt-3 max-w-[34ch] text-[16px] leading-snug text-v2-ink-soft">
        This account isn&apos;t part of {name}&apos;s workspace. Ask an administrator for an invitation, or sign in with a different account.
      </p>
      <button type="button" onClick={onDifferent} className={buttonVariants("accent", "lg", `${PRIMARY} mt-6`)}>
        Use a different account
      </button>
    </div>
  );
}

function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="status" className="py-4 text-center" data-login-state="unavailable">
      <span aria-hidden className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-v2-amber-soft text-v2-amber-ink">
        <AlertIcon size={26} />
      </span>
      <h2 className="font-body text-[26px] font-extrabold leading-tight tracking-tight">We couldn&apos;t reach the server</h2>
      <p className="mx-auto mt-3 max-w-[34ch] text-[16px] leading-snug text-v2-ink-soft">Nothing was signed in. Please try again in a moment.</p>
      <button type="button" onClick={onRetry} className={buttonVariants("accent", "lg", `${PRIMARY} mt-6`)}>
        Try again
      </button>
    </div>
  );
}
