import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import AiProvidersPage from "@/components/admin-v3/ai/AiProvidersPage";
import type { AiCallsView, AiConfig } from "@/lib/ai-admin";

export const metadata: Metadata = {
  title: "AI providers · Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin AI providers & routing (I1.12). Server-side first paint from `GET /api/admin/ai/config` and the last day's
 * `/calls` summary; everything after that goes through the client component and the BFF. Non-admins never get here:
 * the `(admin)` layout 404s them, and Spring locks `/api/admin/**` to ROLE_ADMIN.
 */
export default async function AdminAiProvidersPage() {
  const [cfg, calls] = await Promise.all([
    serverApiFetch("/api/admin/ai/config").catch(() => null),
    serverApiFetch("/api/admin/ai/calls?hours=24&limit=100").catch(() => null),
  ]);
  const config = cfg?.ok ? ((await cfg.json().catch(() => null)) as AiConfig | null) : null;
  const recent = calls?.ok ? ((await calls.json().catch(() => null)) as AiCallsView | null) : null;
  return <AiProvidersPage config={config} calls={recent} />;
}
