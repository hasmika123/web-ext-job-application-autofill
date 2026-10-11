"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, BuildingIcon, SparklesIcon, UserIcon } from "@kiwiply/ui";
import { cn } from "@/lib/cn";
import { track } from "@/lib/analytics";
import { notifyExtension } from "@/lib/extension-signal";
import type { DemoInfo } from "@/lib/demo";

/**
 * The two demo logins: what each one is, and what you will see inside. The API decides which are
 * on offer (and supplies the label/description); the bullets are static copy.
 */
const PERSONAS = {
  demo: {
    icon: UserIcon,
    fallbackLabel: "Job seeker",
    fallbackBlurb: "A ready-made job search: a profile, resumes and an application board.",
    sees: "Dashboard, job matches, applications, saved jobs and profiles",
  },
  "demo-org": {
    icon: BuildingIcon,
    fallbackLabel: "Organization admin",
    fallbackBlurb: "The organization admin: people, boards and reports.",
    sees: "Org overview, applications, interviews, resumes and analytics",
  },
} as const;

type Persona = keyof typeof PERSONAS;

/**
 * "Just looking? Try the demo" (APP-V2-SPEC section 9.2): pick a demo account, press Open demo,
 * no signup. Only rendered when the API says the demo is on; the parent decides that server-side,
 * so a disabled demo (or an unreachable API) leaves the login page unchanged.
 */
export default function DemoCard({ demo }: { demo: DemoInfo }) {
  const router = useRouter();
  const groupId = useId();
  const offered = (Object.keys(PERSONAS) as Persona[])
    .map((login) => ({ login, account: demo.accounts.find((a) => a.login === login) }))
    .filter((o): o is { login: Persona; account: DemoInfo["accounts"][number] } => !!o.account);
  const [choice, setChoice] = useState<string>(offered[0]?.login ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!demo.enabled || offered.length === 0) return null;

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login: choice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.landing !== "string") {
        setError(data.error ?? "Couldn't open the demo. Please try again.");
        return;
      }
      track("login", { method: "demo", account: choice });
      notifyExtension("changed");
      router.push(data.landing);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
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
            Pick an account to explore. No signup, and changes aren&apos;t saved.
          </p>
        </div>
      </div>

      <div role="radiogroup" aria-labelledby="demo-card-title" className="mt-3 flex flex-col gap-2">
        {offered.map(({ login, account }) => {
          const p = PERSONAS[login];
          const Icon = p.icon;
          const selected = choice === login;
          const id = `${groupId}-${login}`;
          return (
            <label
              key={login}
              htmlFor={id}
              className={cn(
                "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border bg-white px-3.5 py-3 transition-colors",
                selected ? "border-v2-green ring-2 ring-v2-green/30" : "border-v2-line hover:bg-v2-lime-soft",
                "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
              )}
            >
              <input
                id={id}
                type="radio"
                name={`${groupId}-demo-account`}
                value={login}
                checked={selected}
                onChange={() => setChoice(login)}
                disabled={busy}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-10 w-10 flex-none place-items-center rounded-full",
                  selected ? "bg-v2-green text-white" : "bg-v2-lime-soft text-v2-green",
                )}
              >
                <Icon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-v2-navy">{account.label || p.fallbackLabel}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-v2-ink-soft">
                  {account.description || p.fallbackBlurb}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-v2-ink-soft">You&apos;ll see: {p.sees}.</span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1 grid h-5 w-5 flex-none place-items-center rounded-full border-2",
                  selected ? "border-v2-green" : "border-v2-line",
                )}
              >
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-v2-green" />}
              </span>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void open()}
        disabled={busy || !choice}
        className={cn(
          "mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-v2-green px-4 py-2.5",
          "text-[14.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        {busy ? "Opening the demo…" : "Open demo"}
        {!busy && <ArrowRightIcon size={16} />}
      </button>
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
