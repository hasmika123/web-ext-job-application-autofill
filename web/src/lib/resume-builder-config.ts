/**
 * The Resume Builder's settings, as the web sees them (Resume Builder DESIGN 9.1 / 15.1).
 *
 * `GET /api/profile/resume-builder/config` evaluates every tunable (limits, score weights, template
 * switches, feature flags, the plan and the resume cap) from the API's `ResumeBuilderSettings`.
 * This file is the ONLY web reader of it and the only place a builder limit may be written as a
 * number: the ESLint rule `resume-builder/no-config-literal` forbids numeric literals >= 100 in
 * `components/app-v3/resume-builder/**` unless the line carries `// config-literal-ok: <reason>`
 * (layout/art sizes, unit conversions, schema constants). Read `config.limits.bulletChars`, never `600`.
 *
 * `DEFAULT_BUILDER_CONFIG` repeats the API's declared defaults and is used when the API cannot be
 * reached (the editor still opens; the server re-validates every save with its own settings).
 * The types and the defaults live in `resume-builder-config.shared.ts` (re-exported here) so client
 * code can read them without pulling the server-only fetch below into the browser bundle.
 */
import { serverApiFetch } from "@/lib/api";
import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";

export * from "@/lib/resume-builder-config.shared";

/**
 * The builder config for Server Components. Never throws: if the API is unreachable, answers
 * non-2xx or returns something that is not an object, the editor gets {@link DEFAULT_BUILDER_CONFIG}
 * (Free, no AI) - the server re-checks everything it enforces on each call anyway.
 */
export async function getBuilderConfig(): Promise<ResumeBuilderConfig> {
  try {
    const res = await serverApiFetch("/api/profile/resume-builder/config");
    if (!res.ok) return DEFAULT_BUILDER_CONFIG;
    const body: unknown = await res.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) return DEFAULT_BUILDER_CONFIG;
    return body as ResumeBuilderConfig;
  } catch {
    return DEFAULT_BUILDER_CONFIG;
  }
}
