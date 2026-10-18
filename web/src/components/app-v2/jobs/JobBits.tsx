"use client";

import { useState } from "react";
import { BookmarkIcon, BookmarkOutlineIcon, ZapIcon, cn, useToast } from "@kiwiply/ui";
import type { SampleJob } from "@/components/app-v2/sample-data";
import { scoreTone } from "./job-utils";

/** Small blue tag chip ("Internship", "Python"). */
export function JobTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md bg-v2-blue-soft px-2 py-1 text-[11.5px] font-medium leading-none text-v2-blue-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** "95% Match" pill: green from 90, amber below. */
export function MatchBadge({ score, className }: { score: number; className?: string }) {
  const tone = scoreTone(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-bold leading-none",
        tone === "green" ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-amber-soft text-v2-amber-ink",
        className,
      )}
    >
      <ZapIcon size={12} aria-hidden />
      {score}% Match
    </span>
  );
}

/**
 * Bookmark toggle. Sample jobs keep the saved state in the browser only (the Saved Jobs page ships
 * with phase A2). A real daily match is saved to the board through the existing match endpoint.
 */
export function SaveButton({
  job,
  className,
  size = 18,
  label,
  initialSaved = false,
}: {
  job: Pick<SampleJob, "id" | "title" | "company" | "real">;
  className?: string;
  size?: number;
  /** When set, renders as a labelled button ("Save Job"). */
  label?: string;
  initialSaved?: boolean;
}) {
  const toast = useToast();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    if (saved) {
      setSaved(false);
      return;
    }
    if (job.real && job.id.startsWith("m-")) {
      setBusy(true);
      try {
        const res = await fetch(`/api/job-matches/${job.id.slice(2)}/save`, { method: "POST" });
        if (!res.ok) {
          toast({ variant: "error", title: "Couldn't save that job right now." });
          return;
        }
        toast({ variant: "success", title: `Saved ${job.title} at ${job.company} to your board.` });
      } catch {
        toast({ variant: "error", title: "Couldn't save that job right now." });
        return;
      } finally {
        setBusy(false);
      }
    }
    setSaved(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? `Unsave ${job.title}` : `Save ${job.title}`}
      className={cn(
        "transition-colors disabled:opacity-60",
        label
          ? "inline-flex items-center justify-center gap-2 rounded-xl border border-v2-line bg-paper px-5 py-3 text-[15px] font-bold text-ink hover:bg-paper-2"
          : "grid h-9 w-9 flex-none place-items-center rounded-lg text-ink-soft hover:bg-paper-2 hover:text-ink",
        saved && !label && "text-v2-green-ink",
        className,
      )}
    >
      {saved ? <BookmarkIcon size={size} /> : <BookmarkOutlineIcon size={size} />}
      {label && (saved ? "Saved" : label)}
    </button>
  );
}
