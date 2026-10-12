import type { Metadata } from "next";
import ApplicationsV3Page from "@/components/app-v3/applications/ApplicationsV3Page";
import { getPlan } from "@/lib/billing";

export const metadata: Metadata = { title: "My Applications" };

/**
 * My Applications (app v3, U6.3). The list itself is read in the browser through `useListQuery` (real paging, filters,
 * search and tab counts from the list v2 endpoint), so this page only knows two things: whether the plan includes
 * the Pro "resume fit" check, and which application `?app=<id>` asks to open (the board's old deep link, kept for
 * the extension's and emails' links).
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ app?: string | string[] }> }) {
  const { app } = await searchParams;
  const raw = Array.isArray(app) ? app[0] : app;
  const initialOpenId = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const plan = await getPlan();
  return <ApplicationsV3Page initialOpenId={initialOpenId} isPro={plan.plan === "PRO"} />;
}
