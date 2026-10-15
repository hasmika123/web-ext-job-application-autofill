import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { editorTitle, loadEditorData } from "@/lib/resume-editor-data";
import ResumeEditor from "@/components/app-v3/resume-builder/ResumeEditor";

/** The tab reads "Kiwiply | <resume name>" (root template); falls back to "Edit resume" when it cannot be read. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: await editorTitle(id) };
}

/**
 * The Resume Builder editor (DESIGN 10.1): the document, the builder config, the AI meter and the
 * profile's update time are fetched here in parallel, on the server (`loadEditorData`, shared by every place the one editor is mounted), and handed to the
 * `ResumeEditor` client island, which does all the editing and saving through the
 * `/api/resumes/[id]/doc` BFF. A resume that is not the caller's (or is an uploaded file with no
 * document) is a 404. `?view=pdf` / `?view=settings` / `?tab=ai` (the My Resumes buttons and card menu) pick where the editor opens. The job target (R5.6) and open AI proposals (R4.1) are empty until those
 * stories land.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string | string[]; tab?: string | string[] }> }) {
  const { id } = await params;
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const data = await loadEditorData(id);
  if (data.kind === "notFound") notFound();
  if (data.kind === "signin") redirect("/login");
  if (data.kind === "error") throw new Error(`Couldn't load the resume (${data.status}).`);

  return (
    <ResumeEditor
      initial={data.initial}
      plan={data.plan}
      config={data.config}
      aiUsageLine={data.aiUsageLine}
      profileUpdatedAt={data.profileUpdatedAt}
      initialMeta={data.initialMeta}
      primaryResumeId={data.primaryResumeId}
      jobTarget={null}
      entry={{ view: one(q.view) === "pdf" ? "pdf" : one(q.view) === "settings" ? "settings" : undefined, tab: one(q.tab) === "ai" ? "ai" : undefined }}
    />
  );
}
