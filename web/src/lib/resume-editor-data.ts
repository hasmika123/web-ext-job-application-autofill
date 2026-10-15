/**
 * Server-side data for the Resume Builder editor page, shared by EVERY place the one editor is mounted: the personal app
 * (`/resume-builder/[id]`), a consultant's own resume inside an organization workspace (`/w/consultant/resumes/[id]`) and a marketer editing a
 * consultant's resume (`/w/marketing/resumes/[orgResumeId]`). The pages are thin wrappers around this and `ResumeEditor`; the only difference is
 * `actFor` (the directory row a marketer acts on), which the API's act-for gate checks on every call.
 */
import { cache } from "react";
import { describeAiUsage, getAiUsage } from "@/lib/ai-usage";
import { serverApiFetch } from "@/lib/api";
import { getPlan } from "@/lib/billing";
import { getBuilderConfig, type ResumeBuilderConfig } from "@/lib/resume-builder-config";
import { parseEtag, type ResumeDocDTO } from "@/lib/resume-doc";
import type { ResumeMeta } from "@/lib/resume-meta";

const actForInit = (actFor: number | null | undefined): RequestInit => (actFor ? { headers: { "X-Kiwiply-Act-For": String(actFor) } } : {});

/**
 * The document, fetched once per request (`generateMetadata` and the page share it). An uploaded file has no document yet: open it by converting it in
 * place (idempotent, same resume id). Someone else's resume is still a 404 from the import call. Acting for someone never converts (the importer is the
 * owner's own action).
 */
export const loadEditorDoc = cache(async (id: string, actFor: number | null = null) => {
  const init = actForInit(actFor);
  let res = await serverApiFetch(`/api/profile/resumes/${id}/doc`, init);
  if (!actFor && (res.status === 404 || res.status === 400)) {
    const imported = await serverApiFetch(`/api/profile/resumes/${id}/doc/import`, { method: "POST" });
    if (imported.ok) res = await serverApiFetch(`/api/profile/resumes/${id}/doc`);
  }
  const dto = res.ok ? ((await res.json()) as ResumeDocDTO) : null;
  return { status: res.status, ok: res.ok, etag: res.headers.get("etag"), dto };
});

/** The tab reads "Kiwiply | <resume name>" (root template); falls back to "Edit resume" when it cannot be read. */
export async function editorTitle(id: string, actFor: number | null = null): Promise<string> {
  if (!/^\d+$/.test(id)) return "Edit resume";
  try {
    const { dto } = await loadEditorDoc(id, actFor);
    return dto?.label?.trim() || "Edit resume";
  } catch {
    return "Edit resume";
  }
}

/** When the Common Profile last changed (`GET /api/profile` -> `updatedAt`); null when unknown. Never throws. */
async function getProfileUpdatedAt(): Promise<string | null> {
  try {
    const res = await serverApiFetch("/api/profile");
    if (!res.ok) return null;
    const bio = (await res.json()) as { updatedAt?: unknown };
    return typeof bio.updatedAt === "string" ? bio.updatedAt : null;
  } catch {
    return null;
  }
}

/** The resume's metadata for the header bar (`GET .../meta`); null when it cannot be read (the bar then reads it itself). Never throws. */
async function getMeta(id: string, actFor: number | null): Promise<ResumeMeta | null> {
  try {
    const res = await serverApiFetch(`/api/profile/resumes/${id}/meta`, actForInit(actFor));
    return res.ok ? ((await res.json()) as ResumeMeta) : null;
  } catch {
    return null;
  }
}

/** The id of the user's primary resume, so "Set as primary" can offer Undo; null when unknown. Never throws. */
async function getPrimaryResumeId(): Promise<number | null> {
  try {
    const res = await serverApiFetch("/api/profile/resumes");
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id?: unknown; primary?: unknown; defaultResume?: unknown; archived?: unknown }>;
    const row = Array.isArray(rows) ? rows.find((r) => (r.primary ?? r.defaultResume) === true && r.archived !== true) : undefined;
    return typeof row?.id === "number" ? row.id : null;
  } catch {
    return null;
  }
}

export type EditorData =
  | { kind: "signin" }
  | { kind: "notFound" }
  | { kind: "error"; status: number }
  | {
      kind: "ok";
      initial: ResumeDocDTO;
      plan: "FREE" | "PRO";
      config: ResumeBuilderConfig;
      aiUsageLine: { headline: string; detail: string } | null;
      profileUpdatedAt: string | null;
      initialMeta: ResumeMeta | null;
      primaryResumeId: number | null;
    };

/**
 * Everything `ResumeEditor` needs, fetched in parallel. Personal and consultant sessions read the signed-in person's own plan, AI meter, profile time
 * and primary; acting for someone reads only what the consultant's document, metadata and capabilities say (the marketer's own plan is not the
 * consultant's, and nothing of the marketer's profile belongs in the consultant's editor).
 */
export async function loadEditorData(id: string, actFor: number | null = null): Promise<EditorData> {
  if (!/^\d+$/.test(id)) return { kind: "notFound" };
  const [docRes, plan, config, aiUsage, profileUpdatedAt, meta, primaryResumeId] = await Promise.all([
    loadEditorDoc(id, actFor),
    actFor ? Promise.resolve({ plan: "FREE" as const }) : getPlan(),
    getBuilderConfig(actForInit(actFor)),
    actFor ? Promise.resolve(null) : getAiUsage(),
    actFor ? Promise.resolve(null) : getProfileUpdatedAt(),
    getMeta(id, actFor),
    actFor ? Promise.resolve(null) : getPrimaryResumeId(),
  ]);
  if (docRes.status === 401 || docRes.status === 403) return { kind: "signin" };
  if (docRes.status === 404 || docRes.status === 400) return { kind: "notFound" };
  if (!docRes.ok) return { kind: "error", status: docRes.status };
  const dto = docRes.dto as ResumeDocDTO;
  // The ETag is the version of record; the body carries the same number.
  const docVersion = parseEtag(docRes.etag) ?? dto.docVersion;
  const aiUsageLine = aiUsage ? describeAiUsage(aiUsage) : null;
  return {
    kind: "ok",
    initial: { ...dto, docVersion },
    plan: plan.plan === "PRO" ? "PRO" : "FREE",
    config,
    aiUsageLine: aiUsageLine ? { headline: aiUsageLine.headline, detail: aiUsageLine.detail } : null,
    profileUpdatedAt,
    initialMeta: meta,
    primaryResumeId,
  };
}
