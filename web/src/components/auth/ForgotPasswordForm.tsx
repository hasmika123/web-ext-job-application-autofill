"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRightIcon, MailIcon } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import { isEmail, LIMITS } from "@/lib/validate";
import AuthField from "@/components/auth/AuthField";
import { CardHeader } from "@/components/auth/AuthParts";

/**
 * "Forgot password" step 1 — request a reset link. Posts to the BFF, which always reports
 * success (the backend never reveals whether an address is registered), so we show the
 * same confirmation either way.
 */
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const emailErr = !email.trim() ? "Email is required" : !isEmail(email) ? "Enter a valid email address" : "";
  const show = submitted || touched;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (emailErr) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
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
      <div>
        <CardHeader title="Check your email" alwaysLogo />
        <p className="text-center text-[15px] leading-relaxed text-v2-ink-soft">
          If an account exists for <span className="font-semibold text-v2-navy">{email}</span>, we&apos;ve
          sent a link to reset your password. The link expires after a while — request another if it
          does.
        </p>
        <Link href="/login" className={buttonVariants("ghost", "lg", "mt-7 h-[52px] w-full")}>
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <>
      <CardHeader
        title="Reset your password"
        subtitle="Enter your account email and we'll send you a link to set a new password."
        alwaysLogo
      />
      <form onSubmit={onSubmit} noValidate>
        <AuthField
          id="forgot-email"
          label="Email address"
          icon={<MailIcon size={20} />}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={LIMITS.emailMax}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
          error={show ? emailErr : undefined}
        />
        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={buttonVariants("accent", "lg", "mt-2 h-[52px] w-full gap-3 text-[17px]")}>
          {busy ? (
            "Sending…"
          ) : (
            <>
              Send reset link <ArrowRightIcon size={20} />
            </>
          )}
        </button>
      </form>
      <p className="mt-5 text-center text-[14px] text-v2-ink-soft">
        Remembered it?{" "}
        <Link href="/login" className="inline-flex min-h-[44px] items-center font-semibold text-accent-deep hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
