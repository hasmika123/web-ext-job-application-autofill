import { redirectLegacy } from "@/lib/legacy-redirect";

/** AI Tools became the AI Assistant (app v3). */
export default async function AiToolsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirectLegacy("/assistant", await searchParams, ["q"]);
}
