/**
 * Upload / Paste -> a `ParsedDraft` for the setup wizard (Resume Builder R1.4). The same pipeline as
 * the resumes page (`parseResumeWithAi` with the heuristic `parser-core` fallback, `parseResume` when
 * the user opted out of AI parsing), with one addition that matters: the extracted text goes through
 * the never-collected-values filter BEFORE it is structured or sent anywhere, and the original file is
 * never sent to the AI parser (a file cannot be redacted; its text can). Reusable by the new-resume
 * chooser's "Upload a resume" path (R2.6).
 */
import { heuristicStructure } from "@/lib/parser-core";
import { parseResume, parseResumeWithAi, parseText, parseTextWithAi, type ParsedResume } from "@/lib/resume-parse";
import { toDraft, type BioLimits, type Identity, type ParsedDraft } from "./draft";
import type { ParseSource } from "./state";
import { redactForParsing } from "./sensitive";

export interface SetupParse {
  draft: ParsedDraft;
  source: ParseSource;
  /** Values the person typed themselves ("Start fresh": headline, links); written as theirs, not as parsed. */
  typed?: Identity;
  /** Sensitive values removed from the text before parsing plus any removed from the parsed output. */
  removed: number;
}

/** Thrown when there is nothing to build a profile from; the message is shown to the user as is. */
export class NothingFoundError extends Error {}

const NOTHING_FOUND = "We couldn't find work history, education or skills in that. Try pasting the text of your resume instead.";
const GARBLED = "We couldn't read the text in that PDF - it may be a scan. Paste the text of your resume instead, or upload a DOCX or TXT version.";

function finish(parsed: ParsedResume, redacted: number, bioLimits: BioLimits): SetupParse {
  // Skill-looking terms the heuristic parser finds that an AI parse left out: offered as one-tap adds.
  const extras = parsed.source === "ai" && parsed.rawText ? heuristicStructure(parsed.rawText).skills : [];
  const draft = toDraft(parsed.structured, parsed.bio, extras, bioLimits);
  const found = draft.candidates.length > 0 || draft.skills.length > 0 || draft.languages.length > 0;
  if (!found) throw new NothingFoundError(parsed.garbled ? GARBLED : NOTHING_FOUND);
  return { draft, source: parsed.source ?? "heuristic", removed: redacted + draft.removed };
}

/** An uploaded PDF / DOCX / TXT. `ai` is the user's AI-parsing choice (on by default). */
export async function parseFileForSetup(file: File, ai: boolean, bioLimits: BioLimits): Promise<SetupParse> {
  let redacted = 0;
  const prepareText = (raw: string) => {
    const r = redactForParsing(raw);
    redacted = r.removed;
    return r.text;
  };
  const parsed = ai ? await parseResumeWithAi(file, { prepareText, textOnly: true }) : await parseResume(file, { prepareText });
  return finish(parsed, redacted, bioLimits);
}

/** Pasted text. */
export async function parseTextForSetup(text: string, ai: boolean, bioLimits: BioLimits): Promise<SetupParse> {
  const r = redactForParsing(text);
  const parsed = ai ? await parseTextWithAi(r.text) : parseText(r.text);
  return finish(parsed, r.removed, bioLimits);
}
