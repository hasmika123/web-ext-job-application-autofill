import { NextResponse } from "next/server";
import { serverApiFetch } from "@/lib/api";

/**
 * Tenant host, "Connect extension" (decision O4, docs/enterprise-v2/19 section 6.3). The signed-in enterprise account asks the API for a
 * one-time connect code (60 s, single use, bound to this account and organization); the API answers with the full `connectUrl` on the
 * platform host (the web never builds a link to another host itself). The browser opens it in a new tab; the platform `/connect` page
 * exchanges the code for the extension session. Only the URL goes back to the page: the code is not stored anywhere on this host.
 */
export async function POST() {
  const res = await serverApiFetch("/api/extension/connect-code", { method: "POST" });
  if (res.status === 401) return NextResponse.json({ error: "not-signed-in" }, { status: 401 });
  if (res.status === 429) return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429, headers: { "retry-after": res.headers.get("retry-after") ?? "60" } });
  if (!res.ok) return NextResponse.json({ error: "unavailable" }, { status: res.status === 404 ? 404 : 502 });
  const data = (await res.json().catch(() => null)) as { connectUrl?: unknown } | null;
  if (!data || typeof data.connectUrl !== "string" || !/^https?:\/\//.test(data.connectUrl)) return NextResponse.json({ error: "malformed" }, { status: 502 });
  return NextResponse.json({ connectUrl: data.connectUrl });
}
