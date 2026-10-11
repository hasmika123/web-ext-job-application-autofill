import { redirectLegacy } from "@/lib/legacy-redirect";

/** AI Apply is folded into the Job Search hero + AI Assistant (app v3). `?job=` opens that job's panel. */
export default async function AiApplyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirectLegacy("/jobs", await searchParams, ["job", "q"]);
}
