"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Input, Field } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { isEmail } from "@/lib/validate";

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
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Check your email</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          If an account exists for <span className="font-semibold text-ink">{email}</span>, we&apos;ve
          sent a link to reset your password. The link expires after a while — request another if it
          does.
        </p>
        <Link href="/login" className={cn(buttonVariants("ghost"), "mt-7")}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Enter your account email and we&apos;ll send you a link to set a new password.
      </p>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Email" htmlFor="forgot-email" error={show ? emailErr : undefined}>
          <Input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={show && !!emailErr}
          />
        </Field>
        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={cn(buttonVariants("accent"), "w-full")}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-accent-deep hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
