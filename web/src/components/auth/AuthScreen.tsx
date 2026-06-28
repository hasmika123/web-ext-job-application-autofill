"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { track } from "@/lib/analytics";
import { Input, Field, Logo, BetaBadge } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { isEmail } from "@/lib/validate";
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
      router.push(safeNext(next) ?? "/dashboard");
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
      <Tabs mode="login" next={next} />
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
        style={{ background: "var(--hero-bg)" }}
      >
        <Link href="/" aria-label="Kiwiply" className="flex items-center gap-2.5">
          <Image src="/logo-dark-mode.png" alt="Kiwiply" width={108} height={32} priority className="h-8 w-auto" />
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
      <div className="relative flex flex-1 items-center justify-center bg-app-bg p-6 sm:p-10">
        {/* Back to landing — pinned to the top-left corner so it adds no vertical height */}
        <Link
          href="/"
          className="absolute left-4 top-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink sm:left-6 sm:top-6"
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
