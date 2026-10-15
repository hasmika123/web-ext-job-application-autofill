/**
 * "Connect extension" in the tenant shell (decision O4, docs/enterprise-v2/19 section 6.3). An enterprise account's session lives on its tenant
 * host, which the extension cannot list in `externally_connectable`; so the host asks the API for a one-time code, and the platform `/connect`
 * page turns it into the extension session. This helper only asks for the link (same-origin BFF `/api/extension/connect-code`).
 */
export type ConnectLink = { ok: true; url: string } | { ok: false; message: string };

export async function requestExtensionConnectLink(fetchImpl: typeof fetch = fetch): Promise<ConnectLink> {
  try {
    const res = await fetchImpl("/api/extension/connect-code", { method: "POST", credentials: "same-origin", cache: "no-store" });
    if (res.status === 429) return { ok: false, message: "Too many tries. Wait a moment, then try again." };
    if (res.status === 401) return { ok: false, message: "Your session ended. Sign in again, then connect the extension." };
    if (!res.ok) return { ok: false, message: "Couldn't start the connection. Try again." };
    const data = (await res.json().catch(() => null)) as { connectUrl?: unknown } | null;
    if (!data || typeof data.connectUrl !== "string") return { ok: false, message: "Couldn't start the connection. Try again." };
    return { ok: true, url: data.connectUrl };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Try again." };
  }
}
