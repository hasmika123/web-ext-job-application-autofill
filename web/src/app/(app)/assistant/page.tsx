import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import AssistantPage from "@/components/app-v3/assistant/AssistantPage";

export const metadata: Metadata = { title: "AI Assistant" };

type Account = { login?: string; email?: string; firstName?: string };

/** AI Assistant (APP-V3-SPEC 2.5). The only server work is the real first name for the greeting. */
export default async function Page() {
  const res = await serverApiFetch("/api/account").catch(() => null);
  const account: Account | null = res?.ok ? await res.json().catch(() => null) : null;
  const firstName = account?.firstName || account?.login || account?.email?.split("@")[0] || "there";
  return <AssistantPage firstName={firstName} />;
}
