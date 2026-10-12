"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, ConfettiBurst, DownloadIcon, FileTextIcon, Meter, SearchIcon, cn } from "@kiwiply/ui";
import { EXT_STORE_URL, detectExtension } from "@/lib/extension-signal";
import { isPhoneUa } from "@/lib/onboarding/device";
import { useCompanionActive } from "./delight/Companion";
import { CompanionDock } from "./delight/CompanionDock";
import { useSceneLine } from "./delight/useCompanionLines";
import { StepMascot } from "./parts";

/** How long the payoff waits for the extension to say hello before it assumes it is not installed (DESIGN 5.11). */
export const EXTENSION_PING_MS = 300;

export const BUILD_RESUME_HREF = "/resume-builder?new=profile";

export type PayoffAction = "build_resume" | "install_extension" | "find_jobs";
const KNOWN: PayoffAction[] = ["build_resume", "install_extension", "find_jobs"];

/** What the line under "You're set" says: the honest count, or (nothing counted) the truthful promise (DESIGN 10). */
export function payoffLine(fields: number): string {
  return fields > 0 ? `Kiwiply can now autofill ~${fields} fields for you.` : "Kiwiply is ready to learn as you apply.";
}

/**
 * `done`: the payoff (Onboarding v2 R1.11, ONBOARDING-V2-DESIGN 5.11). "You're set, {firstName}." with the honest
 * "~N fields" (computed from what is really in the profile, never a marketing constant), the profile strength, one confetti
 * burst (none under reduced motion, none when the admin switched it off), and up to three next actions in the admin's order:
 * Build a resume (to `returnTo` when the person came from the new-resume chooser), Install the extension (not when it is
 * already there, and on a phone a line that it works on the laptop), Find jobs (with a count only when real matches exist).
 */
export default function PayoffStep({
  firstName,
  fields,
  score,
  actions,
  returnTo,
  jobsCount,
  mascot,
  confetti,
  onAction,
}: {
  firstName: string;
  /** `coverage.fields` from the finish response, or the local twin. */
  fields: number;
  /** The profile's completeness, 0 to 100; null when it could not be read. */
  score: number | null;
  /** `config.onboarding.payoffActions`, in order. */
  actions: string[];
  /** A same-origin path to Build a resume from the chooser (`?return=`). */
  returnTo: string | null;
  /** How many real daily matches there are; null when none (a sample list never counts). */
  jobsCount: number | null;
  mascot: boolean;
  confetti: boolean;
  onAction: (action: PayoffAction | "dashboard") => void;
}) {
  const [phone] = useState(() => isPhoneUa());
  const heading = useRef<HTMLHeadingElement>(null);
  // The payoff is outside the shell, so it moves focus to its own heading (DESIGN 14).
  useEffect(() => heading.current?.focus(), []);
  const [extension, setExtension] = useState<"unknown" | "yes" | "no">("unknown");
  useEffect(() => {
    if (phone) return;
    let live = true;
    void detectExtension(EXTENSION_PING_MS).then((found) => live && setExtension(found ? "yes" : "no"));
    return () => {
      live = false;
    };
  }, [phone]);

  const name = firstName.trim();
  // The companion (R1.14): the payoff is outside the shell, so it brings its own dock (the column from xl; phones keep the v2 clap).
  const companion = useCompanionActive();
  useSceneLine("celebrate", name ? "done.idle" : "done.idle.noname", { vars: { firstName: name } });
  const ordered = actions.filter((a, i): a is PayoffAction => (KNOWN as string[]).includes(a) && actions.indexOf(a) === i);

  const cards: ReactNode[] = [];
  ordered.forEach((action, i) => {
    const primary = i === 0;
    if (action === "build_resume") {
      cards.push(
        <ActionCard key={action} primary={primary} icon={<FileTextIcon size={22} aria-hidden />} title="Build a resume" body="From your profile, in a tap" href={returnTo ?? BUILD_RESUME_HREF} onClick={() => onAction(action)} />,
      );
    } else if (action === "install_extension") {
      if (phone) {
        cards.push(
          <li key={action} className="rounded-2xl border border-v2-line/70 bg-paper p-4 text-[14px] text-v2-ink-soft" data-testid="laptop-note">
            Autofill works on your laptop — we&apos;ll show you there
          </li>,
        );
      } else if (extension === "no") {
        cards.push(
          <ActionCard key={action} primary={primary} icon={<DownloadIcon size={22} aria-hidden />} title="Install the extension" body="Autofill on any job site" href={EXT_STORE_URL} external onClick={() => onAction(action)} />,
        );
      }
    } else if (action === "find_jobs") {
      cards.push(
        <ActionCard
          key={action}
          primary={primary}
          icon={<SearchIcon size={22} aria-hidden />}
          title="Find jobs"
          body={jobsCount !== null && jobsCount >= 1 ? `${jobsCount} picked for you today` : undefined}
          href="/jobs"
          onClick={() => onAction(action)}
        />,
      );
    }
  });

  const page = (
    <div className="relative mx-auto w-full max-w-[560px] overflow-x-clip">
      {confetti && <ConfettiBurst />}
      <div className="flex flex-col items-center text-center">
        <div className="ob-pop-in">
          <StepMascot name="clap" enabled={mascot} className={cn("h-24 w-auto", companion && "xl:hidden")} />
        </div>
        <h1 ref={heading} tabIndex={-1} className="mt-3 font-display text-[28px] font-extrabold leading-tight text-balance text-v2-navy" style={{ outline: "none" }}>
          {name ? `You're set, ${name}.` : "You're set."}
        </h1>
        <p className="mt-1.5 text-[17px] font-semibold leading-snug text-v2-ink-soft" data-testid="payoff-line">
          {payoffLine(fields)}
        </p>
      </div>

      {score !== null && (
        <div className="mt-6">
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-v2-ink-soft">Profile strength</span>
            <span className="font-display text-[20px] font-extrabold text-v2-navy">{score}%</span>
          </div>
          <Meter value={score} label="Profile strength" valueText={`${score} percent`} neutral className="h-2.5" />
        </div>
      )}

      {cards.length > 0 && (
        <>
          <p className="mt-7 text-[13px] font-semibold text-v2-navy">What&apos;s next</p>
          <ul className="mt-2 flex flex-col gap-2.5">{cards}</ul>
        </>
      )}

      <div className="mt-6 flex justify-center">
        <Link
          href="/dashboard"
          onClick={() => onAction("dashboard")}
          className="inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-semibold text-v2-muted transition-colors hover:text-v2-navy hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
  if (!companion) return page;
  // The dock hangs off the right of the 560 px column, so it sits outside the clipped box above (which keeps confetti from scrolling the page).
  return (
    <div className="relative mx-auto w-full max-w-[560px]" data-delight="on">
      <CompanionDock screenKey="done" className="top-[28px]" />
      {page}
    </div>
  );
}

function ActionCard({
  primary,
  icon,
  title,
  body,
  href,
  external,
  onClick,
}: {
  primary: boolean;
  icon: ReactNode;
  title: string;
  body?: string;
  href: string;
  external?: boolean;
  onClick: () => void;
}) {
  const cls = cn(
    "flex min-h-[64px] items-center gap-3 rounded-2xl border p-4 text-left no-underline transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    primary ? "border-accent bg-accent-soft/70 hover:bg-accent-soft" : "border-v2-line/70 bg-paper hover:border-accent hover:bg-accent-soft/40",
  );
  const inner = (
    <>
      <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl", primary ? "bg-accent text-on-accent" : "bg-accent-soft text-accent-deep")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-v2-navy">{title}</span>
        {body && <span className="mt-0.5 block text-[13px] text-v2-ink-soft">{body}</span>}
      </span>
      <ArrowRightIcon size={16} className="flex-none text-v2-muted" aria-hidden />
    </>
  );
  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>
          {inner}
        </a>
      ) : (
        <Link href={href} onClick={onClick} className={cls}>
          {inner}
        </Link>
      )}
    </li>
  );
}
