/**
 * Field limits used as input `maxLength` caps + in validation. Mirror of the web app's
 * `@/lib/validate` LIMITS (kept here so @kiwiply/ui is self-contained). Only the keys the
 * ResumeUpload form uses matter, but the full set is copied to stay in lockstep with web.
 */
export const LIMITS = {
  username: 50,
  emailMax: 254,
  passwordMin: 4,
  passwordMax: 100,
  name: 100,
  phone: 40,
  url: 2048,
  address: 200,
  resumeLabel: 100,
  resumeLabelServer: 200,
  skill: 60,
  text: 200,
  summary: 5000,
  bullet: 2000,
} as const;
