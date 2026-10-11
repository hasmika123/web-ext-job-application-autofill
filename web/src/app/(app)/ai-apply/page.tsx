import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import AiApplyPage from "@/components/app-v2/ai-apply/AiApplyPage";

export const metadata: Metadata = { title: "AI Apply" };

type ResumeLite = { label?: string | null; defaultResume?: boolean | null; archived?: boolean | null };

/**
 * AI Apply (board app-ai-apply-find / app-ai-apply-campaigns). Everything is sample content
 * except the "Default Resume" setting, which shows the account's real default resume label.
 */
export default async function Page() {
  let defaultResumeLabel: string | undefined;
  const res = await serverApiFetch("/api/profile/resumes");
  if (res.ok) {
    const resumes = ((await res.json().catch(() => [])) as ResumeLite[]) ?? [];
    const live = resumes.filter((r) => !r.archived);
    defaultResumeLabel = (live.find((r) => r.defaultResume) ?? live[0])?.label ?? undefined;
  }
  return <AiApplyPage defaultResumeLabel={defaultResumeLabel} />;
}
