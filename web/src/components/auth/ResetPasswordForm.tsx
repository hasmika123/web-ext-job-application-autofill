"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRightIcon, LockIcon } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import { LIMITS } from "@/lib/validate";
import AuthField from "@/components/auth/AuthField";
import { CardHeader } from "@/components/auth/AuthParts";

const PRIMARY = "mt-7 h-[52px] w-full gap-3 text-[17px]";

/**
 * "Forgot password" step 2 — set a new password using the key from the emailed link.
 * The key arrives as the `?key=` query param (read on the server page and passed in).
 * On success we send the user to log in with their new password.
 */
export default function ResetPasswordForm({ resetKey }: { resetKey: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const errs: Record<string, string> = {};
  if (!password) errs.password = "Password is required";
  else if (password.length < LIMITS.passwordMin) errs.password = `Use at least ${LIMITS.passwordMin} characters`;
  else if (password.length > LIMITS.passwordMax) errs.password = `Use at most ${LIMITS.passwordMax} characters`;
  if (confirm !== password) errs.confirm = "Passwords don't match";
  const show = (n: string) => submitted || touched[n];
  const touch = (n: string) => setTouched((t) => ({ ...t, [n]: true }));

  // No key in the link → can't proceed. Send them back to request a fresh one.
  if (!resetKey) {
    return (
      <div>
        <CardHeader title="Invalid reset link" alwaysLogo />
        <p className="text-center text-[15px] leading-relaxed text-v2-ink-soft">
          This password-reset link is missing or malformed. Request a new one and try again.
        </p>
        <Link href="/forgot-password" className={buttonVariants("accent", "lg", PRIMARY)}>
          Request a new link
        </Link>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: resetKey, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't reset your password.");
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
        <CardHeader title="Password updated" alwaysLogo />
        <p className="text-center text-[15px] leading-relaxed text-v2-ink-soft">
          Your password has been changed. You can now log in with your new password.
        </p>
        <button type="button" onClick={() => router.push("/login")} className={buttonVariants("accent", "lg", PRIMARY)}>
          Go to log in <ArrowRightIcon size={20} />
        </button>
      </div>
    );
  }

  return (
    <>
      <CardHeader title="Set a new password" subtitle="Choose a new password for your account." alwaysLogo />
      <form onSubmit={onSubmit} noValidate>
        <AuthField
          id="reset-password"
          label="New password"
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
          id="reset-confirm"
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
          <p role="alert" className="mb-3 text-sm font-medium text-danger-text">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={buttonVariants("accent", "lg", "mt-2 h-[52px] w-full gap-3 text-[17px]")}>
          {busy ? (
            "Saving…"
          ) : (
            <>
              Update password <ArrowRightIcon size={20} />
            </>
          )}
        </button>
      </form>
      <p className="mt-5 text-center text-[14px]">
        <Link href="/login" className="inline-flex min-h-[44px] items-center font-semibold text-accent-deep hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
