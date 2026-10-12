/**
 * What the setup wizard sends when the user finishes (Resume Builder R1.4): ONE `POST
 * /api/profile/items/import` with the entries the user kept (edits applied), the skills, the languages
 * and the identity values they confirmed, then ONE `PUT /api/profile` with the answers only the profile
 * editor may write (preferences, typed-in identity values, the onboarded flag). Nothing is written
 * before this; abandoning the wizard writes nothing. Pure builders here, the two calls in `finish`.
 */
import type { ItemData, Provenance } from "@/lib/profile-items";
import { ItemApiError } from "@/lib/profile-items";
import {
  IDENTITY_KEYS,
  MAX_SKILL_CHARS,
  SKILLS_PER_ROW,
  SKILL_GROUP,
  type BioLimits,
  type Candidate,
  type Identity,
  type IdentityKey,
  type Language,
} from "./draft";

export type Decision = "keep" | "skip";

export interface ImportItem {
  section: string;
  dataJson: ItemData;
  provenance: Provenance;
}

export interface ImportBody {
  items: ImportItem[];
  bio?: Record<string, string>;
  provenanceBio?: "parsed";
}

/** The kept candidates in order, with the user's edits applied. An edited entry counts as the user's own. */
export function keptItems(candidates: Candidate[], decisions: Record<string, Decision>, edits: Record<string, ItemData>): ImportItem[] {
  return candidates
    .filter((c) => decisions[c.id] === "keep")
    .map((c) => ({
      section: c.section,
      dataJson: edits[c.id] ?? c.data,
      provenance: edits[c.id] ? ("USER" as const) : ("PARSED" as const),
    }));
}

/** SKILL items: one row of up to 40 skills each, like the API's seeding. */
export function skillItems(skills: string[]): ImportItem[] {
  const clean = skills.map((s) => s.trim().slice(0, MAX_SKILL_CHARS)).filter(Boolean);
  const rows: ImportItem[] = [];
  for (let i = 0; i < clean.length; i += SKILLS_PER_ROW) {
    rows.push({ section: "SKILL", dataJson: { group: SKILL_GROUP, skills: clean.slice(i, i + SKILLS_PER_ROW) }, provenance: "PARSED" });
  }
  return rows;
}

export function languageItems(languages: Language[]): ImportItem[] {
  return languages.map((l) => ({
    section: "LANGUAGE",
    dataJson: l.level ? { name: l.name, level: l.level } : { name: l.name },
    provenance: "PARSED" as const,
  }));
}

export interface IdentityPlan {
  /** Values equal to what the resume said: imported with provenance "parsed". */
  fromResume: Record<string, string>;
  /** Values the user typed or kept from before that differ from the resume: written through the profile PUT. */
  fromUser: Record<string, string>;
}

/**
 * Splits the confirmed identity values by where they came from. A value the user left untouched (the
 * profile's own, or the resume's) never overwrites anything unasked: `existing` values stay unless the
 * user chose the resume's value in the card.
 */
export function planIdentity(values: Identity, parsed: Identity, existing: Record<string, unknown>, bioLimits: BioLimits): IdentityPlan {
  const fromResume: Record<string, string> = {};
  const fromUser: Record<string, string> = {};
  for (const k of IDENTITY_KEYS) {
    const v = (values[k] ?? "").trim();
    if (!v) continue;
    const had = typeof existing[k] === "string" ? (existing[k] as string).trim() : "";
    if (v === had) continue; // unchanged: nothing to write
    const cap = k === "summary" ? bioLimits.summaryChars : bioLimits.valueChars;
    const value = Array.from(v).slice(0, cap).join("");
    if (v === (parsed[k] ?? "").trim()) fromResume[k] = value;
    else fromUser[k] = value;
  }
  return { fromResume, fromUser };
}

/** The identity values the card starts with: what the profile already says, else what the resume said. */
export function initialIdentity(parsed: Identity, existing: Record<string, unknown>): Identity {
  const out: Identity = {};
  for (const k of IDENTITY_KEYS) {
    const had = typeof existing[k] === "string" ? (existing[k] as string).trim() : "";
    const v = had || parsed[k] || "";
    if (v) out[k] = v;
  }
  return out;
}

export interface IdentityConflict {
  existing: string;
  parsed: string;
}

/** Keys where the profile and the resume disagree; the card asks before the resume's value replaces yours. */
export function identityConflicts(parsed: Identity, existing: Record<string, unknown>): Partial<Record<IdentityKey, IdentityConflict>> {
  const out: Partial<Record<IdentityKey, IdentityConflict>> = {};
  for (const k of IDENTITY_KEYS) {
    const had = typeof existing[k] === "string" ? (existing[k] as string).trim() : "";
    const p = (parsed[k] ?? "").trim();
    if (had && p && had.toLowerCase() !== p.toLowerCase()) out[k] = { existing: had, parsed: p };
  }
  return out;
}

export function buildImportBody(items: ImportItem[], fromResume: Record<string, string>): ImportBody {
  const body: ImportBody = { items };
  if (Object.keys(fromResume).length > 0) {
    body.bio = fromResume;
    body.provenanceBio = "parsed";
  }
  return body;
}

export interface ImportResult {
  created: number;
  merged: number;
  updatedBio: boolean;
}

async function send<T>(url: string, method: string, body: unknown, fallback: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ItemApiError(0, null, fallback);
  }
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw new ItemApiError(res.status, json, fallback);
  return json as T | null;
}

/** `POST /api/profile/items/import` (one transaction on the server: a refusal writes nothing). */
export function postImport(body: ImportBody): Promise<ImportResult | null> {
  return send<ImportResult>("/api/profile/items/import", "POST", body, "Couldn't save your profile. Try again.");
}

/** `PUT /api/profile` with the merged bio payload (the client owns the merge, as everywhere else). */
export async function putBio(merged: Record<string, unknown>): Promise<void> {
  await send("/api/profile", "PUT", { payload: JSON.stringify(merged) }, "Couldn't save your answers. Try again.");
}
