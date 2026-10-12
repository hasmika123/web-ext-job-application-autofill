import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import { samples, type SampleName } from "./samples";
import { SamplesProvider } from "./SamplesProvider";
import * as S from "./sample-data";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <span role="img" aria-label={p.alt} /> }));
// Server-only art helpers and the shared v2 hero draw images; they are not under test here.
vi.mock("@/components/app-v2/common", async (orig) => {
  const real = await orig<typeof import("@/components/app-v2/common")>();
  return { ...real, HeroBand: ({ title }: { title: ReactNode }) => <header>{title}</header>, AppArt: () => null };
});

import AlertsPage from "./alerts/AlertsPage";
import AnalyticsPage from "./analytics/AnalyticsPage";
import AssistantPage from "./assistant/AssistantPage";
import DashboardPage from "./home/DashboardPage";
import ExplorePage from "./explore/ExplorePage";
import InterviewPrepPage from "./interview-prep/InterviewPrepPage";
import JobsPage from "./jobs/JobsPage";
import MessagesPage from "./messages/MessagesPage";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

/** What each registered sample is when the gate is closed: a list is `[]`, anything else `null`. */
describe("samples()", () => {
  const registered = [
    "DASH_STATS",
    "DASH_ACTIVITY_PERIODS",
    "V3_JOBS",
    "JOBS_SAMPLE_TOTAL",
    "ALERTS",
    "CONVERSATIONS",
    "MESSAGES_NOTE",
    "AN_SAMPLE",
    "V3_PROFILE_FALLBACK",
    "ASSISTANT_CANNED_REPLY",
  ] as const satisfies readonly SampleName[];

  it("closed: nothing comes back, for every sample checked", () => {
    for (const name of registered) {
      const v = samples(name, false) as unknown;
      expect(Array.isArray(v) ? v.length === 0 : v === null).toBe(true);
    }
    expect(samples("ALERTS", false)).toEqual([]);
    expect(samples("AN_SAMPLE", false)).toBeNull();
    expect(samples("JOBS_SAMPLE_TOTAL", false)).toBeNull();
    expect(samples("MESSAGES_NOTE", false)).toBeNull();
  });

  it("open: the constant itself", () => {
    expect(samples("ALERTS", true)).toBe(S.ALERTS);
    expect(samples("AN_SAMPLE", true)).toBe(S.AN_SAMPLE);
    expect(samples("JOBS_SAMPLE_TOTAL", true)).toBe(S.JOBS_SAMPLE_TOTAL);
  });
});

function view(node: ReactNode, login: string | null) {
  return render(
    <ToastProvider>
      <SamplesProvider login={login}>{node}</SamplesProvider>
    </ToastProvider>,
  );
}

const emptyState = (c: HTMLElement) => c.querySelector("[data-empty-state]");

/** A page, the heading text that proves its sample content, and how to mount it. */
const PAGES: { name: string; node: () => ReactNode; sampleText: string | RegExp }[] = [
  { name: "Alerts", node: () => <AlertsPage />, sampleText: /Frontend Developer/ },
  { name: "Messages", node: () => <MessagesPage />, sampleText: S.CONVERSATIONS[0].name },
  { name: "Explore", node: () => <ExplorePage />, sampleText: /Popular Companies/ },
  { name: "Interview prep", node: () => <InterviewPrepPage />, sampleText: /Common Question Sets/ },
  { name: "Assistant", node: () => <AssistantPage firstName="Jo" />, sampleText: /Recent chats/ },
  { name: "Jobs", node: () => <JobsPage realJobs={null} />, sampleText: /jobs found/ },
  { name: "Analytics", node: () => <AnalyticsPage data={null} />, sampleText: /Conversion funnel|Applications over time/ },
];

describe("pages for a real account (gate closed): an honest empty state, no sample row", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_BOARD_SAMPLES", "1"));

  for (const p of PAGES) {
    it(`${p.name}: EmptyState, not the sample content (even on a sample-enabled build)`, () => {
      const { container } = view(p.node(), "priya.real");
      expect(emptyState(container)).not.toBeNull();
      expect(screen.queryByText(p.sampleText, { exact: false })).toBeNull();
    });
  }

  it("a demo account on a build that did not opt in is closed too", () => {
    vi.stubEnv("NEXT_PUBLIC_BOARD_SAMPLES", "");
    const { container } = view(<AlertsPage />, "demo");
    expect(emptyState(container)).not.toBeNull();
  });
});

describe("pages for a demo account on a sample-enabled build keep the board look", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_BOARD_SAMPLES", "1"));

  for (const p of PAGES.filter((x) => x.name !== "Analytics")) {
    it(`${p.name}: sample content, no page-level empty state`, () => {
      const { container } = view(p.node(), "demo");
      expect(screen.getAllByText(p.sampleText, { exact: false }).length).toBeGreaterThan(0);
      expect(container.querySelector("[data-empty-state='page']")).toBeNull();
    });
  }
});

describe("the dashboard for a new account", () => {
  it("shows zeros and honest empty cards, never a fake row", () => {
    const { container } = view(
      <DashboardPage
        firstName="Jo"
        stats={[
          { id: "applications", value: "0", label: "Applications", note: "None this week", tone: "blue" },
          { id: "interviews", value: "0", label: "Interviews", note: "keep going", tone: "green" },
          { id: "offers", value: "0", label: "Offers", note: "keep going", tone: "violet" },
          { id: "saved", value: "0", label: "Saved Jobs", note: "save some jobs", tone: "amber" },
        ]}
        activity={{ "Last 30 days": [] }}
        status={[]}
        total={0}
        recent={[]}
        recommended={[]}
        insights={[]}
        interviews={[]}
        alerts={[]}
        profile={{ pct: 0, checks: [{ id: "resume", label: "Resume uploaded", done: false }] }}
      />,
      "priya.real",
    );
    // activity, status, insights, recent, recommended, interviews, alerts
    expect(container.querySelectorAll("[data-empty-state='inline']").length).toBe(7);
    expect(screen.queryByText("Google")).toBeNull();
    expect(screen.getByText("0%")).toBeTruthy();
  });
});
