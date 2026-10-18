import type { Metadata } from "next";
import ConsultantResumesPage, { type ConsultantBuilderData } from "@/components/ent/consultant-ws/ResumesPage";
import { summarizeProfile } from "@/components/app-v3/resume-builder/new-resume/model";
import { NotYourRole } from "@/components/ent/shell/ShellStates";
import { ErrorState } from "@kiwiply/ui";
import { serverApiFetch } from "@/lib/api";
import { getBuilderConfig } from "@/lib/resume-builder-config";
import { getCompleteness, getProfileItems } from "@/lib/profile-items-server";
import { getTenantSession } from "@/lib/ent/tenant-session";

/**
 * Consultant My Resumes at `/w/consultant/resumes` (design/enterprise-consultant/resumes.webp), inside the EnterpriseShell via the
 * sibling `layout.tsx`. The API is the gate (404 for anyone who is not a consultant of this organization); a member whose menu does
 * not list the workspace gets "This isn't part of your role". The new-resume chooser reads the SAME builder data the personal app does (profile counts, the
 * template default, the cap: here the organization license's) on the server, so creating a resume needs no second implementation.
 */
export const metadata: Metadata = { title: "My Resumes", robots: { index: false, follow: false } };

/** The consultant's headline (the default name of a resume made from the profile), or null. Never throws. */
async function profileHeadline(): Promise<string | null> {
  try {
    const res = await serverApiFetch("/api/profile");
    if (!res.ok) return null;
    const dto = (await res.json()) as { payload?: string };
    const bio = dto.payload ? (JSON.parse(dto.payload) as Record<string, unknown>) : {};
    const h = typeof bio.headline === "string" ? bio.headline : typeof bio.currentTitle === "string" ? bio.currentTitle : null;
    return h && h.trim() ? h.trim() : null;
  } catch {
    return null;
  }
}

async function builderData(): Promise<ConsultantBuilderData> {
  const [config, items, completeness, headline] = await Promise.all([getBuilderConfig(), getProfileItems(), getCompleteness(), profileHeadline()]);
  const profile = summarizeProfile(items ?? [], completeness, headline);
  return {
    profile,
    defaultTemplateId: config.templates.default,
    cap: { count: config.resumes.count, max: config.resumes.max },
    targetSuggestions: headline ? [headline] : [],
  };
}

export default async function ConsultantResumesRoute() {
  const session = await getTenantSession();
  if (session.kind !== "OK") return null; // the workspace layout already showed the matching panel
  const { me } = session;
  if (!me.workspaces.some((w) => w.key === "consultant")) return <NotYourRole />;
  if (!me.org.id) return <ErrorState what="your organization" description="Please refresh in a moment." />;
  return <ConsultantResumesPage orgId={me.org.id} firstName={me.person.name} builder={await builderData()} />;
}
