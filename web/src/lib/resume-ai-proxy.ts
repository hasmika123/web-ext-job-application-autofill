/**
 * Body handling for the Resume Builder AI BFF routes (R4.1, DESIGN 9.6). The routes are thin proxies to Spring
 * (`ResumeAiResource`), which owns every rule - the plan gate (402 `PRO_REQUIRED`), consent, the cache, the daily
 * cap and per-minute rate (`ai.cap.resume.daily`, `resume.rate.aiPerMin`), the truth checks - so all this file does is
 * forward only the fields each call defines, with the right types, and nothing else the browser might add.
 */

/** The JSON object a request carries; `{}` for an empty or malformed body (Spring answers its own 400). */
async function readObject(request: Request): Promise<Record<string, unknown>> {
  const parsed: unknown = await request.json().catch(() => null);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function strings(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
}

/** `{refs, mode, consent}` for `POST /ai/rewrite`. */
export async function rewriteBody(request: Request): Promise<string> {
  const b = await readObject(request);
  return JSON.stringify({
    refs: strings(b.refs),
    mode: typeof b.mode === "string" ? b.mode : undefined,
    consent: b.consent === true,
  });
}

/** `{tone, consent}` for `POST /ai/summary`. */
export async function summaryBody(request: Request): Promise<string> {
  const b = await readObject(request);
  return JSON.stringify({ tone: typeof b.tone === "string" ? b.tone : undefined, consent: b.consent === true });
}

/** `{consent, refresh}` for `POST /ai/suggestions`. */
export async function suggestBody(request: Request): Promise<string> {
  const b = await readObject(request);
  return JSON.stringify({ consent: b.consent === true, refresh: b.refresh === true });
}

/** `{keep, alternatives}` for `POST /ai/proposals/:pid/apply`: refs and an alternative index per ref, never text. */
export async function applyBody(request: Request): Promise<string> {
  const b = await readObject(request);
  let alternatives: Record<string, number> | undefined;
  if (b.alternatives !== null && typeof b.alternatives === "object" && !Array.isArray(b.alternatives)) {
    alternatives = {};
    for (const [ref, index] of Object.entries(b.alternatives as Record<string, unknown>)) {
      if (typeof index === "number" && Number.isInteger(index)) alternatives[ref] = index;
    }
  }
  return JSON.stringify({ keep: strings(b.keep), alternatives });
}
