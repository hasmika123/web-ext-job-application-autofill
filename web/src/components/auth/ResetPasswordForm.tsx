"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input, Field } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const MIN_LEN = 4;

/**
 * "Forgot password" step 2 — set a new password using the key from the emailed link.
 * The key arrives as the `?key=` query param (read on the server page and passed in).
 * On success we send the user to sign in with their new password.
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
  else if (password.length < MIN_LEN) errs.password = `Use at least ${MIN_LEN} characters`;
  if (confirm !== password) errs.confirm = "Passwords don't match";
  const show = (n: string) => submitted || touched[n];
  const touch = (n: string) => setTouched((t) => ({ ...t, [n]: true }));

  // No key in the link → can't proceed. Send them back to request a fresh one.
  if (!resetKey) {
    return (
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Invalid reset link</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          This password-reset link is missing or malformed. Request a new one and try again.
        </p>
        <Link href="/forgot-password" className={cn(buttonVariants("accent"), "mt-7")}>
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
        <h1 className="text-[28px] font-bold tracking-tight text-ink">Password updated</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Your password has been changed. You can now sign in with your new password.
        </p>
        <button onClick={() => router.push("/login")} className={cn(buttonVariants("accent"), "mt-7")}>
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Set a new password</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Choose a new password for your account.</p>
      <form onSubmit={onSubmit} noValidate>
        <Field label="New password" htmlFor="reset-password" error={show("password") ? errs.password : undefined}>
          <Input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => touch("password")}
            aria-invalid={show("password") && !!errs.password}
          />
        </Field>
        <Field label="Confirm password" htmlFor="reset-confirm" error={show("confirm") ? errs.confirm : undefined}>
          <Input
            id="reset-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => touch("confirm")}
            aria-invalid={show("confirm") && !!errs.confirm}
          />
        </Field>
        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={cn(buttonVariants("accent"), "w-full")}>
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        <Link href="/login" className="font-medium text-accent-deep hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
