"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight">Almost there</h1>
        <p className="mt-3 text-sm text-foreground/70">
          We&apos;ve created your account and sent an activation link to{" "}
          <span className="font-medium">{email}</span>. Click it to finish setting up, then
          sign in.
        </p>
        <Link
          href="/login"
          className="mt-8 self-start rounded-full border border-foreground/20 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/5"
        >
          Go to sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Create your profile</h1>
      <p className="mt-1 text-sm text-foreground/60">One profile for every application.</p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Username
          <input
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-base outline-none focus:border-foreground/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-base outline-none focus:border-foreground/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={4}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-base outline-none focus:border-foreground/50"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create profile"}
        </button>

        <p className="text-xs text-foreground/50">
          By creating an account you agree to how Dossier handles your data, described in our{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground/80">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <p className="mt-6 text-sm text-foreground/60">
        Already have an account?{" "}
        <Link href="/login" className="font-medium underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
