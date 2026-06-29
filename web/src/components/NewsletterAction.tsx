"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type Kind = "confirm" | "unsubscribe";
type State = "loading" | "ok" | "fail";

const COPY: Record<Kind, Record<State, { title: string; body: string }>> = {
  confirm: {
    loading: { title: "Confirming…", body: "One moment while we confirm your subscription." },
    ok: { title: "You're subscribed 🎉", body: "Thanks for confirming — you'll get occasional product updates and tips." },
    fail: { title: "Link invalid", body: "This confirmation link is invalid or has already been used." },
  },
  unsubscribe: {
    loading: { title: "Unsubscribing…", body: "One moment while we update your preferences." },
    ok: { title: "You're unsubscribed", body: "You won't receive any more newsletter emails. Sorry to see you go!" },
    fail: { title: "Link invalid", body: "This unsubscribe link is invalid." },
  },
};

/**
 * Runs a newsletter confirm/unsubscribe on mount (the token comes from the emailed link) and
 * shows the result. One-click by design — the user lands here and the action just happens.
 */
export default function NewsletterAction({ kind, token }: { kind: Kind; token?: string }) {
  const [state, setState] = useState<State>(token ? "loading" : "fail");

  useEffect(() => {
    if (!token) return; // initial state is already "fail"
    const url = kind === "confirm" ? "/api/newsletter/confirm" : "/api/newsletter/unsubscribe";
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then((r) => setState(r.ok ? "ok" : "fail"))
      .catch(() => setState("fail"));
  }, [kind, token]);

  const copy = COPY[kind][state];

  return (
    <main className="grid min-h-dvh place-items-center bg-app-bg p-6">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-line bg-paper p-8 text-center shadow-[var(--shadow)]">
        <Image src="/logo-icon.png" alt="Kiwiply" width={48} height={48} className="mx-auto rounded-[12px]" />
        <h1 className="mt-5 text-xl font-bold tracking-tight text-ink">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{copy.body}</p>
        <Link href="/" className={cn(buttonVariants("ghost"), "mt-7")}>
          Back to Kiwiply
        </Link>
      </div>
    </main>
  );
}
