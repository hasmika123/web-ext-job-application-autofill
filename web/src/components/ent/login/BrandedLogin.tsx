"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
  ImageIcon,
  LockIcon,
  MailIcon,
  MicrosoftIcon,
  ShieldCheckIcon,
  ShieldIcon,
  cn,
} from "@kiwiply/ui";
import TenantLogo from "@/components/ent/login/TenantLogo";
import { LoginBackdrop } from "@/components/ent/login/AuthBackdrop";
import PolicyLinks, { type PolicyLinkItem } from "@/components/ent/policy/PolicyLinks";
import { safeReturnTo } from "@/lib/tenant-urls";

/**
 * The tenant sign-in (X2.3, rebuilt from the "Welcome Back" boards), one component for every organization, drawn from the
 * PUBLISHED branding at runtime: the org logo (in the slot beside the "Sign In" heading, or the name as a wordmark), the
 * heading ("Welcome Back" unless the org set a title), the subtitle, the colours (through the tenant CSS variables, never a
 * literal), the support address and which social buttons exist (Google / Microsoft, only when the org's login options enable
 * them). Nothing is hard-coded to one organization and nothing falls back to another organization or to the Kiwiply site.
 *
 * Layout: a full-bleed illustrated plate (desk, bee, cat; no baked text) behind live HTML. From 768 px (a tablet or a laptop pane,
 * not just a desktop) the scene fills the screen and the heading + frosted-glass card sit in a panel on the right, so the form is
 * above the fold (the panel is a little narrower and tighter from 768 to 1023, the 1024+ look is unchanged); below 768 the heading,
 * the scene (a capped height on a wide phone), then the card overlapping its lower part.
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
  /** Deprecated and unused since the v2 boards (the feature chips were dropped); kept so existing callers still compile. */
  featureChips?: string[] | null;
  /** The org's login config enables Microsoft sign-in. Default hidden. */
  microsoft?: boolean;
  /** The org's login config enables Google sign-in. Default hidden. */
  google?: boolean;
  /** Branding editor preview: with no logo set, the logo slot shows a dashed "your logo goes here" placeholder (never on the public login). */
  preview?: boolean;
  /** Same-host relative path to land on after sign-in. */
  next?: string;
  /** The organization's policy pages (privacy, terms, ...) for the footer; the four defaults when the page was not given the host's list. */
  policyLinks?: PolicyLinkItem[];
}

type View = "form" | "mfa" | "notMember" | "unavailable";

export const DEFAULT_TITLE = "Welcome Back";
export const DEFAULT_MESSAGE = "Sign in to access your workspace, tasks, and updates.";

/** Only a same-host relative path is allowed as a post-login redirect (no open redirects; the one rule is `safeReturnTo`, X2.10). */
export function safeNext(next?: string | null): string | null {
  return safeReturnTo(next);
}

const DEFAULT_CHIPS = ["Secure Access", "Connect & Collaborate", "Tools for What's Next"];

/** @deprecated The chips are not part of the v2 login; kept as a stable export. */
export function chipLabels(custom?: string[] | null): string[] {
  return DEFAULT_CHIPS.map((d, i) => custom?.[i]?.trim() || d);
}

/** Three rounded ticks beside the heading (the board's sparkle), tinted by the secondary colour. */
const SPARKS: CSSProperties[] = [
  { left: 20, top: 0, transform: "rotate(28deg)" },
  { left: 29, top: 14, transform: "rotate(70deg)" },
  { left: 20, top: 28, transform: "rotate(112deg)" },
];

export default function BrandedLogin({ name, logoUrl, welcomeTitle, welcomeMessage, supportEmail, microsoft = false, google = false, preview = false, next, policyLinks }: BrandedLoginProps) {
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
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; mfaRequired?: boolean; mfaToken?: string; passwordChangeRequired?: boolean };
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
    if (data.passwordChangeRequired) {
      // An administrator-issued temporary password: the only thing the session can do is choose a new one.
      router.push("/change-password");
      router.refresh();
      return;
    }
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

  const title = welcomeTitle?.trim() || DEFAULT_TITLE;
  const subtitle = welcomeMessage?.trim() || DEFAULT_MESSAGE;
  const social = google || microsoft;

  return (
    <main className="tenant-sky relative isolate min-h-dvh overflow-x-hidden text-[var(--brand-900)]" data-tenant-login>
      <LoginBackdrop />
      <div className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col">
        <div className="tenant-panel contents md:absolute md:inset-y-0 md:right-3 lg:right-6 xl:right-10 md:z-10 md:flex md:w-[clamp(400px,50vw,440px)] lg:w-[clamp(420px,34vw,520px)] md:flex-col md:overflow-y-auto md:px-4 md:py-6 lg:px-12 lg:py-10 md:[&>*]:shrink-0 md:[&>:first-child]:mt-auto md:[&>:last-child]:mb-auto">
        {/* ── heading (real text: the plate has none) ── */}
        <section
          className="tenant-login-rise flex min-h-[min(36vw,141px)] flex-col items-center px-6 pt-7 text-center sm:min-h-0 md:mb-5 md:items-start md:p-0 md:text-left lg:mb-8"
          aria-labelledby={`${uid}-title`}
        >
          <h1 id={`${uid}-title`} className="font-body relative max-w-[16ch] text-[32px] font-extrabold leading-[1.05] tracking-tight [text-shadow:0_0_10px_rgb(255_255_255/0.35)] sm:max-w-none sm:text-[40px] md:text-[34px] lg:text-[40px] xl:text-[44px]">
            {title}
            <span aria-hidden className="relative inline-block h-0 w-0 align-top">
              <span className="tenant-spark absolute -top-1 left-2 h-9 w-9 sm:h-11 sm:w-11 lg:top-0">
                {SPARKS.map((st, i) => (
                  <i key={i} style={st} />
                ))}
              </span>
            </span>
          </h1>
          <p className="mt-2 max-w-[30ch] text-[15px] [text-shadow:0_0_8px_rgb(255_255_255/0.35)] leading-snug text-[var(--brand-800)] sm:max-w-[40ch] sm:text-[17px] md:mt-2 md:max-w-none md:text-[16px] lg:mt-3 lg:text-[17px]">{subtitle}</p>
        </section>

        {/* the bee scene lives in the plate; this spacer keeps the card below it on a phone / tablet */}
        <div aria-hidden className="h-[min(70vw,273px)] sm:h-[min(70vw,170px)] md:hidden" />

        {/* ── sign-in card (overlaps the lower part of the scene on a phone) ── */}
        <section className="relative z-10 mx-auto w-full max-w-[480px] px-4 pb-10 sm:px-0 md:max-w-none md:p-0" aria-label="Sign in">
          <div className="tenant-glass rounded-[28px] px-5 py-7 sm:px-9 sm:py-9 md:px-6 md:py-7 lg:px-9 lg:py-9">
            {view === "notMember" && <NotMember name={name} onDifferent={switchAccount} />}
            {view === "unavailable" && <Unavailable onRetry={() => setView(mfaToken ? "mfa" : "form")} />}
            {view === "mfa" && (
              <form onSubmit={onVerify} noValidate>
                <CardHeader title="Check your email" subtitle="We emailed a 6-digit code to verify it's you." name={name} logoUrl={logoUrl} preview={preview} />
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
                <button type="submit" disabled={busy} aria-busy={busy} className={SIGNIN}>
                  {busy ? "Verifying..." : "Verify & sign in"}
                </button>
                <button type="button" onClick={switchAccount} className="mt-4 inline-flex min-h-[44px] items-center text-[14px] font-semibold text-accent-deep hover:underline">
                  <ArrowLeftIcon size={15} className="mr-1.5" /> Back to sign in
                </button>
              </form>
            )}
            {view === "form" && (
              <form onSubmit={onSubmit} noValidate>
                <CardHeader title="Sign In" subtitle={`Sign in to your ${name} account.`} name={name} logoUrl={logoUrl} preview={preview} />

                <Field id={emailId} label="User Name" icon={<MailIcon size={20} />} error={emailErr}>
                  <input
                    ref={emailRef}
                    id={emailId}
                    name="username"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="you@company.com"
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
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-[var(--brand-800)] transition-colors hover:text-[var(--brand-900)]"
                  >
                    {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
                  </button>
                </Field>

                <div className="mb-4 flex items-center justify-between gap-3">
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[15px] font-medium text-[var(--brand-800)]">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-[22px] w-[22px] rounded-md border border-line accent-[var(--brand-solid)]" />
                    Remember me
                  </label>
                  <a href="/forgot-password" className="text-[15px] font-semibold text-accent-deep hover:underline">
                    Forgot password?
                  </a>
                </div>

                <ErrorLine id={errorId} message={error} />

                <button type="submit" disabled={busy} aria-busy={busy} className={SIGNIN}>
                  {busy ? "Signing in..." : <>Sign In <ArrowRightIcon size={20} /></>}
                </button>
                <p data-account-note className="mt-3 text-center text-[13px] leading-snug text-[var(--brand-800)]">
                  Your {name} account belongs to {name}. It is separate from any personal Kiwiply account.
                </p>

                {social && (
                  <>
                    <div className="my-4 flex items-center gap-4 text-[13px] font-medium tracking-wide text-[var(--brand-800)]" role="separator" aria-label="or">
                      <span className="h-px flex-1 bg-[var(--brand-border)]" />
                      OR
                      <span className="h-px flex-1 bg-[var(--brand-border)]" />
                    </div>
                    <div className={cn("grid gap-3", google && microsoft ? "sm:grid-cols-2" : "grid-cols-1")}>
                      {google && (
                        <a href="/sso/google" data-sso="google" className={SOCIAL}>
                          <GoogleIcon size={22} />
                          Continue with Google
                        </a>
                      )}
                      {microsoft && (
                        <a href="/sso/microsoft" data-sso="microsoft" className={SOCIAL}>
                          <MicrosoftIcon size={22} />
                          Continue with Microsoft
                        </a>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-5 space-y-1 text-center text-[13.5px] text-[var(--brand-800)]">
                  <p>
                    <ShieldIcon size={16} aria-hidden className="mr-1.5 inline-block align-[-3px]" />
                    Secure access protected by industry standards.
                  </p>
                  <p>
                    Need help?{" "}
                    {supportEmail ? (
                      <a href={`mailto:${supportEmail}`} className="font-semibold text-accent-deep hover:underline">
                        Contact IT Support
                      </a>
                    ) : (
                      <span>Contact IT Support</span>
                    )}
                  </p>
                  <PolicyLinks links={policyLinks} tone="plain" className="pt-1" />
                </div>
              </form>
            )}
          </div>
        </section>
        </div>
      </div>
    </main>
  );
}

const INPUT = "tenant-glass-field h-[52px] w-full rounded-xl pl-12 pr-4 text-[16px] text-[var(--brand-900)] placeholder:text-[var(--brand-700)]/80";
const SIGNIN = "tenant-signin inline-flex h-[54px] w-full items-center justify-center gap-3 rounded-xl text-[18px] font-semibold transition-[filter] hover:brightness-105 disabled:cursor-not-allowed";
const SOCIAL =
  "tenant-glass-field flex h-[50px] w-full items-center justify-center gap-2.5 rounded-xl text-[14.5px] font-semibold text-[var(--brand-900)] transition-colors hover:bg-white";

/** Heading on the left; behind a thin divider, the org logo slot on the right (dashed placeholder only in the editor preview). */
function CardHeader({ title, subtitle, name, logoUrl, preview }: { title: string; subtitle: string; name: string; logoUrl?: string | null; preview: boolean }) {
  const placeholder = preview && !logoUrl;
  return (
    <div className="mb-6 flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="font-body text-[32px] font-extrabold leading-tight tracking-tight sm:text-[38px] md:text-[32px] lg:text-[38px]">{title}</h2>
        <p className="mt-1 text-[15px] leading-snug text-[var(--brand-800)] sm:text-[16px]">{subtitle}</p>
      </div>
      <span aria-hidden className="h-16 w-px shrink-0 bg-[var(--brand-border)] sm:h-20" />
      <div
        data-logo-slot={placeholder ? "placeholder" : "logo"}
        className={cn(
          "grid h-[68px] w-[92px] shrink-0 place-items-center rounded-2xl p-2 sm:h-[84px] sm:w-[116px] md:h-[68px] md:w-[92px] lg:h-[84px] lg:w-[116px]",
          placeholder && "border-2 border-dashed border-[var(--brand-border)] bg-[var(--brand-subtle)] text-[var(--brand-text)]",
        )}
      >
        {placeholder ? <ImageIcon size={34} aria-label="Your logo appears here" role="img" /> : <TenantLogo name={name} logoUrl={logoUrl} size="slot" />}
      </div>
    </div>
  );
}

function Field({ id, label, icon, error, children }: { id: string; label: string; icon: ReactNode; error?: string; children: ReactNode }) {
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
      <p className="mx-auto mt-3 max-w-[34ch] text-[16px] leading-snug text-[var(--brand-800)]">
        This account isn&apos;t part of {name}&apos;s workspace. Ask an administrator for an invitation, or sign in with a different account.
      </p>
      <button type="button" onClick={onDifferent} className={cn(SIGNIN, "mt-6")}>
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
      <p className="mx-auto mt-3 max-w-[34ch] text-[16px] leading-snug text-[var(--brand-800)]">Nothing was signed in. Please try again in a moment.</p>
      <button type="button" onClick={onRetry} className={cn(SIGNIN, "mt-6")}>
        Try again
      </button>
    </div>
  );
}
