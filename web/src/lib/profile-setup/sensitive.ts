/**
 * Never-collected values in the profile setup (Resume Builder R1.4, DESIGN section 16): the text of an
 * uploaded file or a paste is stripped of Social Security / tax numbers, bank and routing numbers,
 * passport / visa / document numbers and dates of birth BEFORE it is parsed, so none of it reaches the
 * AI parser, the heuristic parser, the review or the profile. This is the browser half of the guard
 * (the API's `SensitivePatterns` still refuses anything that gets past it). Pure: no network, no DOM.
 */
import { SENSITIVE_REDACTED, redactSensitive, redactSensitiveField, scanSensitive, scanSensitiveField } from "@kiwiply/ui";

export interface Redaction {
  text: string;
  /** How many sensitive values were taken out. */
  removed: number;
}

/** `text` with every never-collected value taken out, and how many there were. */
export function redactForParsing(text: string): Redaction {
  const removed = scanSensitive(text).length;
  return { text: removed === 0 ? text : redactSensitive(text), removed };
}

const MARKER = new RegExp(SENSITIVE_REDACTED.replace(/[[\]]/g, "\\$&"), "g");

/** Takes the redaction marker (and the dangling label or punctuation it leaves) out of a parsed value. */
export function stripMarker(value: string): string {
  if (!value.includes(SENSITIVE_REDACTED)) return value;
  return value
    .replace(MARKER, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/[\s:,;#-]+$/g, "")
    .trim();
}

/**
 * A parsed string under a field name, cleaned a second time: anything the parser put back that still
 * looks like a never-collected value is removed, and so is the marker the first pass left in the text.
 */
export function cleanParsedString(key: string, value: string): { value: string; removed: number } {
  const removed = scanSensitiveField(key, value).length;
  const cleaned = removed === 0 ? value : redactSensitiveField(key, value);
  return { value: stripMarker(cleaned), removed };
}

/** "We removed 2 sensitive values - we never collect those." (nothing when none were removed). */
export function removedNotice(removed: number): string | null {
  if (removed <= 0) return null;
  return `We removed ${removed} sensitive ${removed === 1 ? "value" : "values"} from what you gave us - we never collect those.`;
}
