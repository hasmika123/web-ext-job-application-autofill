"use client";

import type { ReactNode } from "react";
import { ChevronRightIcon, ClipboardIcon, SparklesIcon, UploadIcon, cn } from "@kiwiply/ui";
import type { SetupPath } from "@/lib/profile-setup/state";

/**
 * The first screen of the profile setup (DESIGN v1 2.3): three ways in, all ending on the same
 * card-by-card review. "Start fresh" (guided questions, no file, R1.5) is on in the wizard; a surface
 * that cannot offer it yet leaves `freshEnabled` off and it shows as coming soon.
 */
export default function PathPicker({
  onPick,
  freshEnabled = false,
  onFresh,
}: {
  onPick: (path: SetupPath) => void;
  freshEnabled?: boolean;
  onFresh?: () => void;
}) {
  return (
    <div>
      <h2 className="font-display text-[22px] font-extrabold text-v2-navy">Let&apos;s set you up.</h2>
      <p className="mt-1 text-[14px] text-v2-ink-soft">Pick the fastest way. You&apos;ll confirm everything before it&apos;s saved.</p>
      <ul className="mt-5 flex flex-col gap-3">
        <Option icon={<UploadIcon size={22} aria-hidden />} title="Upload a resume" body="PDF, DOCX or TXT · about a minute" onClick={() => onPick("upload")} />
        <Option icon={<ClipboardIcon size={22} aria-hidden />} title="Paste text" body="From LinkedIn, Notes or anywhere else" onClick={() => onPick("paste")} />
        <Option
          icon={<SparklesIcon size={22} aria-hidden />}
          title="Start fresh"
          body={freshEnabled ? "We'll ask you a few things, one at a time" : "Answer a few questions, no file needed"}
          badge={freshEnabled ? undefined : "Coming soon"}
          disabled={!freshEnabled}
          onClick={onFresh}
        />
      </ul>
      <p className="mt-5 text-[12.5px] text-v2-muted">
        Nothing is saved to your profile until you finish. We never collect Social Security, bank, passport or birth-date details;
        if your resume has any, we remove them before reading it.
      </p>
    </div>
  );
}

function Option({
  icon,
  title,
  body,
  badge,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  badge?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "flex min-h-[72px] w-full items-center gap-4 rounded-2xl border border-v2-line/70 bg-paper px-4 py-3.5 text-left transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-accent hover:bg-accent-soft/40",
        )}
      >
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-accent-soft text-accent-deep">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-v2-navy">{title}</span>
            {badge && <span className="rounded-full bg-paper-2 px-2 py-[2px] text-[11px] font-semibold text-v2-muted">{badge}</span>}
          </span>
          <span className="mt-0.5 block text-[13px] text-v2-muted">{body}</span>
        </span>
        {!disabled && <ChevronRightIcon size={18} className="flex-none text-v2-muted" aria-hidden />}
      </button>
    </li>
  );
}
