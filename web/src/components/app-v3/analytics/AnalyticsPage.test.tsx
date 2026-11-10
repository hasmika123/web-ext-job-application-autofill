import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <span role="img" aria-label={p.alt} /> }));
vi.mock("@/components/app-v2/common", async (orig) => {
  const real = await orig<typeof import("@/components/app-v2/common")>();
  return { ...real, HeroBand: ({ title }: { title: ReactNode }) => <header>{title}</header> };
});

import AnalyticsPage from "./AnalyticsPage";
import type { Analytics } from "@/lib/job-analytics";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const EMPTY: Analytics = {
  range: 30,
  granularity: "week",
  real: false,
  stats: { applied: 0, appliedPrev: 0, replies: 0, interviews: 0, offers: 0, responseRate: null },
  overTime: [],
  byStatus: [],
  inboxSeen: false,
  responseByCompany: [],
};
const SEEDED: Analytics = {
  range: 30,
  granularity: "week",
  real: true,
  stats: { applied: 5, appliedPrev: 4, replies: 3, interviews: 2, offers: 1, responseRate: 60 },
  overTime: [
    { start: "2026-10-05", applied: 2, interviews: 1, offers: 0 },
    { start: "2026-10-12", applied: 3, interviews: 1, offers: 1 },
  ],
  byStatus: [
    { status: "APPLIED", label: "Applied", count: 2 },
    { status: "OFFER", label: "Offer", count: 1 },
  ],
  inboxSeen: true,
  responseByCompany: [{ company: "Lumen Health", applied: 1, replied: 1 }],
};

let body: (url: string) => Response;
const urls: string[] = [];

beforeEach(() => {
  urls.length = 0;
  body = () => json(SEEDED);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return body(url);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = () =>
  render(
    <ToastProvider>
      <AnalyticsPage />
    </ToastProvider>,
  );

describe("AnalyticsPage", () => {
  it("a brand-new account sees an honest empty state, never a chart or a sample number", async () => {
    body = () => json(EMPTY);
    const { container } = mount();
    expect(await screen.findByText("No analytics yet")).toBeTruthy();
    expect(container.querySelector("[data-empty-state]")).not.toBeNull();
    expect(screen.queryByText("Skills in demand")).toBeNull();
    expect(screen.queryByText(/Example numbers/)).toBeNull();
    expect(screen.getByRole("link", { name: "Find jobs" }).getAttribute("href")).toBe("/jobs");
  });

  it("a seeded account sees its own tiles, bars and status breakdown", async () => {
    mount();
    expect(await screen.findByText("Applications over time")).toBeTruthy();
    expect(screen.getAllByText("Applications").length).toBeGreaterThan(0);
    expect(screen.getByText("60% response rate")).toBeTruthy();
    expect(screen.getByText("Lumen Health")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Oct 12" })).toBeTruthy();
    expect(screen.queryByText("Skills in demand")).toBeNull();
  });

  it("the period select asks the server for that range in the browser's zone", async () => {
    mount();
    await screen.findByText("Applications over time");
    expect(urls[0]).toMatch(/^\/api\/analytics\?range=30/);
    fireEvent.click(screen.getByRole("button", { name: "Time period" }));
    fireEvent.click(await screen.findByRole("option", { name: "Last 90 days" }));
    await waitFor(() => expect(urls.some((u) => u.includes("range=90"))).toBe(true));
  });

  it("without an inbox reply the by-company card says how to get one instead of inventing bars", async () => {
    body = () => json({ ...SEEDED, inboxSeen: false, responseByCompany: [] });
    mount();
    expect(await screen.findByText("Connect your inbox")).toBeTruthy();
    expect(screen.queryByText("Lumen Health")).toBeNull();
  });

  it("a period with nothing in it says it is quiet", async () => {
    body = () => json({ ...SEEDED, overTime: [{ start: "2026-10-12", applied: 0, interviews: 0, offers: 0 }], byStatus: [] });
    mount();
    expect(await screen.findByText("A quiet stretch")).toBeTruthy();
  });

  it("a failed load is an error with Retry, not a blank page", async () => {
    body = () => json({ message: "boom" }, 500);
    mount();
    expect(await screen.findByText("Couldn't load your analytics")).toBeTruthy();
    body = () => json(SEEDED);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Applications over time")).toBeTruthy();
  });
});
