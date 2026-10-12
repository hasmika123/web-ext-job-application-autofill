import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";

const redirect = vi.fn((to: string): never => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const serverApiFetch = vi.fn<(path: string) => Promise<Response>>();
vi.mock("@/lib/api", () => ({ serverApiFetch: (p: string) => serverApiFetch(p) }));
vi.mock("@/components/app-v2/jobs/data", () => ({ loadJobs: async () => ({ real: false, jobs: [] }) }));
let score = 0;
vi.mock("@/lib/profile-items-server", () => ({ getCompleteness: async () => ({ score, parts: {}, nextAction: null }) }));
vi.mock("@/lib/resume-builder-config", () => ({ getBuilderConfig: async () => DEFAULT_BUILDER_CONFIG }));
// The page shell and the fs-backed mascot are not under test here.
vi.mock("@/components/app-v3/home/DashboardPage", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/marketing/media", () => ({ Mascot: ({ pose }: { pose: string }) => <span data-pose={pose} /> }));
vi.mock("@/components/SuggestionsCard", () => ({ default: () => null }));

import Page from "./page";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function api(profile: Response) {
  serverApiFetch.mockImplementation(async (path) => {
    if (path === "/api/profile") return profile;
    if (path === "/api/account") return json({ login: "jo", firstName: "Jo" });
    return json([]);
  });
}

beforeEach(() => {
  redirect.mockClear();
  score = 0;
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

async function open() {
  render(<ToastProvider>{await Page()}</ToastProvider>);
}

describe("Dashboard", () => {
  it("never redirects to /welcome: empty bio shows the job-ready card", async () => {
    api(json({ payload: "{}" }));
    await open();
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Let's get you job-ready" })).toBeTruthy();
  });

  it("never redirects to /welcome: a 404 bio (brand-new account) shows the card", async () => {
    api(new Response("{}", { status: 404 }));
    await open();
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Let's get you job-ready" })).toBeTruthy();
  });

  it("never redirects to /welcome: a full onboarded bio simply has no card at a healthy score", async () => {
    score = DEFAULT_BUILDER_CONFIG.profile.setupPromptBelowPercent;
    api(json({ payload: JSON.stringify({ onboardedAt: "2026-01-01T00:00:00Z", authorizedToWork: "Yes" }) }));
    await open();
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Set up your profile" })).toBeNull();
  });
});
