/**
 * Resume structure types — the shapes the ResumeUpload form reads/writes. The single
 * source of truth for the parsed-resume shape, shared by web + extension. The runtime
 * structuring lives in the extension's `parser-core.js` (the web app types its synced copy
 * over these same shapes); this file is types-only (no DOM/network/runtime).
 */
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
