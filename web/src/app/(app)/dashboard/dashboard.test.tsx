import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import type { OnboardingStatus } from "@/lib/onboarding/api";

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
let config = DEFAULT_BUILDER_CONFIG;
// `GET /api/profile/onboarding` (R1.9): the server decides whether the card shows and how far along the person is.
const notStarted = (card: Partial<OnboardingStatus["card"]> = {}): OnboardingStatus => ({
  status: "NONE",
  persona: null,
  finishedAt: null,
  draft: null,
  card: { dismissedAt: null, snoozedUntil: null, resurfaceCount: 0, show: true, state: "NOT_STARTED", resurfaced: false, ...card },
  completeness: { score, promptBelow: 40, resurfaceBelow: 20 },
});
let onboarding: OnboardingStatus | null = notStarted();
vi.mock("@/lib/onboarding/server", () => ({ getOnboardingStatus: async () => onboarding }));
vi.mock("@/lib/resume-builder-config", () => ({ getBuilderConfig: async () => config }));
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
  config = DEFAULT_BUILDER_CONFIG;
  onboarding = notStarted();
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

  it("never redirects to /welcome: a full onboarded bio simply has no card when the server says so", async () => {
    score = DEFAULT_BUILDER_CONFIG.profile.setupPromptBelowPercent;
    onboarding = { ...notStarted({ show: false }), status: "FINISHED", finishedAt: "2026-01-01T00:00:00Z" };
    api(json({ payload: JSON.stringify({ onboardedAt: "2026-01-01T00:00:00Z", authorizedToWork: "Yes" }) }));
    await open();
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Set up your profile" })).toBeNull();
  });
});

describe("Dashboard card reads the server (R1.9)", () => {
  it("an unfinished draft resumes as `n of total done`, from whichever device wrote it", async () => {
    onboarding = { ...notStarted({ state: "IN_PROGRESS" }), status: "DRAFT", draft: { step: "skills", stepsDone: 3, stepsTotal: 7, updatedAt: "2026-10-12T10:00:00Z" } };
    api(json({ payload: "{}" }));
    await open();
    expect(screen.getByRole("heading", { name: "Finish your profile" })).toBeTruthy();
    expect(screen.getByText(/3 of 7 done/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Continue/ }).getAttribute("href")).toBe("/profiles/setup?entry=card");
  });

  it("no card when the status could not be loaded", async () => {
    onboarding = null;
    api(json({ payload: "{}" }));
    await open();
    expect(screen.queryByRole("region", { name: "Set up your profile" })).toBeNull();
  });

  it("no card when the server says to hide it, whatever the bio holds", async () => {
    onboarding = notStarted({ show: false, snoozedUntil: "2099-01-01T00:00:00Z" });
    api(json({ payload: "{}" }));
    await open();
    expect(screen.queryByRole("region", { name: "Set up your profile" })).toBeNull();
  });
});

describe("Dashboard card and the onboarding config (R1.8)", () => {
  it("shows the card's estimate from config.onboarding.estimateMinutes", async () => {
    config = { ...DEFAULT_BUILDER_CONFIG, onboarding: { ...DEFAULT_BUILDER_CONFIG.onboarding, estimateMinutes: 5 } };
    api(json({ payload: "{}" }));
    await open();
    expect(screen.getByText(/About 5 minutes/)).toBeTruthy();
  });

  it("feature.onboarding_v2.enabled = false hides the card", async () => {
    config = { ...DEFAULT_BUILDER_CONFIG, onboarding: { ...DEFAULT_BUILDER_CONFIG.onboarding, enabled: false } };
    api(json({ payload: "{}" }));
    await open();
    expect(screen.queryByRole("region", { name: "Set up your profile" })).toBeNull();
  });

  it("an API without the onboarding group falls back to the declared defaults", async () => {
    const older: Partial<typeof DEFAULT_BUILDER_CONFIG> = { ...DEFAULT_BUILDER_CONFIG };
    delete older.onboarding;
    config = older as typeof DEFAULT_BUILDER_CONFIG;
    api(json({ payload: "{}" }));
    await open();
    expect(screen.getByRole("heading", { name: "Let's get you job-ready" })).toBeTruthy();
  });
});
