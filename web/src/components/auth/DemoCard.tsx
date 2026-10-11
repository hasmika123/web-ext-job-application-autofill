"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BuildingIcon, SparklesIcon, UserIcon } from "@kiwiply/ui";
import { cn } from "@/lib/cn";
import { track } from "@/lib/analytics";
import { notifyExtension } from "@/lib/extension-signal";
import type { DemoInfo } from "@/lib/demo";

/** The two demo logins and how each button reads. The API decides which are on offer. */
const BUTTONS = [
  { login: "demo", text: "Explore as a job seeker", icon: UserIcon },
  { login: "demo-org", text: "Explore as an organization admin", icon: BuildingIcon },
] as const;

/**
 * "Just looking? Try the demo" (APP-V2-SPEC section 9.2): one click opens a pre-filled demo
 * account, no signup. Only rendered when the API says the demo is on; the parent decides that
 * server-side, so a disabled demo (or an unreachable API) leaves the login page unchanged.
 */
export default function DemoCard({ demo }: { demo: DemoInfo }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offered = BUTTONS.filter((b) => demo.accounts.some((a) => a.login === b.login));
  if (!demo.enabled || offered.length === 0) return null;

  async function open(login: string) {
    setBusy(login);
    setError(null);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.landing !== "string") {
        setError(data.error ?? "Couldn't open the demo. Please try again.");
        return;
      }
      track("login", { method: "demo", account: login });
      notifyExtension("changed");
      router.push(data.landing);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="demo-card-title" className="mt-5 rounded-2xl border border-v2-lime bg-v2-lime-soft/60 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white text-v2-green">
          <SparklesIcon size={22} />
        </span>
        <div className="min-w-0">
          <h3 id="demo-card-title" className="text-[15px] font-bold text-v2-navy">
            Just looking? Try the demo
          </h3>
          <p className="mt-0.5 text-[13px] leading-snug text-v2-ink-soft">
            Open a ready-made account, no signup. Changes aren&apos;t saved.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {offered.map(({ login, text, icon: Icon }) => (
          <button
            key={login}
            type="button"
            onClick={() => void open(login)}
            disabled={busy !== null}
            className={cn(
              "flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-v2-line bg-white px-3.5 py-2.5 text-left",
              "text-[14.5px] font-semibold text-v2-navy transition-colors hover:bg-v2-lime-soft disabled:opacity-60",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            )}
          >
            <Icon size={18} className="flex-none text-v2-green" />
            <span className="min-w-0 flex-1">{busy === login ? "Opening the demo…" : `${text} →`}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

/** One quiet line under the signup form: "or try the demo first" -> the login page, where the card is. */
export function DemoSignupLink({ demo }: { demo: DemoInfo }) {
  if (!demo.enabled || demo.accounts.length === 0) return null;
  return (
    <p className="mt-3 text-center text-[14px] text-v2-ink-soft">
      or{" "}
      <Link href="/login" className="inline-flex min-h-[44px] items-center font-semibold text-accent-deep hover:underline">
        try the demo first
      </Link>
    </p>
  );
}
