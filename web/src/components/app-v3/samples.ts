/**
 * `samples(name, enabled)`: the ONLY way a page reaches the board's sample rows in `sample-data.ts` (U0.5).
 *
 * When the gate is closed (every real account, and every demo account on a build without
 * `NEXT_PUBLIC_BOARD_SAMPLES=1`; see `@/lib/samples`) a list sample comes back as `[]` and any other sample
 * (a record, a number, a block of copy) as `null`, so the page has to render its honest empty state. Page
 * components get `enabled` from `useSamples()`; server pages from `samplesEnabled(account.login)`.
 *
 * Only DATA is registered here. Structural constants (tab labels, filter option lists, page sizes, the types) stay
 * plain imports from `sample-data.ts`: they are chrome, not rows, and never show an invented number.
 */
import * as S from "./sample-data";

const REGISTRY = {
  // Dashboard
  DASH_STATS: S.DASH_STATS,
  DASH_ACTIVITY: S.DASH_ACTIVITY,
  DASH_ACTIVITY_PERIODS: S.DASH_ACTIVITY_PERIODS,
  DASH_STATUS: S.DASH_STATUS,
  DASH_INSIGHTS: S.DASH_INSIGHTS,
  DASH_RECENT: S.DASH_RECENT,
  DASH_RECOMMENDED: S.DASH_RECOMMENDED,
  DASH_PROFILE_CHECKS: S.DASH_PROFILE_CHECKS,
  DASH_PROFILE_PCT: S.DASH_PROFILE_PCT,
  DASH_INTERVIEWS: S.DASH_INTERVIEWS,
  DASH_ALERTS: S.DASH_ALERTS,
  // Jobs
  V3_JOBS: S.V3_JOBS,
  JOBS_SAMPLE_TOTAL: S.JOBS_SAMPLE_TOTAL,
  GOOGLE_V3_DETAIL: S.GOOGLE_V3_DETAIL,
  // Applications, saved, profiles
  V3_SAVED_JOBS: S.V3_SAVED_JOBS,
  V3_PROFILE_FALLBACK: S.V3_PROFILE_FALLBACK,
  V3_PROFILE_VARIANTS: S.V3_PROFILE_VARIANTS,
  V3_RESUME_VERSION_SAMPLES: S.V3_RESUME_VERSION_SAMPLES,
  // Assistant, alerts, messages
  ASSISTANT_RECENT_CHATS: S.ASSISTANT_RECENT_CHATS,
  ASSISTANT_CANNED_REPLY: S.ASSISTANT_CANNED_REPLY,
  ALERTS: S.ALERTS,
  ALERT_SETTINGS: S.ALERT_SETTINGS,
  CONVERSATIONS: S.CONVERSATIONS,
  MESSAGES_NOTE: S.MESSAGES_NOTE,
  // Interview prep
  IP_QUESTION_SETS: S.IP_QUESTION_SETS,
  IP_POPULAR_QUESTIONS: S.IP_POPULAR_QUESTIONS,
  IP_MORE_QUESTIONS: S.IP_MORE_QUESTIONS,
  IP_RECENT_SESSIONS: S.IP_RECENT_SESSIONS,
  IP_PROGRESS: S.IP_PROGRESS,
  IP_MOCK_TYPES: S.IP_MOCK_TYPES,
  // Explore
  EX_COMPANIES: S.EX_COMPANIES,
  EX_ROLES: S.EX_ROLES,
  EX_PATHS: S.EX_PATHS,
  EX_RESOURCES: S.EX_RESOURCES,
  // Analytics
  AN_SAMPLE: S.AN_SAMPLE,
  AN_SKILLS: S.AN_SKILLS,
};

type Registry = typeof REGISTRY;
export type SampleName = keyof Registry;

/** What `samples(name, ...)` returns: the list itself (or `[]`), or the value (or `null`) for a non-list. */
export type SampleOf<K extends SampleName> = Registry[K] extends readonly (infer U)[] ? U[] : Registry[K] | null;

export function samples<K extends SampleName>(name: K, enabled: boolean): SampleOf<K> {
  const value: unknown = REGISTRY[name];
  if (enabled) return value as SampleOf<K>;
  return (Array.isArray(value) ? [] : null) as SampleOf<K>;
}
