"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { Input, Field, Logo, BrandLockup, BetaBadge } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { isEmail } from "@/lib/validate";

type Mode = "login" | "signup";

/** Multicolor Google "G" (stubbed button — OAuth not wired yet). */
function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function Tabs({ mode }: { mode: Mode }) {
  const router = useRouter();
  return (
    <div className="mb-6 flex rounded-full bg-paper-2 p-1">
      {(["login", "signup"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => m !== mode && router.push(m === "login" ? "/login" : "/signup")}
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

function GoogleStub() {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className={cn(buttonVariants("ghost"), "w-full cursor-not-allowed gap-2.5 opacity-70")}
    >
      <GoogleG /> Continue with Google
      <span className="text-xs font-normal text-muted">soon</span>
    </button>
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

function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      track("login", { method: "password" });
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Sign in to pick up where you left off.</p>
      <Tabs mode="login" />
      <form onSubmit={onSubmit} noValidate>
        <Field label="Username" htmlFor="login-username" error={show("username") ? errs.username : undefined}>
          <Input
            id="login-username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => touch("username")}
            aria-invalid={show("username") && !!errs.username}
          />
        </Field>
        <Field label="Password" htmlFor="login-password" error={show("password") ? errs.password : undefined}>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => touch("password")}
            aria-invalid={show("password") && !!errs.password}
          />
        </Field>
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
      <GoogleStub />
    </>
  );
}

function SignupForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const errs: Record<string, string> = {};
  if (!username.trim()) errs.username = "Username is required";
  if (!email.trim()) errs.email = "Email is required";
  else if (!isEmail(email)) errs.email = "Enter a valid email address";
  if (!password) errs.password = "Password is required";
  else if (password.length < 4) errs.password = "Use at least 4 characters";
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
        <Link href="/login" className={cn(buttonVariants("ghost"), "mt-7")}>
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Start applying faster in under a minute.</p>
      <Tabs mode="signup" />
      <form onSubmit={onSubmit} noValidate>
        <Field label="Username" htmlFor="signup-username" error={show("username") ? errs.username : undefined}>
          <Input
            id="signup-username"
            name="username"
            autoComplete="username"
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => touch("email")}
            aria-invalid={show("email") && !!errs.email}
          />
        </Field>
        <Field label="Password" htmlFor="signup-password" error={show("password") ? errs.password : undefined}>
          <Input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => touch("password")}
            aria-invalid={show("password") && !!errs.password}
          />
        </Field>
        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={cn(buttonVariants("accent"), "w-full")}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Kiwiply is in beta and provided “as is”. By creating an account you agree to how Kiwiply
          handles your data, described in our{" "}
          <Link href="/privacy" className="font-medium text-accent-deep hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
      <Divider />
      <GoogleStub />
    </>
  );
}

/** Split-screen auth shared by /login + /signup (tabbed). Branded panel hidden on mobile. */
export default function AuthScreen({ mode }: { mode: Mode }) {
  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-2">
      {/* Brand panel (desktop only) */}
      <div
        className="hidden flex-col p-[52px] text-hero-ink lg:flex"
        style={{ background: "var(--hero-bg)" }}
      >
        <Link href="/" aria-label="Kiwiply" className="flex items-center gap-2">
          <BrandLockup plyColor="var(--hero-ink)" size={28} />
          <BetaBadge tone="dark" />
        </Link>
        <div className="my-auto">
          <h2 className="max-w-[380px] font-display text-[32px] font-semibold leading-tight">
            Your whole job search, in one tidy file.
          </h2>
          <p className="mt-4 max-w-[360px] text-[15px] leading-relaxed text-[color-mix(in_srgb,var(--hero-ink)_78%,transparent)]">
            Create your profile once and let the extension do the typing. Free to start — no card
            required.
          </p>
        </div>
        <blockquote className="border-l-[3px] border-accent pl-4 text-sm leading-relaxed text-[color-mix(in_srgb,var(--hero-ink)_82%,transparent)]">
          &quot;I went from 20 minutes per application to about 90 seconds. The tracker filling
          itself is the part I didn&apos;t know I needed.&quot;
          <span className="mt-2 block text-[color-mix(in_srgb,var(--hero-ink)_60%,transparent)]">
            — early user
          </span>
        </blockquote>
      </div>

      {/* Form */}
      <div className="flex flex-1 flex-col bg-app-bg p-6 sm:p-10">
        {/* Top bar — back to landing + Kiwiply brand (shown on every breakpoint) */}
        <div className="mx-auto flex w-full max-w-[380px] items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
              <path
                d="M10 3 5 8l5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </Link>
          <Link href="/" aria-label="Kiwiply" className="flex items-center gap-2">
            <Logo height={24} />
            <BetaBadge />
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-8">
          {mode === "login" ? <LoginForm /> : <SignupForm />}
        </div>
      </div>
    </div>
  );
}
