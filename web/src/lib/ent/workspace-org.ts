import { serverApiFetch } from "@/lib/api";

/**
 * Which organization does this tenant session administer? (X2.18, temporary). The public tenant DTO names no org id and the
 * tenant session (`GET /api/me/tenant`, X2.2) does not exist yet, so the Branding route asks `GET /api/orgs/mine` and takes the
 * organization the visitor owns or administers (else their first). X2.2 / X2.6 replace this with the active org of the
 * tenant session; nothing else in the page depends on it.
 */
export type WorkspaceOrg = { kind: "ok"; orgId: number; role: string } | { kind: "signed-out" } | { kind: "none" } | { kind: "error" };

export async function resolveWorkspaceOrg(): Promise<WorkspaceOrg> {
  let res: Response;
  try {
    res = await serverApiFetch("/api/orgs/mine");
  } catch {
    return { kind: "error" };
  }
  if (res.status === 401) return { kind: "signed-out" };
  if (!res.ok) return { kind: "error" };
  const list = (await res.json().catch(() => null)) as { orgId: number; role: string }[] | null;
  if (!Array.isArray(list) || list.length === 0) return { kind: "none" };
  const pick = list.find((o) => o.role === "OWNER" || o.role === "ADMIN") ?? list[0];
  return { kind: "ok", orgId: pick.orgId, role: pick.role };
}
