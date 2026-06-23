import Link from "next/link";
import type { Metadata } from "next";
import { apiUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Activate your account — Dossier",
};

/**
 * Email-verification landing page. JHipster's activation email links here
 * (`jhipster.mail.base-url` points at the web app): /account/activate?key=…. We call the
 * public Spring endpoint `GET /api/activate?key=…`, which flips the account to activated,
 * then show the result. The key is single-use, so a refresh will report "already used".
 */
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  let state: "ok" | "invalid" | "nokey" = "nokey";
  if (key) {
    try {
      const res = await fetch(apiUrl(`/api/activate?key=${encodeURIComponent(key)}`), {
        cache: "no-store",
      });
      state = res.ok ? "ok" : "invalid";
    } catch {
      state = "invalid";
    }
  }

  const heading =
    state === "ok" ? "Email verified" : state === "nokey" ? "Invalid link" : "Couldn't verify";
  const body =
    state === "ok"
      ? "Your email is confirmed and your account is active. You can sign in now."
      : state === "nokey"
        ? "This activation link is missing its key. Use the link from your verification email."
        : "This activation link is invalid or has already been used. Try signing in — if that fails, sign up again.";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
      <p className="mt-3 text-sm text-foreground/70">{body}</p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Go to sign in
        </Link>
        {state !== "ok" && (
          <Link
            href="/signup"
            className="rounded-full border border-foreground/20 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Sign up
          </Link>
        )}
      </div>
    </main>
  );
}
