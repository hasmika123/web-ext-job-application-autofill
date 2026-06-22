/**
 * Typed access to the shared resume-structuring core.
 *
 * The implementation is the extension's `job-autofill/src/lib/parser-core.js`, copied
 * into `./generated/parser-core.cjs` at build time (see scripts/sync-parser-core.mjs).
 * This module just adds TypeScript types over that single source of truth, so the web
 * app structures resumes identically to the extension. Pure (no DOM/network) — text in,
 * structured fields out; file→text extraction happens separately (pdf.js / mammoth).
 */
// The generated CommonJS copy carries no type declarations; types live here.
import * as core from "./generated/parser-core.cjs";

export interface ResumeExperience {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string[];
}

export interface ResumeEducation {
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string;
  location: string;
}

export interface ResumeLanguage {
  name: string;
  proficiency: string;
}

export interface ResumeProject {
  name: string;
  bullets: string[];
}

export interface StructuredResume {
  summary: string;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  languages: ResumeLanguage[];
  projects: ResumeProject[];
}

/** Personal-profile fields confidently extractable from a resume header. */
export interface ParsedBio {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  city?: string;
  state?: string;
}

const impl = core as {
  heuristicStructure: (text: string) => StructuredResume;
  parseBio: (text: string) => ParsedBio;
  splitSkills: (input: string | string[]) => string[];
};

/** Structure raw resume text into sections/fields (no API key, fully local). */
export function heuristicStructure(text: string): StructuredResume {
  return impl.heuristicStructure(text);
}

/** Pull name / contact / links / city-state out of the resume header. */
export function parseBio(text: string): ParsedBio {
  return impl.parseBio(text);
}

/** Split a skills blob into separate, deduped skills. */
export function splitSkills(input: string | string[]): string[] {
  return impl.splitSkills(input);
}
