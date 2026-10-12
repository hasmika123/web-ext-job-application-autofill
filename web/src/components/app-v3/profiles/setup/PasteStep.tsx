"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, Button, ClipboardIcon, Spinner, inputClass } from "@kiwiply/ui";
import { getAiParseConsent } from "@/lib/ai-parse-consent";
import type { BioLimits } from "@/lib/profile-setup/draft";
import { parseTextForSetup, type SetupParse } from "@/lib/profile-setup/parse";
import { useReaction, useSceneLine } from "./delight/useCompanionLines";
import ParseConsent from "./ParseConsent";
import { PrivacyLine, SkipButton, StepFooter, StepHeading } from "./parts";

/** The longest text the parser takes (parser-core `cleanForLlm` cuts at the server's cap). */
const MAX_CHARS = 30000;
/** Shorter than this is not a resume; the button stays off (DESIGN 5.4). */
export const MIN_CHARS = 80;

export const TOO_SHORT = "Give us a bit more — a few lines about a role or a school is enough.";

/**
 * Paste step (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN 5.4): the text of a resume from Google Docs, ChatGPT, Notes or
 * LinkedIn. Same pipeline as Upload with `text` only: stripped of never-collected values first, then parsed. The text is
 * never stored. On a phone with a clipboard API there is a one-tap "Paste" button.
 */
export default function PasteStep({
  onParsed,
  onBack,
  bioLimits,
  parse = parseTextForSetup,
}: {
  onParsed: (result: SetupParse) => void;
  /** "Upload a file instead": back to the source screen. */
  onBack?: () => void;
  /** `config.profile` bio caps the draft is clipped to. */
  bioLimits: BioLimits;
  /** Test seam; defaults to the real pipeline. */
  parse?: (text: string, ai: boolean, bioLimits: BioLimits) => Promise<SetupParse>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const length = text.trim().length;
  const ready = length >= MIN_CHARS;

  // The companion (R1.14): reads along, cheers once when there is enough to work with, thinks while it reads.
  const react = useReaction();
  useSceneLine(busy ? "think" : "read", busy ? "source.reading" : ready ? "paste.ready" : "paste.idle");
  const wasReady = useRef(false);
  useEffect(() => {
    if (ready && !wasReady.current) react("cheer");
    wasReady.current = ready;
  }, [ready, react]);

  // `navigator.clipboard.readText` exists on phones and modern desktops; it is only known on the client.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a browser capability can only be read after mount
    setCanPaste(typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function");
  }, []);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      onParsed(await parse(text, getAiParseConsent(), bioLimits));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "We couldn't read that text. Check it and try again.");
      setBusy(false);
    }
  }

  async function paste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setText((t) => (t ? `${t}\n${clip}` : clip).slice(0, MAX_CHARS));
    } catch {
      // permission refused: the person can still paste by hand
    }
    area.current?.focus();
  }

  return (
    <div>
      <StepHeading title="Paste it in." sub="From Google Docs, ChatGPT, Notes or LinkedIn — anything with your roles and schools." />

      <label htmlFor="setup-paste" className="sr-only">
        Resume text
      </label>
      <textarea
        id="setup-paste"
        ref={area}
        value={text}
        maxLength={MAX_CHARS}
        rows={10}
        autoFocus
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste here…"
        className={`${inputClass} mt-5 min-h-[14rem] resize-y text-[14px]`}
      />
      <div className="mt-2 flex min-h-6 items-center justify-between gap-3">
        <p className="text-[12.5px] text-v2-muted" aria-live="polite">
          {length > 0 && !ready ? TOO_SHORT : ""}
        </p>
        {canPaste && (
          <Button variant="ghost" size="sm" onClick={() => void paste()} disabled={busy} className="flex-none max-sm:min-h-11">
            <ClipboardIcon size={14} aria-hidden /> Paste
          </Button>
        )}
      </div>

      <PrivacyLine className="mt-3" />
      <div className="mt-3">
        <ParseConsent />
      </div>

      {busy && (
        <p role="status" className="mt-4 flex items-center gap-2 text-[14px] text-v2-ink-soft">
          <Spinner className="h-4 w-4" role="presentation" aria-hidden /> Reading your text…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-[14px] font-medium text-danger">
          {error}
        </p>
      )}

      <StepFooter>
        <Button variant="accent" size="lg" onClick={() => void submit()} disabled={!ready || busy} className="w-full max-sm:min-h-11">
          Read it <ArrowRightIcon size={16} aria-hidden />
        </Button>
        {onBack && (
          <SkipButton onClick={onBack} disabled={busy}>
            Upload a file instead
          </SkipButton>
        )}
      </StepFooter>
    </div>
  );
}
