import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { apiUrl } from "@/lib/config";
import { buttonVariants } from "@/components/ui/Button";
import ActivateSignInLink from "@/components/auth/ActivateSignInLink";

export const metadata: Metadata = {
  title: "Activate your account",
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
    <main className="flex flex-1 items-center justify-center bg-app-bg px-6 py-16">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-line bg-paper p-8 text-center shadow-[var(--shadow)]">
        <Image src="/logo-icon.png" alt="Kiwiply" width={48} height={48} className="mx-auto rounded-[12px]" />
        <span
          className={
            "mt-5 inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[.06em] " +
            (state === "ok" ? "bg-accent-soft text-accent-deep" : "bg-brown-soft text-brown-deep")
          }
        >
          {state === "ok" ? "Verified" : "Action needed"}
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink">{heading}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">{body}</p>
        <div className="mt-7 flex justify-center gap-3">
          <ActivateSignInLink variant={state === "ok" ? "accent" : "primary"} label="Go to sign in" />
          {state !== "ok" && (
            <Link href="/signup" className={buttonVariants("ghost")}>
              Sign up
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
