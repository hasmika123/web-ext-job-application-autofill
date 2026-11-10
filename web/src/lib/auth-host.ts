import { headers } from "next/headers";
import { authHostHeader } from "@/lib/tenant-host";

/** Headers for a server-side call to an API auth endpoint (login, MFA, Google, refresh, logout): the tenant host, when there is one. */
export async function authHostHeaders(): Promise<Record<string, string>> {
  try {
    return authHostHeader(await headers());
  } catch {
    return {}; // outside a request scope
  }
}

/** The API's refusal for someone who signed in correctly on an organization's host but holds no active seat there. */
export const NOT_A_MEMBER_MESSAGE = "You're not a member of this workspace.";

export async function isNotAMember(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    return ((await res.clone().json()) as { code?: string }).code === "NOT_A_MEMBER";
  } catch {
    return false;
  }
}
