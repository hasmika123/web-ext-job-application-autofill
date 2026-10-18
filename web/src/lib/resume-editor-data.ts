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

/**
 * Defence in depth: the API already sends an acting marketer a document without storage keys; this drops them again before the document is handed to the
 * client component, so a key can never reach the marketer's browser through this loader even if an older API answers with one.
 */
export function withoutStorageKeys(dto: ResumeDocDTO): ResumeDocDTO {
  const doc = dto.doc as unknown as { meta?: Record<string, unknown>; basics?: Record<string, unknown> } | undefined;
  if (!doc) return dto;
  const meta = doc.meta ? Object.fromEntries(Object.entries(doc.meta).filter(([k]) => k !== "originalFileKey")) : doc.meta;
  const photo = doc.basics?.photo;
  const basics =
    doc.basics && photo && typeof photo === "object" ? { ...doc.basics, photo: Object.fromEntries(Object.entries(photo as Record<string, unknown>).filter(([k]) => k !== "key")) } : doc.basics;
  return { ...dto, doc: { ...doc, meta, basics } as unknown as ResumeDocDTO["doc"] };
}

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

/**
 * The Common Profile's last change (`GET /api/profile` -> `updatedAt`) and the country on it (`payload.country`, upper-case
 * letters only, for the photo dialog's region note); null when unknown. Never throws.
 */
async function getProfileBasics(): Promise<{ updatedAt: string | null; country: string | null }> {
  try {
    const res = await serverApiFetch("/api/profile");
    if (!res.ok) return { updatedAt: null, country: null };
    const bio = (await res.json()) as { updatedAt?: unknown; payload?: unknown };
    let country: string | null = null;
    if (typeof bio.payload === "string") {
      try {
        const c = (JSON.parse(bio.payload) as { country?: unknown }).country;
        country = typeof c === "string" && /^[A-Za-z]{2}$/.test(c.trim()) ? c.trim().toUpperCase() : null;
      } catch {
        /* a bio payload that is not JSON has no country */
      }
    }
    return { updatedAt: typeof bio.updatedAt === "string" ? bio.updatedAt : null, country };
  } catch {
    return { updatedAt: null, country: null };
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
      profileCountry: string | null;
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
  const [docRes, plan, config, aiUsage, profileBasics, meta, primaryResumeId] = await Promise.all([
    loadEditorDoc(id, actFor),
    actFor ? Promise.resolve({ plan: "FREE" as const }) : getPlan(),
    getBuilderConfig(actForInit(actFor)),
    actFor ? Promise.resolve(null) : getAiUsage(),
    actFor ? Promise.resolve({ updatedAt: null, country: null }) : getProfileBasics(),
    getMeta(id, actFor),
    actFor ? Promise.resolve(null) : getPrimaryResumeId(),
  ]);
  if (docRes.status === 401 || docRes.status === 403) return { kind: "signin" };
  if (docRes.status === 404 || docRes.status === 400) return { kind: "notFound" };
  if (!docRes.ok) return { kind: "error", status: docRes.status };
  const dto = actFor ? withoutStorageKeys(docRes.dto as ResumeDocDTO) : (docRes.dto as ResumeDocDTO);
  // The ETag is the version of record; the body carries the same number.
  const docVersion = parseEtag(docRes.etag) ?? dto.docVersion;
  const aiUsageLine = aiUsage ? describeAiUsage(aiUsage) : null;
  return {
    kind: "ok",
    initial: { ...dto, docVersion },
    plan: plan.plan === "PRO" ? "PRO" : "FREE",
    config,
    aiUsageLine: aiUsageLine ? { headline: aiUsageLine.headline, detail: aiUsageLine.detail } : null,
    profileUpdatedAt: profileBasics.updatedAt,
    profileCountry: profileBasics.country,
    initialMeta: meta,
    primaryResumeId,
  };
}
