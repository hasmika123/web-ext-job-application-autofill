import { redirect } from "next/navigation";

/**
 * The board became "My Applications" in app v2. The old route keeps resolving so the extension's and
 * emails' links still work; a notification's `?app=<id>` is carried over.
 */
export default async function BoardRedirect({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const { app } = await searchParams;
  redirect(app && /^\d+$/.test(app) ? `/applications?app=${app}` : "/applications");
}
