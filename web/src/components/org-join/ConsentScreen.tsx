"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Button, Spinner, useBottomBar } from "@kiwiply/ui";
import { JOIN_SCOPES, ROLE_PHRASE, type Consent, type JoinPreview, type ShareScope } from "@/lib/org-join";
import WhatExactlySheet from "./WhatExactlySheet";

type Choice = Exclude<ShareScope, "FULL">;

const CHOICES: Record<Choice, { title: string; body: (org: string) => string; recommended?: boolean }> = {
  SUMMARY: {
    title: "Progress summary",
    recommended: true,
    body: (org) => `${org} sees how many applications you have at each stage, whether your resume is ready, and when you were last active. Never company names or files.`,
  },
  NONE: {
    title: "Only that I joined",
    body: (org) => `${org} sees that you're a member, and nothing about your job search.`,
  },
};

/** The first letters of the organization's name, for its round mark. */
export function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export interface ConsentScreenProps {
  preview: Pick<JoinPreview, "orgName" | "inviterName" | "groupName" | "role" | "pays" | "consent">;
  /** True while the join request is in flight. */
  busy?: boolean;
  /** A readable reason the last attempt failed. */
  error?: string | null;
  /** The person tapped Join with this choice and this version of the text. */
  onJoin(scope: Choice, consentVersion: string): void;
}

/**
 * The consent step of joining (O6.2; consent-data-sharing.md section 5.1): "what can {org} see?" with exactly two
 * choices, the recommended one first and pre-selected (unless the org proposes only the seat), a "What exactly?" sheet
 * that spells out the matrix, and one primary button. FULL is never offered here: sharing everything is a separate
 * choice for one named person. The choice is written together with the seat, so nobody is ever a member without one.
 * The button sits in a sticky bar on a phone (it registers with `useBottomBar`, so toasts and the bug button stay clear).
 */
export default function ConsentScreen({ preview, busy = false, error = null, onJoin }: ConsentScreenProps) {
  const { orgName, inviterName, groupName, role, pays, consent } = preview;
  const [scope, setScope] = useState<Choice>(proposed(consent));
  const [sheet, setSheet] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  useBottomBar(barRef);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const byline = [inviterName ? `by ${inviterName}` : null, groupName].filter(Boolean).join(" · ");

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + JOIN_SCOPES.length) % JOIN_SCOPES.length;
    refs.current[next]?.focus();
    setScope(JOIN_SCOPES[next]);
  }

  return (
    <section aria-labelledby="consent-title" className="flex flex-1 flex-col">
      <div className="flex-1">
        <h1 id="consent-title" className="font-display text-[26px] leading-tight text-ink">
          Join {orgName}
        </h1>
        {byline && <p className="mt-1 text-[14px] text-muted">{byline}</p>}
        <p className="mt-3 text-[15px] text-ink">
          You'll be {ROLE_PHRASE[role]}. You keep your own account, resumes and applications.
        </p>
        {pays.length > 0 && <p className="mt-1 text-[14px] text-muted">{orgName} pays for: {pays.join(", ")}.</p>}

        <div role="radiogroup" aria-labelledby="consent-q" className="mt-6">
          <p id="consent-q" className="text-[15px] font-semibold text-ink">
            What can {orgName} see?
          </p>
          <div className="mt-3 space-y-2.5">
            {JOIN_SCOPES.map((s, i) => {
              const on = scope === s;
              const c = CHOICES[s];
              return (
                <button
                  key={s}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  disabled={busy}
                  onClick={() => setScope(s)}
                  onKeyDown={(e) => onKey(e, i)}
                  className={
                    "flex min-h-[64px] w-full items-start gap-3 rounded-[var(--radius-lg)] border-2 p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 " +
                    (on ? "border-accent bg-accent-soft/50" : "border-line bg-paper hover:bg-paper-2")
                  }
                >
                  <span
                    aria-hidden="true"
                    className={"mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 " + (on ? "border-accent-deep" : "border-line")}
                  >
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-accent-deep" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold text-ink">{c.title}</span>
                      {c.recommended && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-deep">Recommended</span>}
                    </span>
                    <span className="mt-0.5 block text-[13.5px] leading-relaxed text-muted">{c.body(orgName)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="mt-2 inline-flex min-h-[44px] items-center text-[14px] font-semibold text-accent-deep hover:underline"
          >
            What exactly?
          </button>
        </div>

        <p className="mt-2 text-[13px] text-muted">You can change this any time in Settings.</p>
        {error && (
          <p role="alert" className="mt-3 text-[14px] font-medium text-danger-text">
            {error}
          </p>
        )}
      </div>

      <div ref={barRef} className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-paper/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0">
        <Button variant="accent" size="lg" className="h-[52px] w-full" disabled={busy} onClick={() => onJoin(scope, consent.version)}>
          {busy ? <Spinner className="h-[18px] w-[18px]" label="Joining" /> : null}
          {busy ? "Joining…" : `Join ${orgName}`}
        </Button>
      </div>

      <WhatExactlySheet open={sheet} onClose={() => setSheet(false)} orgName={orgName} consent={consent} />
    </section>
  );
}

/** The choice the screen starts on: what the org proposes, but never FULL. */
function proposed(consent: Consent): Choice {
  return consent.defaultScope === "NONE" ? "NONE" : "SUMMARY";
}
