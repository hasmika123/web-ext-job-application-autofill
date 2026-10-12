"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button, Spinner, UploadIcon, cn } from "@kiwiply/ui";
import { getAiParseConsent } from "@/lib/ai-parse-consent";
import { parseFileForSetup, type SetupParse } from "@/lib/profile-setup/parse";
import ParseConsent from "./ParseConsent";

/** A resume file bigger than this is refused before any parsing (the resumes page uploads at most the same). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Upload step: drop or pick a PDF / DOCX / TXT. The text is read in the browser, stripped of
 * never-collected values, then parsed (AI by default, the local parser otherwise or on any failure).
 * Reusable: the new-resume chooser's "Upload a resume" path mounts this with its own `onParsed`.
 */
export default function UploadStep({
  onParsed,
  onBack,
  parse = parseFileForSetup,
}: {
  onParsed: (result: SetupParse) => void;
  onBack?: () => void;
  /** Test seam; defaults to the real pipeline. */
  parse?: (file: File, ai: boolean) => Promise<SetupParse>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is too large. Keep it under 10 MB, or paste the text instead.");
      return;
    }
    setBusy(true);
    try {
      onParsed(await parse(file, getAiParseConsent()));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "We couldn't read that file. Try another, or paste the text instead.");
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

  return (
    <div>
      <h2 className="font-display text-[20px] font-extrabold text-v2-navy">Upload your resume</h2>
      <p className="mt-1 text-[14px] text-v2-ink-soft">We&apos;ll read it and show you what we found, one card at a time. You decide what to keep.</p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "mt-5 rounded-2xl border-2 border-dashed p-6 text-center transition-colors sm:p-8",
          dragging ? "border-accent bg-accent-soft" : "border-v2-line bg-paper-2/40",
        )}
      >
        <UploadIcon size={30} className="mx-auto text-accent-deep" aria-hidden />
        <p className="mt-2 text-[15px] font-bold text-v2-navy">Drop a resume here</p>
        <p className="mt-0.5 text-[13px] text-v2-muted">PDF, DOCX or TXT</p>
        <Button variant="accent" className="mt-4 max-sm:min-h-11" disabled={busy} onClick={() => inputRef.current?.click()}>
          Choose a file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,text/plain"
          onChange={onInput}
          className="hidden"
          aria-label="Resume file"
          data-testid="resume-file"
        />
      </div>

      <div className="mt-4">
        <ParseConsent />
      </div>

      {busy && (
        <p role="status" className="mt-4 flex items-center gap-2 text-[14px] text-v2-ink-soft">
          <Spinner className="h-4 w-4" role="presentation" aria-hidden /> Reading your resume…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-[14px] font-medium text-danger">
          {error}
        </p>
      )}

      {onBack && (
        <div className="mt-6">
          <Button variant="ghost" onClick={onBack} disabled={busy} className="max-sm:min-h-11">
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
