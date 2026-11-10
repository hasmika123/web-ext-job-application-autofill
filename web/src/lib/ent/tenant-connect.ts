import { requestExtensionConnectLink } from "@/lib/ent/connect-extension";

/**
 * Connect the extension from the organization's own host (`/connect` on the tenant host), so a white-label build never shows the platform.
 *
 * The page gets a one-time code for the signed-in account (the same BFF the dialog used, `/api/extension/connect-code`). Then:
 *   - Chrome exposes `chrome.runtime.sendMessage` to a page only when an installed extension lists that page in `externally_connectable`.
 *     The organization-branded build lists its organization's host, so the page exchanges the code here (`/api/extension/token`) and hands
 *     the session over directly. The extension checks the sender's host against its own list before it accepts.
 *   - Otherwise (the standard extension, which lists only the platform hosts) the code goes on to the platform connect page, as before.
 */
export type TenantConnectResult =
  | { status: "connected" }
  | { status: "forwarded" }
  | { status: "no-extension"; message: string }
  | { status: "error"; message: string };

type Runtime = { sendMessage?: (extId: string, msg: unknown, cb?: (resp: unknown) => void) => void; lastError?: { message?: string } } | null | undefined;

export async function connectFromTenant(opts: { runtime: Runtime; extId: string; forward: (url: string) => void; fetchImpl?: typeof fetch }): Promise<TenantConnectResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const link = await requestExtensionConnectLink(fetchImpl);
  if (!link.ok) return { status: "error", message: link.message };
  const runtime = opts.runtime;
  if (!runtime || typeof runtime.sendMessage !== "function") {
    opts.forward(link.url);
    return { status: "forwarded" };
  }
  let code: string | null = null;
  try {
    code = new URL(link.url, "http://x").searchParams.get("code");
  } catch {
    code = null;
  }
  if (!code) return { status: "error", message: "Couldn't start the connection. Try again." };
  let tokens: unknown;
  try {
    const res = await fetchImpl("/api/extension/token", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return { status: "error", message: res.status === 429 ? "Too many tries. Wait a moment, then try again." : "Couldn't create an extension session. Try again." };
    tokens = await res.json();
  } catch {
    return { status: "error", message: "Couldn't reach the server. Try again." };
  }
  return new Promise((resolve) => {
    // called on `runtime` itself: Chrome's sendMessage throws "Illegal invocation" when detached from chrome.runtime
    runtime.sendMessage!(opts.extId, { type: "KIWIPLY_CONNECT", tokens }, (resp) => {
      const err = runtime.lastError;
      if (err) return resolve({ status: "no-extension", message: err.message || "The extension didn't answer." });
      if (resp && typeof resp === "object" && (resp as { ok?: unknown }).ok === false) {
        const reason = (resp as { reason?: unknown }).reason;
        return resolve({ status: "error", message: typeof reason === "string" && reason ? reason : "The extension refused the session." });
      }
      resolve({ status: "connected" });
    });
  });
}
