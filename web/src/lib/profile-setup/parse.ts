/**
 * Upload / Paste -> a `ParsedDraft` for the setup wizard (Resume Builder R1.4). The same pipeline as
 * the resumes page (`parseResumeWithAi` with the heuristic `parser-core` fallback, `parseResume` when
 * the user opted out of AI parsing), with one addition that matters: the extracted text goes through
 * the never-collected-values filter BEFORE it is structured or sent anywhere, and the original file is
 * never sent to the AI parser (a file cannot be redacted; its text can). Reusable by the new-resume
 * chooser's "Upload a resume" path (R2.6).
 */
import type { ParsedBio, StructuredResume } from "@kiwiply/ui";
import { heuristicStructure } from "@/lib/parser-core";
import { parseResume, parseResumeWithAi, parseText, parseTextWithAi, type ParsedResume } from "@/lib/resume-parse";
import { toDraft, type ParsedDraft } from "./draft";
import { cleanParsedString, redactForParsing } from "./sensitive";

export interface SetupParse {
  draft: ParsedDraft;
  source: "ai" | "heuristic";
  /** Sensitive values removed from the text before parsing plus any removed from the parsed output. */
  removed: number;
}

/** Thrown when there is nothing to build a profile from; the message is shown to the user as is. */
export class NothingFoundError extends Error {}

const NOTHING_FOUND = "We couldn't find work history, education or skills in that. Try pasting the text of your resume instead.";
const GARBLED = "We couldn't read the text in that PDF - it may be a scan. Paste the text of your resume instead, or upload a DOCX or TXT version.";

function finish(parsed: ParsedResume, redacted: number): SetupParse {
  // Skill-looking terms the heuristic parser finds that an AI parse left out: offered as one-tap adds.
  const extras = parsed.source === "ai" && parsed.rawText ? heuristicStructure(parsed.rawText).skills : [];
  const draft = toDraft(parsed.structured, parsed.bio, extras);
  const found = draft.candidates.length > 0 || draft.skills.length > 0 || draft.languages.length > 0;
  if (!found) throw new NothingFoundError(parsed.garbled ? GARBLED : NOTHING_FOUND);
  return { draft, source: parsed.source ?? "heuristic", removed: redacted + draft.removed };
}

/** An uploaded PDF / DOCX / TXT. `ai` is the user's AI-parsing choice (on by default). */
export async function parseFileForSetup(file: File, ai: boolean): Promise<SetupParse> {
  let redacted = 0;
  const prepareText = (raw: string) => {
    const r = redactForParsing(raw);
    redacted = r.removed;
    return r.text;
  };
  const parsed = ai ? await parseResumeWithAi(file, { prepareText, textOnly: true }) : await parseResume(file, { prepareText });
  return finish(parsed, redacted);
}

/** Pasted text. */
export async function parseTextForSetup(text: string, ai: boolean): Promise<SetupParse> {
  const r = redactForParsing(text);
  const parsed = ai ? await parseTextWithAi(r.text) : parseText(r.text);
  return finish(parsed, r.removed);
}

/** An uploaded file read for the new-resume chooser: the parsed structure itself (arrays keep their indexes). */
export interface ResumeUploadParse {
  structured: StructuredResume;
  bio: ParsedBio;
  source: "ai" | "heuristic";
  /** Sensitive values taken out before parsing plus any taken out of the parsed output. */
  removed: number;
}

/** The same string, with the never-collected values (and the redaction marker) taken out; every array keeps its length and order. */
function cleanDeep(value: unknown, key: string, c: { removed: number }): unknown {
  if (typeof value === "string") {
    const r = cleanParsedString(key, value);
    c.removed += r.removed;
    return r.value;
  }
  if (Array.isArray(value)) return value.map((v) => cleanDeep(v, key, c));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cleanDeep(v, k, c)]));
  }
  return value;
}

/**
 * "Upload a resume" in the new-resume chooser (R2.6): the same pipeline as `parseFileForSetup` (text is
 * stripped of never-collected values before it is parsed or sent anywhere; the file itself never goes to
 * the AI parser), but the result is the `StructuredResume` + bio the API's `source: upload` takes, not a
 * profile draft. A second pass cleans the parsed strings; indexes in every array are preserved, because the
 * review's "untick this role" is sent back as an index into them (`KeepMask`).
 */
export async function parseFileForResume(file: File, ai: boolean): Promise<ResumeUploadParse> {
  let redacted = 0;
  const prepareText = (raw: string) => {
    const r = redactForParsing(raw);
    redacted = r.removed;
    return r.text;
  };
  const parsed = ai ? await parseResumeWithAi(file, { prepareText, textOnly: true }) : await parseResume(file, { prepareText });
  const c = { removed: redacted };
  const structured = cleanDeep(parsed.structured, "", c) as StructuredResume;
  const bio = cleanDeep(parsed.bio, "", c) as ParsedBio;
  const found =
    (structured.experience?.length ?? 0) > 0 ||
    (structured.education?.length ?? 0) > 0 ||
    (structured.skills?.length ?? 0) > 0 ||
    (structured.projects?.length ?? 0) > 0 ||
    !!structured.summary?.trim();
  if (!found) throw new NothingFoundError(parsed.garbled ? GARBLED : NOTHING_FOUND);
  return { structured, bio, source: parsed.source ?? "heuristic", removed: c.removed };
}
