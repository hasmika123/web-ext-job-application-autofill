/**
 * The BFF half of the Resume Score (Resume Builder DESIGN 11.1 / 11.5, DECISIONS #7): `PUT
 * /api/resumes/[id]/doc` runs the same `scoreResume` the editor runs live and forwards the compact
 * result to Spring, which stores it without evaluating (`resume_doc.score_json` / `score`). Java never
 * scores; the browser's own number is never trusted (a `score` in the request body is dropped).
 *
 * The score's inputs besides the document come from the SERVER'S view of the resume - the stored
 * template and theme (one `GET .../doc`) and the builder settings (`resume.score.*`,
 * `resume.templates.overrides`, cached for the config's own 60 s) - plus the optional `pages` the editor
 * measured. Scoring is best effort: whatever fails here, the save still goes through without a score.
 */
import {
  DEFAULT_SCORE_CONFIG,
  resolveCapabilities,
  sanitizeTheme,
  scoreResume,
  toPersistedScore,
  type ResumePersistedScore,
  type ResumeScoreConfig,
  type ResumeTheme,
} from "@kiwiply/ui";
import { serverApiFetch } from "@/lib/api";
import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";

/** How long the settings slice is reused: the config endpoint's own `max-age` (DESIGN 9.1). */
const SETTINGS_TTL_MS = 60_000;

interface ScoreSettings {
  score: ResumeScoreConfig;
  overrides: ResumeBuilderConfig["templates"]["overrides"];
  default: string;
}

let cached: { at: number; value: ScoreSettings } | null = null;

const fallbackSettings = (): ScoreSettings => ({
  score: DEFAULT_BUILDER_CONFIG.score,
  overrides: DEFAULT_BUILDER_CONFIG.templates.overrides,
  default: DEFAULT_BUILDER_CONFIG.templates.default,
});

/** Test hook: forget the cached settings. */
export function resetScoreSettingsCache(): void {
  cached = null;
}

async function loadSettings(now: number): Promise<ScoreSettings> {
  if (cached && now - cached.at < SETTINGS_TTL_MS) return cached.value;
  try {
    const res = await serverApiFetch("/api/profile/resume-builder/config");
    if (!res.ok) return fallbackSettings();
    const body = (await res.json()) as Partial<ResumeBuilderConfig> | null;
    if (!body || typeof body !== "object" || !body.score) return fallbackSettings();
    // Only the global slices are kept; the plan-specific fields of the response are never reused across users.
    const value: ScoreSettings = {
      score: body.score,
      overrides: body.templates?.overrides ?? {},
      default: body.templates?.default ?? DEFAULT_BUILDER_CONFIG.templates.default,
    };
    cached = { at: now, value };
    return value;
  } catch {
    return fallbackSettings();
  }
}

interface StoredPresentation {
  templateId: string | null;
  theme: Partial<ResumeTheme> | null;
}

async function loadPresentation(resumeId: string): Promise<StoredPresentation | null> {
  try {
    const res = await serverApiFetch(`/api/profile/resumes/${resumeId}/doc`);
    if (!res.ok) return null;
    const dto = (await res.json()) as { templateId?: unknown; theme?: unknown } | null;
    if (!dto || typeof dto !== "object") return null;
    return {
      templateId: typeof dto.templateId === "string" ? dto.templateId : null,
      theme: dto.theme && typeof dto.theme === "object" && !Array.isArray(dto.theme) ? (dto.theme as Partial<ResumeTheme>) : null,
    };
  } catch {
    return null;
  }
}

/**
 * The persisted score for a save, or `null` when it cannot be computed (then the save carries none and
 * Spring keeps the previous value). `theme` is the one in the request body when it carries one, else
 * the stored one; `pages` is the editor's measured page count (null = unknown, so F4 passes).
 */
export async function scoreForSave(
  resumeId: string,
  input: { doc: unknown; theme?: unknown; pages?: unknown },
  now: number = Date.now(),
): Promise<ResumePersistedScore | null> {
  try {
    if (!input.doc || typeof input.doc !== "object") return null;
    const [settings, stored] = await Promise.all([loadSettings(now), loadPresentation(resumeId)]);
    if (!stored) return null;
    const templateId = stored.templateId ?? settings.default;
    const theme = sanitizeTheme(input.theme && typeof input.theme === "object" ? (input.theme as Partial<ResumeTheme>) : stored.theme);
    const pages = typeof input.pages === "number" && Number.isInteger(input.pages) && input.pages >= 1 ? input.pages : null;
    const report = scoreResume(
      input.doc,
      {
        caps: resolveCapabilities(templateId, settings.overrides),
        theme,
        pages,
        jobExtract: null,
        now: new Date(now).toISOString().slice(0, 7),
      },
      settings.score ?? DEFAULT_SCORE_CONFIG,
    );
    return toPersistedScore(report);
  } catch {
    return null;
  }
}
