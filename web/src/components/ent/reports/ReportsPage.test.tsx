// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "./ReportsPage";
import { overviewFixture } from "@/lib/ent/reports.fixture";
import type { Overview } from "@/lib/ent/reports";

let urls: string[];
let reply: (url: string) => { status: number; body: unknown };

beforeEach(() => {
  urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const r = reply(url);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = async () => {
  render(<ReportsPage orgId={2} orgName="Acme" />);
  await act(async () => {
    await Promise.resolve();
  });
};

const emptyOverview = (): Overview =>
  overviewFixture({
    tiles: [],
    roster: { total: 0, byMarketingStatus: [], byAvailability: [] },
    funnel: { total: 0, thisWeek: 0, lastWeek: 0, deltaPct: null, stages: [], weekly: [] },
    interviews: { scheduled: 0, completed: 0, cancelled: 0, awaitingOutcome: 0, upcoming14Days: 0, weekly: [] },
    placements: { active: 0, startedInRange: 0, endedInRange: 0, months: [] },
    topClients: [],
    marketers: [],
    firstSubmission: { medianHours: null, sample: 0 },
  });

describe("the Reports page", () => {
  it("draws the tiles, the report cards and the tables from the API's numbers", async () => {
    reply = () => ({ status: 200, body: overviewFixture() });
    await mount();
    await waitFor(() => expect(document.querySelector("[data-reports-tiles]")).toBeTruthy());
    expect(urls[0]).toBe("/api/orgs/2/reports/overview?range=30");
    expect(within(document.querySelector('[data-report-tile="consultants"]') as HTMLElement).getByText("153")).toBeTruthy();
    expect(within(document.querySelector('[data-report-tile="applications"]') as HTMLElement).getByText(/\+20% vs the 30 days before/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Applications by stage/ })).toBeTruthy();
    expect(screen.getByText("Omar Aziz")).toBeTruthy();
    expect(screen.getByText("Globex, Inc")).toBeTruthy();
    expect(document.querySelector("[data-first-submission]")?.textContent).toBe("30 hours");
    expect(document.querySelector("[data-funnel-wow]")?.textContent).toContain("12 in the last 7 days, 10 the 7 days before (+20%)");
  });

  it("switching the range asks the API again for that range", async () => {
    reply = () => ({ status: 200, body: overviewFixture() });
    await mount();
    await waitFor(() => expect(document.querySelector("[data-reports-tiles]")).toBeTruthy());
    fireEvent.click(document.querySelector('[data-range="90"]') as HTMLElement);
    await waitFor(() => expect(urls).toContain("/api/orgs/2/reports/overview?range=90"));
    expect(document.querySelector('[data-range="90"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("an organization with nothing yet sees an honest empty state and no download", async () => {
    reply = () => ({ status: 200, body: emptyOverview() });
    await mount();
    await waitFor(() => expect(screen.getByText("Nothing to report yet")).toBeTruthy());
    expect(document.querySelector("[data-reports-tiles]")).toBeNull();
    expect((document.querySelector("[data-reports-csv]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a card with no rows says so instead of drawing an empty chart", async () => {
    reply = () => ({ status: 200, body: overviewFixture({ topClients: [], marketers: [] }) });
    await mount();
    await waitFor(() => expect(screen.getByText("No running placements yet.")).toBeTruthy());
    expect(screen.getByText("No marketer has consultants or open opportunities yet.")).toBeTruthy();
  });

  it("Download CSV hands the browser a CSV with the formula-safe cells", async () => {
    reply = () => ({ status: 200, body: overviewFixture() });
    let blob: Blob | null = null;
    vi.stubGlobal("URL", { createObjectURL: (b: Blob) => ((blob = b), "blob:x"), revokeObjectURL: () => undefined });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await mount();
    await waitFor(() => expect(document.querySelector("[data-reports-tiles]")).toBeTruthy());
    fireEvent.click(document.querySelector("[data-reports-csv]") as HTMLElement);
    expect(blob).toBeTruthy();
    expect(clicked).toHaveBeenCalledTimes(1);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob as unknown as Blob);
    });
    clicked.mockRestore();
    expect(text).toContain("Omar Aziz,12,9");
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")",4`);
  });

  it("a refused call shows the role message, a failed one shows a retry", async () => {
    reply = () => ({ status: 404, body: { error: "Not found." } });
    await mount();
    await waitFor(() => expect(screen.getByText(/isn't part of your role/i)).toBeTruthy());
    cleanup();
    reply = () => ({ status: 500, body: {} });
    await mount();
    await waitFor(() => expect(screen.getByRole("button", { name: /try again|retry/i })).toBeTruthy());
  });
});
