import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <span role="img" aria-label={p.alt} /> }));
vi.mock("@/components/app-v2/common", async (orig) => {
  const real = await orig<typeof import("@/components/app-v2/common")>();
  return { ...real, HeroBand: ({ title }: { title: ReactNode }) => <header>{title}</header> };
});

import DashboardPage, { type DashboardProps } from "./DashboardPage";
import { computeDashboard, computeProfile } from "./compute";
import type { Interview } from "@/lib/interviews";

const HOUR = 3_600_000; // config-literal-ok: test fixture
const DAY = 24 * HOUR; // config-literal-ok: test fixture
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let activity: unknown;
let interviews: Interview[];
const urls: string[] = [];

beforeEach(() => {
  urls.length = 0;
  activity = Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.UTC(2026, 8, 13 + i)).toISOString().slice(0, 10), count: 0 }));
  interviews = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.startsWith("/api/applications/activity")) return json(activity);
      if (url.startsWith("/api/interviews")) return json(interviews);
      if (url.includes("/outcome")) return json({});
      return json({}, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function props(summary: Record<string, number> | undefined, recent = [] as Parameters<typeof computeDashboard>[1]): DashboardProps {
  const n = computeDashboard(summary, recent);
  return { firstName: "Jo", stats: n.stats, status: n.status, total: n.total, recent: n.recent, recommended: [], profile: computeProfile(null, 0) };
}
const mount = (p: DashboardProps) =>
  render(
    <ToastProvider>
      <DashboardPage {...p} />
    </ToastProvider>,
  );
const inline = (c: HTMLElement) => c.querySelectorAll("[data-empty-state='inline']");

const SEEDED = { ALL: 8, DRAFT: 1, SAVED: 2, APPLIED: 2, IN_REVIEW: 0, INTERVIEW: 1, OFFER: 1, REJECTED: 1, GHOSTED: 0, ARCHIVED: 0 };

describe("Dashboard: a new account (no data)", () => {
  it("shows zeros and honest empty cards with a next step each, never a fake row", async () => {
    const { container } = mount(props({ ALL: 0, SAVED: 0 }));
    await waitFor(() => expect(inline(container).length).toBe(6)); // activity, status, recent, recommended, interviews, alerts
    const tiles = screen.getAllByText(/^(Applications|Interviews|Offers|Saved Jobs)$/).map((l) => l.previousElementSibling?.textContent);
    expect(tiles).toEqual(["0", "0", "0", "0"]);
    expect(screen.getByText("Send your first one")).toBeTruthy();
    expect(screen.queryByText("Google")).toBeNull();
    expect(screen.queryByText(/AI Insights/)).toBeNull();
    expect(screen.getByRole("link", { name: "Create your first alert" }).getAttribute("href")).toBe("/alerts");
    expect(screen.getByRole("link", { name: "Open your applications" }).getAttribute("href")).toBe("/applications");
    expect(screen.getByText("0%")).toBeTruthy();
  });

  it("asks for the activity feed in the browser's own zone", async () => {
    mount(props(undefined));
    await waitFor(() => expect(urls.some((u) => u.startsWith("GET /api/applications/activity?days=30"))).toBe(true));
    expect(urls.find((u) => u.includes("activity"))).toMatch(/tz=/);
  });
});

describe("Dashboard: an account with applications", () => {
  const recent = [
    { id: 4, company: "Linear", roleTitle: "Product Designer", status: "OFFER", appliedAt: "2026-09-30T12:00:00Z" },
    { id: 1, company: "Stripe", roleTitle: "Senior Product Designer", status: "INTERVIEW", appliedAt: "2026-10-09T12:00:00Z" },
  ];

  it("the tiles, the donut and the recent list are the account's own", async () => {
    activity = Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.UTC(2026, 8, 13 + i)).toISOString().slice(0, 10), count: i % 3 === 0 ? 2 : 0 }));
    mount(props(SEEDED, recent as never));
    const tiles = screen.getAllByText(/^(Applications|Interviews|Offers|Saved Jobs)$/).map((l) => l.previousElementSibling?.textContent);
    expect(tiles).toEqual(["5", "1", "1", "2"]);
    expect(screen.getByRole("img", { name: /5 Total/ })).toBeTruthy();
    const list = screen.getByRole("link", { name: /Stripe/ });
    expect(list.getAttribute("href")).toBe("/applications?app=1");
    expect(within(list).getByText("Interview")).toBeTruthy();
    // the activity bars arrive from the feed
    await waitFor(() => expect(screen.getAllByRole("group").length).toBeGreaterThan(0));
    expect(screen.queryByText("No activity yet")).toBeNull();
  });

  it("a quiet period says so (it is not 'no activity yet')", async () => {
    mount(props(SEEDED, recent as never));
    expect(await screen.findByText("A quiet stretch")).toBeTruthy();
  });

  it("the period select asks again for that many days", async () => {
    mount(props(SEEDED, recent as never));
    await screen.findByText("A quiet stretch");
    fireEvent.click(screen.getByRole("button", { name: /Period/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Last 7 days" }));
    await waitFor(() => expect(urls.some((u) => u.startsWith("GET /api/applications/activity?days=7"))).toBe(true));
  });

  it("upcoming interviews come from the feed; an over interview with no result asks 'How did it go?'", async () => {
    interviews = [
      { id: 5, applicationId: 1, company: "Stripe", roleTitle: "Designer", kind: "VIDEO", startsAt: iso(2 * DAY), endsAt: null, tz: "UTC", location: null, interviewer: null, notes: null, outcome: "PENDING", source: "WEB", createdAt: iso(-DAY), updatedAt: iso(-DAY) },
      { id: 6, applicationId: 4, company: "Linear", roleTitle: "Designer", kind: "ONSITE", startsAt: iso(-2 * DAY), endsAt: null, tz: "UTC", location: null, interviewer: null, notes: null, outcome: "PENDING", source: "WEB", createdAt: iso(-5 * DAY), updatedAt: iso(-5 * DAY) },
    ];
    const { container } = mount(props(SEEDED, recent as never));
    expect(await screen.findByText("How did it go with Linear?")).toBeTruthy();
    expect(screen.getByText(/^Video call · /)).toBeTruthy();
    expect(container.querySelector("[data-interview-ask='6']")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Went well" }));
    await waitFor(() => expect(urls).toContain("POST /api/applications/4/interviews/6/outcome"));
    await waitFor(() => expect(screen.queryByText("How did it go with Linear?")).toBeNull());
  });

  it("an interview feed that fails is an error with Retry, not an invented empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("/api/applications/activity") ? json(activity) : json({ message: "down" }, 500))));
    mount(props(SEEDED, recent as never));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
