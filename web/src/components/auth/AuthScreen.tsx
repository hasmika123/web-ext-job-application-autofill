"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRightIcon,
  CurvedArrow,
  LockIcon,
  MailIcon,
  ShieldCheckIcon,
  SparkBurst,
  StarDoodle,
  CrownDoodle,
  Underline,
  UserIcon,
  cn,
  ArrowLeftIcon,
} from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { buttonVariants } from "@/components/ui/Button";
import { isEmail, isUsername, LIMITS } from "@/lib/validate";
import { notifyExtension } from "@/lib/extension-signal";
import BrandLogo from "@/components/marketing/BrandLogo";
import AuthField from "@/components/auth/AuthField";
import SocialRow from "@/components/auth/SocialRow";
import { DemoSignupLink } from "@/components/auth/DemoCard";
import DemoSideTab from "@/components/demo/DemoSideTab";
import type { DemoInfo } from "@/lib/demo";
import {
  AuthBackdrop,
  AuthCard,
  AuthDivider,
  CardHeader,
  FeatureCard,
  FeatureList,
  Hand,
  OrgCard,
  StickyNote,
  type Feature,
} from "@/components/auth/AuthParts";

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

const PRIMARY = "mt-2 h-[52px] w-full gap-3 text-[17px]";
const TEXT_LINK = "font-semibold text-accent-deep hover:underline";

/* ───────────────────────── Login form ───────────────────────── */

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
  if (!username.trim()) errs.username = "Email address is required";
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
      // The first field is labelled "Email address" but still posts as `username`: the API
      // accepts either a username or an email there.
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
      notifyExtension("changed"); // a connected extension re-pulls the (possibly new) account's mirror
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
      notifyExtension("changed");
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
        <CardHeader
          title="Check your email"
          subtitle="We emailed a 6-digit code to verify it's you. Enter it to finish signing in."
        />
        <form onSubmit={verifyMfa} noValidate>
          <AuthField
            id="login-mfa-code"
            label="Verification code"
            icon={<ShieldCheckIcon size={20} />}
            name="one-time-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
          {error && (
            <p role="alert" className="mb-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={buttonVariants("accent", "lg", PRIMARY)}>
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
          className="mt-4 inline-flex min-h-[44px] items-center text-[13.5px] font-semibold text-v2-ink-soft hover:text-v2-navy"
        >
          <ArrowLeftIcon size={15} className="mr-1.5" /> Back to log in
        </button>
      </>
    );
  }

  return (
    <>
      <CardHeader title="Welcome back" subtitle="Log in to continue your job search journey." />
      <form onSubmit={onSubmit} noValidate>
        <AuthField
          id="login-username"
          label="Email address"
          icon={<MailIcon size={20} />}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          maxLength={LIMITS.emailMax}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onBlur={() => touch("username")}
          error={show("username") ? errs.username : undefined}
        />
        <AuthField
          id="login-password"
          label="Password"
          icon={<LockIcon size={20} />}
          password
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          maxLength={LIMITS.passwordMax}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => touch("password")}
          error={show("password") ? errs.password : undefined}
          aside={
            <Link href="/forgot-password" className={cn(TEXT_LINK, "inline-flex min-h-[44px] items-center text-[13.5px]")}>
              Forgot password?
            </Link>
          }
        />
        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={buttonVariants("accent", "lg", PRIMARY)}>
          {busy ? (
            "Logging in…"
          ) : (
            <>
              Log in <ArrowRightIcon size={20} />
            </>
          )}
        </button>
      </form>
      <AuthDivider>or continue with</AuthDivider>
      <SocialRow next={next} />
      <p className="mt-5 text-center text-[14px] text-v2-ink-soft">
        Don&apos;t have an account?{" "}
        <Link href={withNext("/signup", next)} className={cn(TEXT_LINK, "inline-flex min-h-[44px] items-center gap-1.5")}>
          Sign up free <ArrowRightIcon size={16} />
        </Link>
      </p>
      <OrgCard
        title="Hiring for a team or organization?"
        body="Manage multiple employees, schedule applications and track results — all in one place."
      />
    </>
  );
}

/* ───────────────────────── Signup form ───────────────────────── */

/** `username` is derived from the email's local part (the signup API still wants one). */
function usernameFromEmail(email: string): string {
  const local = email.trim().split("@")[0].replace(/[^A-Za-z0-9._+-]/g, "");
  return (local || "user").slice(0, LIMITS.username);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, "x");
}

function SignupForm({ next, demo }: { next?: string; demo?: DemoInfo | null }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [newsletter, setNewsletter] = useState(false); // separate, unticked marketing opt-in

  const errs: Record<string, string> = {};
  if (!fullName.trim()) errs.fullName = "Enter your full name";
  else if (fullName.trim().length > LIMITS.name * 2) errs.fullName = "That name is too long";
  if (!email.trim()) errs.email = "Email is required";
  else if (!isEmail(email)) errs.email = "Enter a valid email address";
  if (!password) errs.password = "Password is required";
  else if (password.length < LIMITS.passwordMin) errs.password = `Use at least ${LIMITS.passwordMin} characters`;
  else if (password.length > LIMITS.passwordMax) errs.password = `Use at most ${LIMITS.passwordMax} characters`;
  if (!confirm) errs.confirm = "Confirm your password";
  else if (confirm !== password) errs.confirm = "Passwords don't match";
  const show = (n: string) => submitted || touched[n];
  const touch = (n: string) => setTouched((t) => ({ ...t, [n]: true }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const [firstName, ...rest] = fullName.trim().split(/\s+/);
      const lastName = rest.join(" ");
      // firstName/lastName go to Spring's register DTO (persisted on the user, so the app greets
      // the person by name from their first sign-in).
      const post = (username: string) =>
        fetch("/api/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, email, password, firstName, lastName }),
        });

      const base = usernameFromEmail(email);
      let res = await post(base);
      let data = await res.json().catch(() => ({}));
      // The derived username can collide with someone else's: retry once with a short suffix.
      if (!res.ok && res.status === 400 && /username.*taken/i.test(String(data.error ?? ""))) {
        const retryName = `${base.slice(0, LIMITS.username - 4)}${randomSuffix()}`;
        if (isUsername(retryName)) {
          res = await post(retryName);
          data = await res.json().catch(() => ({}));
        }
      }
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
        <CardHeader title="Almost there" />
        <p className="text-center text-[15px] leading-relaxed text-v2-ink-soft">
          We&apos;ve created your account and sent an activation link to{" "}
          <span className="font-semibold text-v2-navy">{email}</span>. Click it to finish setting up,
          then log in.
        </p>
        <Link href={withNext("/login", next)} className={buttonVariants("accent", "lg", "mt-7 h-[52px] w-full gap-3 text-[17px]")}>
          Go to log in <ArrowRightIcon size={20} />
        </Link>
      </div>
    );
  }

  return (
    <>
      <CardHeader
        title="Create your account"
        subtitle="It's free and takes less than a minute."
        adornment={<SparkBurst className="absolute -right-10 -top-1 hidden h-8 w-8 rotate-[100deg] text-v2-green lg:block" />}
      />
      <form onSubmit={onSubmit} noValidate>
        <AuthField
          id="signup-name"
          label="Full name"
          icon={<UserIcon size={20} />}
          name="name"
          autoComplete="name"
          placeholder="Your full name"
          maxLength={LIMITS.name * 2}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          onBlur={() => touch("fullName")}
          error={show("fullName") ? errs.fullName : undefined}
        />
        <AuthField
          id="signup-email"
          label="Email address"
          icon={<MailIcon size={20} />}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={LIMITS.emailMax}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => touch("email")}
          error={show("email") ? errs.email : undefined}
        />
        <AuthField
          id="signup-password"
          label="Password"
          icon={<LockIcon size={20} />}
          password
          name="password"
          autoComplete="new-password"
          placeholder="Create a password"
          maxLength={LIMITS.passwordMax}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => touch("password")}
          error={show("password") ? errs.password : undefined}
        />
        <AuthField
          id="signup-confirm"
          label="Confirm password"
          icon={<LockIcon size={20} />}
          password
          name="confirm"
          autoComplete="new-password"
          placeholder="Confirm your password"
          maxLength={LIMITS.passwordMax}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => touch("confirm")}
          error={show("confirm") ? errs.confirm : undefined}
        />
        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={buttonVariants("accent", "lg", PRIMARY)}>
          {busy ? (
            "Creating…"
          ) : (
            <>
              Create account <ArrowRightIcon size={20} />
            </>
          )}
        </button>
      </form>
      <AuthDivider>or sign up with</AuthDivider>
      <SocialRow next={next} />
      {demo && <DemoSignupLink demo={demo} />}
      <p className="mt-5 text-center text-[13px] leading-relaxed text-v2-ink-soft">
        By creating an account, you agree to our{" "}
        <Link href="/terms" className={TEXT_LINK}>
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className={TEXT_LINK}>
          Privacy Policy
        </Link>
        .
      </p>
      <label className="mx-auto mt-1 flex min-h-[44px] max-w-[400px] cursor-pointer items-start gap-2.5 py-2 text-[12.5px] leading-relaxed text-v2-ink-soft">
        <input
          type="checkbox"
          checked={newsletter}
          onChange={(e) => setNewsletter(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-none accent-[var(--color-accent-deep)]"
        />
        <span>Send me occasional product updates and tips (optional). You can unsubscribe anytime.</span>
      </label>
      <p className="mt-2 text-center text-[14px] text-v2-ink-soft lg:hidden">
        Already have an account?{" "}
        <Link href={withNext("/login", next)} className={cn(TEXT_LINK, "inline-flex min-h-[44px] items-center")}>
          Log in
        </Link>
      </p>
      <OrgCard
        title="Creating an account for your team?"
        body="Manage multiple employees, schedule applications and track results with Kiwiply for Organizations."
      />
    </>
  );
}

/* ───────────────────────── Left brand panels ───────────────────────── */

const LOGIN_FEATURES: Feature[] = [
  { icon: "search", tone: "blue", title: "Find jobs on 1,000+ sites" },
  { icon: "zap", tone: "amber", title: "AI autofill applications" },
  { icon: "file", tone: "pink", title: "Smart resume selection" },
  { icon: "chart", tone: "teal", title: "Track applications & interviews" },
];

const SIGNUP_FEATURES: Feature[] = [
  { icon: "search", tone: "blue", title: "Find the right jobs", sub: "Discover opportunities that match your skills and goals." },
  { icon: "zap", tone: "amber", title: "AI autofill applications", sub: "Save hours on paperwork." },
  { icon: "file", tone: "pink", title: "Smart resume selection", sub: "Use the best resume for each job automatically." },
  { icon: "chart", tone: "teal", title: "Track everything", sub: "Keep all your applications, responses and interviews in one place." },
];

const SIGNUP_FEATURES_MOBILE: Feature[] = [
  { icon: "search", tone: "blue", title: "Find the right jobs", sub: "Match your skills and goals" },
  { icon: "zap", tone: "amber", title: "AI autofill applications", sub: "Save hours of time" },
  { icon: "chart", tone: "pink", title: "Track everything", sub: "From application to offer" },
];

const PANEL = "relative hidden min-h-screen flex-col overflow-hidden px-[clamp(28px,3.6vw,64px)] pt-9 lg:flex";
const HEADLINE = "text-[clamp(40px,4vw,68px)] text-v2-navy";

function LoginPanel() {
  return (
    <>
      {/* Desktop */}
      <section className={PANEL}>
        <Link href="/" aria-label="Kiwiply home" className="w-fit">
          <BrandLogo height={56} priority />
        </Link>
        <div className="relative mt-5">
          <SparkBurst aria-hidden className="absolute -left-9 top-[62%] hidden h-9 w-9 -rotate-90 text-v2-green xl:block" />
          <h2 className={HEADLINE}>
            More
            <br />
            opportunities
            <br />
            for a <span className="text-v2-green">brighter you.</span>
          </h2>
        </div>
        <p className="mt-5 max-w-[calc(100%-250px)] text-[clamp(15px,1.25vw,19px)] leading-snug text-v2-ink-soft xl:max-w-[440px]">
          Find the right jobs, <span className="font-semibold text-v2-navy">apply faster with AI,</span> track
          everything and land your next opportunity — all in one place.
        </p>
        <FeatureCard
          items={LOGIN_FEATURES}
          className="absolute right-6 top-[104px] w-[210px] -rotate-[7deg] xl:left-[64%] xl:right-auto xl:top-[118px] xl:w-[250px]"
        />
        <div className="relative -ml-[4%] mt-auto w-[min(106%,84vh)] pt-10">
          <Image
            src="/v2/app/auth-trio.png"
            alt=""
            width={900}
            height={582}
            sizes="(min-width: 1024px) 55vw, 0px"
            className="h-auto w-full"
          />
          <div aria-hidden className="absolute left-[6%] top-[0%] -rotate-[12deg]">
            <Hand className="text-[clamp(22px,2.1vw,32px)]">
              Big
              <br />
              dreams.
              <br />
              You got this.
            </Hand>
          </div>
          <CurvedArrow aria-hidden direction="down-left" className="absolute left-[3%] top-[20%] h-12 w-12 text-v2-navy" />
          <StarDoodle className="absolute left-[53%] top-[0%] h-11 w-11 text-v2-green" />
          <StarDoodle className="absolute left-[59%] top-[7%] h-8 w-8 text-v2-green" />
          <div aria-hidden className="absolute right-[-1%] top-[8%] -rotate-[9deg]">
            <Hand className="text-[clamp(20px,1.9vw,30px)]">
              Same me.
              <br />
              More opportunities.
            </Hand>
            <Underline className="mt-1 h-3 w-36 text-v2-green" />
          </div>
        </div>
      </section>

      {/* Mobile / tablet */}
      <section className="relative flex flex-col items-center px-5 pt-8 lg:hidden">
        <Link href="/" aria-label="Kiwiply home">
          <BrandLogo height={56} priority />
        </Link>
        <div aria-hidden className="mt-3 text-center">
          <Hand className="text-[30px] leading-[1.05]">
            More opportunities
            <br />
            for a brighter you.
          </Hand>
          <Underline className="mx-auto mt-1 h-3 w-44 text-v2-green" />
        </div>
        <div className="relative mt-4 w-full max-w-[440px]">
          <Image
            src="/v2/app/auth-trio.png"
            alt=""
            width={900}
            height={582}
            sizes="(max-width: 1023px) 440px, 0px"
            className="h-auto w-full"
          />
          <StickyNote className="absolute -left-1 top-[58%] z-10 -rotate-[10deg]" />
          <CrownDoodle aria-hidden className="absolute left-[38%] top-[2%] h-9 w-12 text-[#F5C400]" />
          <StarDoodle className="absolute right-[2%] top-[4%] h-9 w-9 text-v2-green" />
          <CurvedArrow aria-hidden direction="down-left" className="absolute left-[3%] top-[40%] h-10 w-10 text-v2-navy" />
        </div>
      </section>
    </>
  );
}

function SignupPanel() {
  return (
    <>
      {/* Desktop */}
      <section className={cn(PANEL, "lg:sticky lg:top-0 lg:h-screen lg:min-h-[640px] lg:self-start lg:overflow-visible")}>
        <Link href="/" aria-label="Kiwiply home" className="w-fit">
          <BrandLogo height={52} priority />
        </Link>
        <h2 className={cn(HEADLINE, "mt-6")}>
          Join millions
          <br />
          finding more
          <br />
          <span className="text-v2-green">opportunities.</span>
        </h2>
        <div className="relative mt-5 max-w-[460px]">
          <p className="text-[clamp(15px,1.25vw,19px)] leading-snug text-v2-ink-soft">
            Create your free Kiwiply account and start your journey to better opportunities with AI.
          </p>
          <CrownDoodle aria-hidden className="absolute bottom-0 left-full ml-3 h-9 w-12 text-[#F5C400]" />
        </div>
        <FeatureList items={SIGNUP_FEATURES} className="relative z-10 mt-8 max-w-[46%]" />
        <StickyNote className="absolute left-[60%] top-[16%] z-10 -rotate-[10deg]" />
        <StarDoodle className="absolute left-[60%] top-[8%] h-10 w-10 text-v2-green" />
        <div className="absolute bottom-0 right-[-8%] w-[min(72%,66vh)]">
          <Image
            src="/v2/app/auth-trio-signup.png"
            alt=""
            width={701}
            height={440}
            sizes="(min-width: 1024px) 45vw, 0px"
            className="h-auto w-full [mask-image:linear-gradient(to_right,transparent,black_7%,black_90%,transparent)]"
          />
          <div aria-hidden className="absolute left-[44%] top-[-26%] -rotate-[9deg]">
            <Hand className="text-[clamp(20px,1.9vw,30px)]">
              Same me.
              <br />
              More opportunities.
            </Hand>
            <Underline className="mt-1 h-3 w-40 text-v2-green" />
          </div>
          <StarDoodle className="absolute left-[88%] top-[-34%] h-8 w-8 text-v2-green" />
          <StarDoodle className="absolute left-[20%] top-[-8%] h-6 w-6 text-v2-lime-deep" />
        </div>
      </section>

      {/* Mobile / tablet */}
      <section className="relative flex flex-col items-center px-5 pt-8 text-center lg:hidden">
        <Link href="/" aria-label="Kiwiply home">
          <BrandLogo height={52} priority />
        </Link>
        <h2 className="relative mt-5 text-[34px] leading-[1.04] text-v2-navy sm:text-[44px]">
          Your next opportunity
          <br />
          <span className="text-v2-green">starts here.</span>
          <SparkBurst aria-hidden className="ml-2 inline-block h-6 w-6 -rotate-[80deg] align-middle text-v2-lime-deep" />
        </h2>
        <p className="mt-3 max-w-[380px] text-[16px] leading-snug text-v2-ink-soft">
          Create your free account and get started with AI-powered job search.
        </p>
        <FeatureList items={SIGNUP_FEATURES_MOBILE} compact className="mt-5 hidden w-full max-w-[420px] text-left sm:block" />
        <div className="relative mt-3 w-full max-w-[460px]">
          <div aria-hidden className="relative z-10 -mb-2 ml-[4%] w-fit -rotate-[6deg] text-left">
            <Hand className="text-[20px] sm:text-[24px]">
              Same me.
              <br />
              More opportunities.
            </Hand>
          </div>
          <Image
            src="/v2/app/auth-trio-signup.png"
            alt=""
            width={701}
            height={440}
            sizes="(max-width: 1023px) 460px, 0px"
            className="h-auto w-full [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)]"
          />
        </div>
      </section>
    </>
  );
}

/** Split-screen auth shared by /login + /signup: brand panel left, white form card right. */
export default function AuthScreen({ mode, next, demo }: { mode: Mode; next?: string; demo?: DemoInfo | null }) {
  return (
    <div
      className={cn(
        "relative flex flex-1 flex-col lg:grid",
        mode === "login"
          ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
          : "lg:grid-cols-[minmax(0,1.22fr)_minmax(0,1fr)]",
      )}
    >
      <AuthBackdrop />
      {mode === "login" ? <LoginPanel /> : <SignupPanel />}

      <section
        className={cn(
          "relative flex flex-col items-center px-3 pb-8 sm:px-6 lg:min-h-screen lg:justify-center lg:px-8 lg:pb-10",
          mode === "signup" ? "lg:pt-24" : "lg:pt-10",
        )}
      >
        {mode === "signup" && (
          <div className="absolute right-8 top-6 z-10 hidden items-center gap-4 text-[14px] text-v2-ink-soft lg:flex">
            Already have an account?
            <Link
              href={withNext("/login", next)}
              className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-v2-lime bg-paper/70 px-5 text-[15px] font-semibold text-v2-navy transition-colors hover:bg-v2-lime-soft"
            >
              Log in <ArrowRightIcon size={16} />
            </Link>
          </div>
        )}
        {/* Login: the card overlaps the bottom of the photo (board). Signup: the mascot stands on its
            books above the card, so nothing may cover it. */}
        <div className={cn("w-full max-w-[560px] lg:mt-0", mode === "login" ? "-mt-6 sm:-mt-8" : "mt-1")}>
          {mode === "login" && demo && <DemoSideTab demo={demo} />}
          <AuthCard>{mode === "login" ? <LoginForm next={next} /> : <SignupForm next={next} demo={demo} />}</AuthCard>
        </div>
      </section>
    </div>
  );
}
