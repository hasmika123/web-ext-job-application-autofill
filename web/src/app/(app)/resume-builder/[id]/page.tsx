import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { describeAiUsage, getAiUsage } from "@/lib/ai-usage";
import { serverApiFetch } from "@/lib/api";
import { getPlan } from "@/lib/billing";
import { getBuilderConfig } from "@/lib/resume-builder-config";
import { parseEtag, type ResumeDocDTO } from "@/lib/resume-doc";
import type { ResumeMeta } from "@/lib/resume-meta";
import ResumeEditor from "@/components/app-v3/resume-builder/ResumeEditor";

export const metadata: Metadata = { title: "Edit resume" };

/** When the Common Profile last changed (`GET /api/profile` → `updatedAt`); null when unknown. Never throws. */
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

/** The resume's metadata for the header bar (`GET …/meta`); null when it cannot be read (the bar then reads it itself). Never throws. */
async function getMeta(id: string): Promise<ResumeMeta | null> {
  try {
    const res = await serverApiFetch(`/api/profile/resumes/${id}/meta`);
    return res.ok ? ((await res.json()) as ResumeMeta) : null;
  } catch {
    return null;
  }
}

/**
 * The Resume Builder editor (DESIGN 10.1): the document, the builder config, the AI meter and the
 * profile's update time are fetched here in parallel, on the server, and handed to the
 * `ResumeEditor` client island, which does all the editing and saving through the
 * `/api/resumes/[id]/doc` BFF. A resume that is not the caller's (or is an uploaded file with no
 * document) is a 404. `?view=pdf` / `?view=settings` / `?tab=ai` (the My Resumes buttons and card menu) pick where the editor opens. The job target (R5.6) and open AI proposals (R4.1) are empty until those
 * stories land.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string | string[]; tab?: string | string[] }> }) {
  const { id } = await params;
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (!/^\d+$/.test(id)) notFound();

  const [docRes, plan, config, aiUsage, profileUpdatedAt, meta] = await Promise.all([
    serverApiFetch(`/api/profile/resumes/${id}/doc`),
    getPlan(),
    getBuilderConfig(),
    getAiUsage(),
    getProfileUpdatedAt(),
    getMeta(id),
  ]);
  if (docRes.status === 401 || docRes.status === 403) redirect("/login");
  if (docRes.status === 404 || docRes.status === 400) notFound();
  if (!docRes.ok) throw new Error(`Couldn't load the resume (${docRes.status}).`);

  const dto = (await docRes.json()) as ResumeDocDTO;
  // The ETag is the version of record; the body carries the same number.
  const docVersion = parseEtag(docRes.headers.get("etag")) ?? dto.docVersion;
  const aiUsageLine = aiUsage ? describeAiUsage(aiUsage) : null;

  return (
    <ResumeEditor
      initial={{ ...dto, docVersion }}
      plan={plan.plan}
      config={config}
      aiUsageLine={aiUsageLine ? { headline: aiUsageLine.headline, detail: aiUsageLine.detail } : null}
      profileUpdatedAt={profileUpdatedAt}
      initialMeta={meta}
      jobTarget={null}
      openProposals={[]}
      entry={{ view: one(q.view) === "pdf" ? "pdf" : one(q.view) === "settings" ? "settings" : undefined, tab: one(q.tab) === "ai" ? "ai" : undefined }}
    />
  );
}
