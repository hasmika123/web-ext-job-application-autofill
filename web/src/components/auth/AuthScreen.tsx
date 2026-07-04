"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { track } from "@/lib/analytics";
import { Input, PasswordInput, Field, Logo, BetaBadge } from "@/components/ui";
import { ChevronLeftIcon } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { isEmail, isUsername, LIMITS } from "@/lib/validate";
import GoogleSignIn from "@/components/auth/GoogleSignIn";

type Mode = "login" | "signup";

/** Only a same-site relative path is allowed as a post-login redirect (no open redirects). */
function safeNext(next?: string): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

function withNext(path: string, next?: string): string {
  const n = safeNext(next);
  return n ? `${path}?next=${encodeURIComponent(n)}` : path;
}

function Tabs({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  return (
    <div className="mb-6 flex rounded-full bg-paper-2 p-1">
      {(["login", "signup"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => m !== mode && router.push(withNext(m === "login" ? "/login" : "/signup", next))}
          aria-current={m === mode ? "page" : undefined}
          className={cn(
            "flex-1 rounded-full py-2.5 text-[13.5px] font-semibold transition-colors",
            m === mode ? "bg-paper text-ink shadow-[var(--shadow)]" : "text-muted hover:text-ink-soft",
          )}
        >
          {m === "login" ? "Sign in" : "Create account"}
        </button>
      ))}
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null); // set when admin MFA is required
  const [code, setCode] = useState("");

  const errs: Record<string, string> = {};
  if (!username.trim()) errs.username = "Username is required";
  if (!password) errs.password = "Password is required";
  const show = (n: string) => submitted || touched[n];
  const touch = (n: string) => setTouched((t) => ({ ...t, [n]: true }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sign in failed.");
        return;
      }
      // Admin MFA (Phase 9.X.3): password OK, but a code was emailed — go to the second step.
      if (data.mfaRequired && data.mfaToken) {
        setMfaToken(data.mfaToken);
        return;
      }
      track("login", { method: "password" });
      router.push(safeNext(next) ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyMfa(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Enter the code we emailed you.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login/mfa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mfaToken, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That code is incorrect or expired.");
        return;
      }
      track("login", { method: "password_mfa" });
      router.push(safeNext(next) ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (mfaToken) {
    return (
      <>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Check your email</h1>
        <p className="mb-6 mt-1 text-sm text-muted">We emailed a 6-digit code to verify it&apos;s you. Enter it to finish signing in.</p>
        <form onSubmit={verifyMfa} noValidate>
          <Field label="Verification code" htmlFor="login-mfa-code">
            <Input
              id="login-mfa-code"
              name="one-time-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </Field>
          {error && (
            <p role="alert" className="mb-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={cn(buttonVariants("accent"), "w-full")}>
            {busy ? "Verifying…" : "Verify & sign in"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMfaToken(null);
            setCode("");
            setError(null);
          }}
          className="mt-4 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          ← Back to sign in
        </button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Sign in to pick up where you left off.</p>
      <Tabs mode="login" next={next} />
      <form onSubmit={onSubmit} noValidate>
        <Field label="Username" htmlFor="login-username" error={show("username") ? errs.username : undefined}>
          <Input
            id="login-username"
            name="username"
            autoComplete="username"
            maxLength={LIMITS.username}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => touch("username")}
            aria-invalid={show("username") && !!errs.username}
          />
        </Field>
        <Field label="Password" htmlFor="login-password" error={show("password") ? errs.password : undefined}>
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            maxLength={LIMITS.passwordMax}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => touch("password")}
            aria-invalid={show("password") && !!errs.password}
          />
        </Field>
        <div className="mb-4 -mt-1 text-right">
          <Link href="/forgot-password" className="text-[13px] font-medium text-accent-deep hover:underline">
            Forgot password?
          </Link>
        </div>
        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={cn(buttonVariants("accent"), "w-full")}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <Divider />
      <GoogleSignIn next={next} />
    </>
  );
}

function SignupForm({ next }: { next?: string }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [newsletter, setNewsletter] = useState(false); // separate, unticked marketing opt-in

  const errs: Record<string, string> = {};
  if (!username.trim()) errs.username = "Username is required";
  else if (!isUsername(username)) errs.username = "Use letters, numbers, and . _ - @ + (max 50)";
  if (!email.trim()) errs.email = "Email is required";
  else if (!isEmail(email)) errs.email = "Enter a valid email address";
  if (!password) errs.password = "Password is required";
  else if (password.length < LIMITS.passwordMin) errs.password = `Use at least ${LIMITS.passwordMin} characters`;
  else if (password.length > LIMITS.passwordMax) errs.password = `Use at most ${LIMITS.passwordMax} characters`;
  const show = (n: string) => submitted || touched[n];
  const touch = (n: string) => setTouched((t) => ({ ...t, [n]: true }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the account.");
        return;
      }
      track("sign_up", { method: "password" });
      // Marketing opt-in is SEPARATE from the account (explicit, unticked). Fire-and-forget —
      // it triggers its own double-opt-in confirmation email and must never block signup.
      if (newsletter) {
        fetch("/api/newsletter", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, source: "signup" }),
        }).catch(() => {});
      }
      // Remember where to go after the email-activation round-trip (e.g. /connect), so a
      // brand-new user lands back there once they activate + sign in. Best-effort: only
      // works when activation happens in the same browser.
      const n = safeNext(next);
      if (n) {
        try {
          localStorage.setItem("kiwiply_next", n);
        } catch {
          /* ignore */
        }
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
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Almost there</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          We&apos;ve created your account and sent an activation link to{" "}
          <span className="font-semibold text-ink">{email}</span>. Click it to finish setting up,
          then sign in.
        </p>
        <Link href={withNext("/login", next)} className={cn(buttonVariants("ghost"), "mt-7")}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Start applying faster in under a minute.</p>
      <Tabs mode="signup" next={next} />
      <form onSubmit={onSubmit} noValidate>
        <Field label="Username" htmlFor="signup-username" error={show("username") ? errs.username : undefined}>
          <Input
            id="signup-username"
            name="username"
            autoComplete="username"
            maxLength={LIMITS.username}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => touch("username")}
            aria-invalid={show("username") && !!errs.username}
          />
        </Field>
        <Field label="Email" htmlFor="signup-email" error={show("email") ? errs.email : undefined}>
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={LIMITS.emailMax}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => touch("email")}
            aria-invalid={show("email") && !!errs.email}
          />
        </Field>
        <Field label="Password" htmlFor="signup-password" error={show("password") ? errs.password : undefined}>
          <PasswordInput
            id="signup-password"
            name="password"
            autoComplete="new-password"
            maxLength={LIMITS.passwordMax}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => touch("password")}
            aria-invalid={show("password") && !!errs.password}
          />
        </Field>
        <label className="mb-4 flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-soft">
          <input
            type="checkbox"
            checked={newsletter}
            onChange={(e) => setNewsletter(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none accent-[var(--color-accent)]"
          />
          <span>Send me occasional product updates and tips (optional). You can unsubscribe anytime.</span>
        </label>
        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={cn(buttonVariants("accent"), "w-full")}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Kiwiply is in beta and provided “as is”. By creating an account you agree to our{" "}
          <Link href="/terms" className="font-medium text-accent-deep hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-accent-deep hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
      <Divider />
      <GoogleSignIn next={next} />
    </>
  );
}

/** Split-screen auth shared by /login + /signup (tabbed). Branded panel hidden on mobile. */
export default function AuthScreen({ mode, next }: { mode: Mode; next?: string }) {
  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-2">
      {/* Brand panel (desktop only) */}
      <div
        className="hidden flex-col p-[52px] text-hero-ink lg:flex"
        style={{ background: "linear-gradient(165deg, #2D3133, #2F3330, #37322B)" }}
      >
        <Link href="/" aria-label="Kiwiply" className="flex items-center gap-2.5">
          <Image src="/logo-dark-mode.png" alt="Kiwiply" width={108} height={32} priority className="h-8 w-auto" />
          <BetaBadge tone="dark" />
        </Link>
        <div className="my-auto">
          <h2 className="max-w-[380px] font-display text-[32px] font-semibold leading-tight">
            Your whole job search, in one tidy file.
          </h2>
          <p className="mt-4 max-w-[360px] text-[15px] leading-relaxed text-[color-mix(in_srgb,var(--color-hero-ink)_78%,transparent)]">
            Create your profile once and let the extension do the typing. Free to start — no card
            required.
          </p>
        </div>
        <blockquote className="border-l-[3px] border-accent pl-4 text-sm leading-relaxed text-[color-mix(in_srgb,var(--color-hero-ink)_82%,transparent)]">
          &quot;I went from 20 minutes per application to about 90 seconds. The tracker filling
          itself is the part I didn&apos;t know I needed.&quot;
          <span className="mt-2 block text-[color-mix(in_srgb,var(--color-hero-ink)_60%,transparent)]">
            — early user
          </span>
        </blockquote>
      </div>

      {/* Form */}
      <div className="relative flex flex-1 items-center justify-center bg-app-bg p-6 sm:p-10">
        {/* Back to landing — pinned to the top-left corner so it adds no vertical height */}
        <Link
          href="/"
          className="absolute left-4 top-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink sm:left-6 sm:top-6"
        >
          <ChevronLeftIcon strokeWidth={1.6} className="h-4 w-4" />
          Back
        </Link>
        <div className="w-full max-w-[380px]">
          {/* Mobile brand — the dark panel (with its logo) is hidden below lg */}
          <Link href="/" aria-label="Kiwiply" className="mb-8 flex items-center gap-2 lg:hidden">
            <Logo height={26} />
            <BetaBadge />
          </Link>
          {mode === "login" ? <LoginForm next={next} /> : <SignupForm next={next} />}
        </div>
      </div>
    </div>
  );
}
