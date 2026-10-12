import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { getPlan } from "@/lib/billing";
import { parseEtag, type ResumeDocDTO } from "@/lib/resume-doc";
import ResumeEditor from "@/components/app-v3/resume-builder/ResumeEditor";

export const metadata: Metadata = { title: "Edit resume" };

/**
 * The Resume Builder editor (DESIGN 6.5): the document and the plan are fetched here, on the
 * server, and handed to the `ResumeEditor` client island, which does all the editing and saving
 * through the `/api/resumes/[id]/doc` BFF. A resume that is not the caller's (or is an uploaded
 * file with no document) is a 404.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const [docRes, plan] = await Promise.all([serverApiFetch(`/api/profile/resumes/${id}/doc`), getPlan()]);
  if (docRes.status === 401 || docRes.status === 403) redirect("/login");
  if (docRes.status === 404 || docRes.status === 400) notFound();
  if (!docRes.ok) throw new Error(`Couldn't load the resume (${docRes.status}).`);

  const dto = (await docRes.json()) as ResumeDocDTO;
  // The ETag is the version of record; the body carries the same number.
  const docVersion = parseEtag(docRes.headers.get("etag")) ?? dto.docVersion;

  return <ResumeEditor initial={{ ...dto, docVersion }} plan={plan.plan} />;
}
