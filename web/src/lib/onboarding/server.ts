/**
 * Server-side reader for the onboarding status (Server Components only: it reads the session cookie through
 * `serverApiFetch`). Never throws: null means "could not load", and the page copes (the dashboard card stays
 * hidden, the setup flow opens from its local mirror). The browser-side helpers are in `api.ts`.
 */
import { serverApiFetch } from "@/lib/api";
import type { OnboardingStatus } from "./api";

export async function getOnboardingStatus(includeState = false): Promise<OnboardingStatus | null> {
  try {
    const res = await serverApiFetch(`/api/profile/onboarding${includeState ? "?include=state" : ""}`);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as OnboardingStatus) : null;
  } catch {
    return null;
  }
}
