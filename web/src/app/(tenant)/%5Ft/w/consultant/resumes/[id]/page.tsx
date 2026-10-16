import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ResumeEditor from "@/components/app-v3/resume-builder/ResumeEditor";
import { BuilderEnvFromSpec } from "@/components/app-v3/resume-builder/builderEnv";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { editorTitle, loadEditorData } from "@/lib/resume-editor-data";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * A consultant's own resume in the Resume Builder, INSIDE the organization workspace (`/w/consultant/resumes/<id>`): the tenant URL, the organization's
 * logo, colours and menu around the very same `ResumeEditor` the personal app mounts. This page is a thin wrapper: the data comes from the shared
 * `loadEditorData`, the BFF routes the editor calls are the ordinary tenant-aware `/api/resumes/**`, and the plain-data spec only says where the
 * organization's list and editor live (the env itself, with its `editorHref` function, is built on the client: a function cannot cross from a server component). What the session may do (no sharing, no delete, no AI, the license's cap) comes from the API's capabilities.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: await editorTitle(id), robots: { index: false, follow: false } };
}

export default async function ConsultantResumeEditorRoute({ params }: { params: Promise<{ id: string }> }) {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!me.workspaces.some((w) => w.key === "consultant")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  const { id } = await params;

  const data = await loadEditorData(id);
  if (data.kind === "notFound") notFound();
  if (data.kind === "signin") redirect("/login");
  if (data.kind === "error") throw new Error(`Couldn't load the resume (${data.status}).`);

  return (
    <BuilderEnvFromSpec spec={{ mode: "consultant", orgId: me.org.id }}>
      <div data-builder-frame className="flex min-h-0 flex-1 flex-col overflow-hidden bg-v2-canvas">
        <ResumeEditor
          initial={data.initial}
          plan={data.plan}
          config={data.config}
          aiUsageLine={data.aiUsageLine}
          profileUpdatedAt={data.profileUpdatedAt}
          initialMeta={data.initialMeta}
          primaryResumeId={data.primaryResumeId}
          jobTarget={null}
        />
      </div>
    </BuilderEnvFromSpec>
  );
}
