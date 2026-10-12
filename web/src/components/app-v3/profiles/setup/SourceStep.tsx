"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button, ChevronDownIcon, ClipboardIcon, LockIcon, SparklesIcon, Spinner, UploadIcon, cn } from "@kiwiply/ui";
import { getAiParseConsent } from "@/lib/ai-parse-consent";
import { formatBytesCap } from "@/lib/format-bytes";
import { isPhoneUa } from "@/lib/onboarding/device";
import { sourceHeader, sourceOrder, leadsWithFresh } from "@/lib/onboarding/persona";
import type { BioLimits } from "@/lib/profile-setup/draft";
import { NothingFoundError, parseFileForSetup, type SetupParse } from "@/lib/profile-setup/parse";
import type { Persona } from "@/lib/profile-setup/state";
import ParseConsent from "./ParseConsent";
import { SkipButton, StepFooter, StepHeading, StepMascot } from "./parts";

/** What the file picker offers (a phone opens Files / Drive / iCloud for these). */
export const RESUME_ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export const READ_ERROR = "We couldn't read that file. Try another, or paste the text instead.";
export const tooBig = (cap: string) => `That file is over ${cap}. Try a smaller one, or paste the text instead.`;

/**
 * `source`: upload is the hero (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN 5.3). One big dashed drop zone that is a real
 * `<button>` (tap or click to pick a file; on a laptop a file can also be dropped on it), the lock line that expands to
 * the never-collected promise, and two quieter chips for people with no file: Paste text and Start fresh (fresh first,
 * and warmer, for students and first-job seekers). The file is read in the browser, stripped of never-collected values,
 * then parsed (`parseFileForSetup`, unchanged); the file itself goes nowhere.
 */
export default function SourceStep({
  persona,
  maxBytes,
  bioLimits,
  onParsed,
  onPath,
  onSkip,
  mascot,
  parse = parseFileForSetup,
}: {
  persona: Persona | null;
  /** `config.profile.uploadMaxBytes`: a bigger file is refused before any parsing. */
  maxBytes: number;
  /** `config.profile` bio caps the draft is clipped to. */
  bioLimits: BioLimits;
  onParsed: (result: SetupParse) => void;
  /** The way in the person chose (analytics, and the wizard's state); `upload` fires when a file is picked. */
  onPath: (path: "upload" | "paste" | "fresh") => void;
  /** "Skip for now": straight to the identity card. */
  onSkip: () => void;
  mascot: boolean;
  /** Test seam; defaults to the real pipeline. */
  parse?: (file: File, ai: boolean, bioLimits: BioLimits) => Promise<SetupParse>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone] = useState(() => isPhoneUa());
  const cap = formatBytesCap(maxBytes);

  async function handle(file: File) {
    setError(null);
    if (file.size > maxBytes) {
      setError(tooBig(cap));
      return;
    }
    setBusy(true);
    onPath("upload");
    try {
      onParsed(await parse(file, getAiParseConsent(), bioLimits));
    } catch (e) {
      // "Nothing found" and "that PDF is a scan" carry their own, more useful words; anything else is the plain line.
      setError(e instanceof NothingFoundError && e.message ? e.message : READ_ERROR);
      setBusy(false);
    }
  }

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handle(f);
    e.target.value = ""; // allow picking the same file again
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !busy) void handle(f);
  };

  const chips = sourceOrder(persona).map((way, i) => {
    const fresh = way === "fresh";
    return (
      <Button
        key={way}
        variant={fresh && leadsWithFresh(persona) && i === 0 ? "accent-soft" : "ghost"}
        disabled={busy}
        onClick={() => onPath(way)}
        className="w-full max-sm:min-h-11"
      >
        {fresh ? <SparklesIcon size={16} aria-hidden /> : <ClipboardIcon size={16} aria-hidden />}
        {fresh ? "Start fresh" : "Paste text"}
      </Button>
    );
  });

  return (
    <div>
      <StepHeading title="Drop in your resume." sub="We'll read it and you confirm what's right — no typing." />

      {busy ? (
        <div role="status" className="mt-5 flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border border-v2-line/70 bg-paper p-6 text-center shadow-v2-soft sm:min-h-[240px]">
          <StepMascot name="books" enabled={mascot} className="h-20 w-auto" />
          <p className="flex items-center gap-2 text-[15px] font-bold text-v2-navy">
            <Spinner className="h-4 w-4" role="presentation" aria-hidden /> Reading your resume…
          </p>
        </div>
      ) : (
        <div
          onDragOver={phone ? undefined : (e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={phone ? undefined : () => setDragging(false)}
          onDrop={phone ? undefined : onDrop}
          className="mt-5"
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex min-h-[180px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-150 sm:min-h-[240px]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              dragging ? "border-solid border-accent bg-accent-soft" : "border-accent bg-v2-lime-soft/40 hover:bg-v2-lime-soft/70",
            )}
          >
            <StepMascot name="resume" enabled={mascot} className="mb-1 h-[72px] w-auto" />
            <span className="inline-flex items-center gap-2 text-[17px] font-extrabold text-v2-navy">
              <UploadIcon size={20} aria-hidden /> {dragging ? "Drop it here" : "Choose a file"}
            </span>
            <span className="text-[13px] text-v2-ink-soft">PDF, DOCX or TXT · up to {cap}</span>
          </button>
          <input ref={inputRef} type="file" accept={RESUME_ACCEPT} onChange={onInput} className="hidden" aria-label="Resume file" data-testid="resume-file" tabIndex={-1} />
        </div>
      )}

      <details className="group mt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 text-[12.5px] leading-snug text-v2-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0 [&::-webkit-details-marker]:hidden">
          <LockIcon size={15} className="mt-px flex-none text-v2-muted" aria-hidden />
          <span className="min-w-0 flex-1">We remove SSN, bank and ID numbers before reading.</span>
          <ChevronDownIcon size={16} className="mt-px flex-none text-v2-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <p className="mt-1.5 pl-[23px] text-[12.5px] leading-snug text-v2-ink-soft">
          We never collect Social Security, bank, passport or birth-date details. If your resume has any, they&apos;re removed before anything reads it — and
          nothing is saved to your profile until you confirm it.
        </p>
      </details>

      <div className="mt-3">
        <ParseConsent />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[14px] font-medium text-danger-text">
          {error}
        </p>
      )}

      <p className="mt-6 text-[13px] font-semibold text-v2-navy">{sourceHeader(persona)}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">{chips}</div>

      <StepFooter>
        <SkipButton onClick={onSkip} disabled={busy}>
          Skip for now
        </SkipButton>
      </StepFooter>
    </div>
  );
}
