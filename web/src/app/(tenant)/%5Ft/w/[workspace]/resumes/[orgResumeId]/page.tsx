import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ResumeEditor from "@/components/app-v3/resume-builder/ResumeEditor";
import { BuilderEnvProvider, actForEditorEnv } from "@/components/app-v3/resume-builder/builderEnv";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { serverApiFetch } from "@/lib/api";
import { loadEditorData } from "@/lib/resume-editor-data";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { can } from "@/lib/ent/workspaces";

/**
 * A marketer editing an ASSIGNED consultant's resume in the Resume Builder (`/w/marketing/resumes/<directory row>`), in act-for mode: the very same
 * `ResumeEditor` as everywhere else, mounted inside the organization's shell. A thin wrapper: the row is looked up through the Resumes board's own detail
 * call (which names the builder resume behind it), the editor's calls carry the row (`actForEditorEnv`), and the API's act-for gate decides every one of
 * them (organization host, resumes.edit_for, ASSIGNED scope, allow-listed routes) with the generic 404. What a marketer may do here (no sharing, no delete,
 * no primary, no AI) comes from the API's capabilities, and what they write waits for the consultant's approval.
 */
export const metadata: Metadata = { title: "Edit resume", robots: { index: false, follow: false } };

async function builderResumeOf(orgId: number, orgResumeId: number): Promise<number | null> {
  try {
    const res = await serverApiFetch(`/api/orgs/${orgId}/resumes/${orgResumeId}`);
    if (!res.ok) return null;
    const detail = (await res.json()) as { row?: { resumeId?: unknown } };
    return typeof detail.row?.resumeId === "number" ? detail.row.resumeId : null;
  } catch {
    return null;
  }
}

export default async function MarketerResumeEditorRoute({ params }: { params: Promise<{ workspace: string; orgResumeId: string }> }) {
  const { workspace, orgResumeId: rawRow } = await params;
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (workspace !== "marketing" || !/^\d+$/.test(rawRow)) notFound();
  if (!can(me, "resumes.edit_for")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  const row = Number(rawRow);

  const resumeId = await builderResumeOf(me.org.id, row);
  if (resumeId === null) notFound();
  const data = await loadEditorData(String(resumeId), row);
  if (data.kind === "notFound") notFound();
  if (data.kind === "signin") redirect("/login");
  if (data.kind === "error") throw new Error(`Couldn't load the resume (${data.status}).`);

  return (
    <BuilderEnvProvider env={actForEditorEnv(row, resumeId)}>
      <div data-builder-frame className="flex min-h-0 flex-1 flex-col overflow-hidden bg-v2-canvas">
        <ResumeEditor
          initial={data.initial}
          plan={data.plan}
          config={data.config}
          aiUsageLine={null}
          profileUpdatedAt={null}
          initialMeta={data.initialMeta}
          primaryResumeId={null}
          jobTarget={null}
        />
      </div>
    </BuilderEnvProvider>
  );
}
