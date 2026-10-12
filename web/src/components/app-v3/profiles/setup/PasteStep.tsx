"use client";

import { useState } from "react";
import { Button, Spinner, inputClass } from "@kiwiply/ui";
import { getAiParseConsent } from "@/lib/ai-parse-consent";
import type { BioLimits } from "@/lib/profile-setup/draft";
import { parseTextForSetup, type SetupParse } from "@/lib/profile-setup/parse";
import ParseConsent from "./ParseConsent";

/** The longest text the parser takes (parser-core `cleanForLlm` cuts at the server's cap). */
const MAX_CHARS = 30000;
/** Shorter than this is not a resume; the button stays off. */
const MIN_CHARS = 40;

/**
 * Paste step: the text of a resume (LinkedIn "Save to PDF" text, a Notes file, anything). Same pipeline
 * as Upload with `text` only: stripped of never-collected values first, then parsed.
 */
export default function PasteStep({
  onParsed,
  onBack,
  bioLimits,
  parse = parseTextForSetup,
}: {
  onParsed: (result: SetupParse) => void;
  onBack?: () => void;
  /** `config.profile` bio caps the draft is clipped to. */
  bioLimits: BioLimits;
  /** Test seam; defaults to the real pipeline. */
  parse?: (text: string, ai: boolean, bioLimits: BioLimits) => Promise<SetupParse>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = text.trim().length >= MIN_CHARS;

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

  return (
    <div>
      <h2 className="font-display text-[20px] font-extrabold text-v2-navy">Paste your resume text</h2>
      <p className="mt-1 text-[14px] text-v2-ink-soft">
        From LinkedIn (More, then Save to PDF, then copy the text), a notes file or any resume. We&apos;ll show you what we found.
      </p>

      <label htmlFor="setup-paste" className="mt-5 block text-[12.5px] font-semibold text-ink-soft">
        Resume text
      </label>
      <textarea
        id="setup-paste"
        value={text}
        maxLength={MAX_CHARS}
        rows={12}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Jane Doe\njane@example.com\n\nExperience\nSoftware Engineer, Acme (2021 - Present)\n- Shipped ..."}
        className={`${inputClass} mt-1.5 min-h-[14rem] resize-y font-mono text-[13px]`}
      />
      <p className="mt-1 text-right text-[12px] text-v2-muted">
        {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
      </p>

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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {onBack ? (
          <Button variant="ghost" onClick={onBack} disabled={busy} className="max-sm:min-h-11">
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button variant="accent" onClick={() => void submit()} disabled={!ready || busy} className="max-sm:min-h-11">
          Read my text
        </Button>
      </div>
    </div>
  );
}
