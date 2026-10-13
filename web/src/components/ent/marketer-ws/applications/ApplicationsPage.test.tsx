// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/applications" }));

import ApplicationsPage from "./ApplicationsPage";

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3600e3;
const c = (id: number, name: string, consent = "FULL") => ({ id, name, avatarUrl: null, consent });
const owner = (id: number, name: string) => ({ id, name, avatarUrl: null });
const row = (id: number, who: ReturnType<typeof c>, role: string, client: string, source: string, appliedOn: string, stage: string, label: string, own: ReturnType<typeof owner>, nextAction: string, due: string) => ({
  id, code: `APP-${id}`, consultant: who, role, client, source, appliedOn, stage: { key: stage, label }, owner: own, nextAction, nextActionDue: due,
});
const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [1, 2, 2, 3, 4, value] });

const sarah = owner(7, "Sarah Chen");
const fixture = (over: Record<string, unknown> = {}, tracker: Record<string, unknown> = {}) => ({
  kpis: [kpi("active", 142, 12), kpi("awaiting", 68, 8), kpi("interviewing", 28, 27), kpi("offers", 12, 33)],
  tracker: {
    items: [
      row(1, c(1, "Alex Morgan"), "Senior Java Developer", "TechCorp", "LinkedIn", "2024-04-12", "interviewing", "Interviewing", sarah, "Prep for technical interview", "2024-04-18"),
      row(2, c(2, "Priya Sharma"), "Business Analyst", "Global Bank", "Client Portal", "2024-04-10", "awaiting", "Awaiting Response", owner(8, "Michael Park"), "Follow up with hiring manager", "2024-04-17"),
      row(3, c(3, "Michael Park"), "AWS Engineer", "CloudScale", "Dice", "2024-04-08", "applied", "Applied", owner(9, "Emily Lawson"), "Check application status", "2024-04-16"),
      row(5, c(5, "David Kim"), "Data Analyst", "DataWorx", "Indeed", "2024-04-03", "offer", "Offer", owner(10, "Priya Sharma"), "Send offer details to consultant", "2024-04-15"),
      row(8, c(8, "Olivia Martinez"), "UX Designer", "BrightPath", "LinkedIn", "2024-03-27", "not_selected", "Not Selected", sarah, "Share feedback with consultant", "2024-04-12"),
    ],
    total: 142, page: 0, size: 8,
    tabs: [
      { key: "all", label: "All Applications", count: 142 }, { key: "applied", label: "Applied", count: 44 }, { key: "awaiting", label: "Awaiting Response", count: 68 },
      { key: "interviewing", label: "Interviewing", count: 28 }, { key: "offer", label: "Offer", count: 12 }, { key: "hired", label: "Hired", count: 8 }, { key: "not_selected", label: "Not Selected", count: 15 },
    ],
    filters: { consultants: [{ id: 1, name: "Alex Morgan" }, { id: 2, name: "Priya Sharma" }], clients: [{ id: 1, name: "TechCorp" }] },
    notShared: 0,
    ...tracker,
  },
  funnel: {
    period: "3m", total: 142,
    stages: [
      { key: "applied", label: "Applied", count: 142, pct: 100 }, { key: "awaiting", label: "Awaiting Response", count: 68, pct: 48 }, { key: "interviewing", label: "Interviewing", count: 28, pct: 20 },
      { key: "offers", label: "Offers", count: 12, pct: 8 }, { key: "hired", label: "Hired", count: 8, pct: 6 },
    ],
  },
  overdue: [
    { id: 1, consultant: c(1, "Alex Morgan"), title: "Follow up with TechCorp", sub: "Application response pending", daysOverdue: 3 },
    { id: 4, consultant: c(4, "Emily Lawson"), title: "Send thank you note", sub: "HealthPlus - Project Manager", daysOverdue: 1 },
  ],
  overdueTotal: 2,
  updates: [
    { id: 1, applicationId: 5, consultant: c(5, "David Kim"), text: "moved to Offer", detail: "Data Analyst at DataWorx", at: iso(1 * H), tone: "green" },
    { id: 2, applicationId: 4, consultant: c(4, "Emily Lawson"), text: "completed interview", detail: "Project Manager at HealthPlus", at: iso(3 * H), tone: "amber" },
  ],
  perms: { followups: true, record: true },
  ...over,
});

const HREFS = { followups: "/w/marketing/followups", activity: "/w/marketing/activity" };
const mount = () => render(<ApplicationsPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={HREFS} />);
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => vi.stubGlobal("fetch", reply(200, fixture())));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ApplicationsPage", () => {
  it("draws the title, subtitle and the four KPI tiles with value and delta", async () => {
    mount();
    await screen.findByText("Senior Java Developer");
    for (const [key, title, value, delta] of [["active", "Active Applications", "142", "12%"], ["awaiting", "Awaiting Response", "68", "8%"], ["interviewing", "Interviewing", "28", "27%"], ["offers", "Offers", "12", "33%"]]) {
      const tile = await waitFor(() => {
        const t = document.querySelector(`[data-stat-tile="${key}"]`);
        if (!t) throw new Error("no tile");
        return t as HTMLElement;
      });
      expect(within(tile).getByText(title)).toBeTruthy();
      expect(within(tile).getByText(value)).toBeTruthy();
      expect(within(tile).getByText(delta)).toBeTruthy();
      expect(within(tile).getByText("vs last month")).toBeTruthy();
    }
  });

  it("draws the Application Tracker card: search, the four selects, Clear and the stage tabs with counts", async () => {
    mount();
    await screen.findByText("Senior Java Developer");
    expect(screen.getByText("Application Tracker")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search applications, consultants, or roles...")).toBeTruthy();
    for (const label of ["All Consultants", "All Clients", "All Stages", "Last 3 Months"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["All Applications142", "Applied44", "Awaiting Response68", "Interviewing28", "Offer12", "Hired8", "Not Selected15"]);
    expect(screen.getByRole("tab", { name: /All Applications/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("draws every board column and the rows with logo source, date, stage chip, owner and a red due date", async () => {
    mount();
    await screen.findByText("Senior Java Developer");
    for (const col of ["Consultant", "Applied Role", "Client", "Source", "Stage", "Owner", "Next Action"]) expect(screen.getAllByText(col).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Sort by application date" })).toBeTruthy();
    const first = document.querySelector('[data-app-row="1"]') as HTMLElement;
    expect(within(first).getByText("Alex Morgan")).toBeTruthy();
    expect(within(first).getByText("TechCorp")).toBeTruthy();
    expect(within(first).getByText("LinkedIn")).toBeTruthy();
    expect(first.querySelector('[data-source-logo="LinkedIn"]')).toBeTruthy();
    expect(within(first).getByText("Apr 12, 2024")).toBeTruthy();
    expect(within(first).getByText("Interviewing")).toBeTruthy();
    expect(within(first).getByText("Sarah Chen")).toBeTruthy();
    expect(within(first).getByText("Prep for technical interview")).toBeTruthy();
    expect(within(first).getByText("Apr 18").className).toContain("text-danger-text");
    expect(document.querySelectorAll("[data-app-row]").length).toBe(5);
    expect((document.querySelector('[data-app-row="8"] [data-stage]') as HTMLElement).textContent).toBe("Not Selected");
    expect(screen.getByText("Showing 1-8 of 142")).toBeTruthy();
  });

  it("draws Application Funnel with the legend counts and percents, Overdue Actions with red day counts, Recent Updates and the bee card", async () => {
    mount();
    await screen.findByText("Senior Java Developer");
    expect(screen.getByText("Application Funnel")).toBeTruthy();
    const funnel = document.querySelector('[data-app-card="funnel"]') as HTMLElement;
    expect(within(funnel).getByText("Last 3 Months")).toBeTruthy();
    const legend = funnel.querySelector('[data-funnel-row="awaiting"]') as HTMLElement;
    expect(legend.textContent).toContain("Awaiting Response");
    expect(legend.textContent).toContain("68");
    expect(legend.textContent).toContain("48%");
    expect(funnel.querySelectorAll("[data-funnel-stage]").length).toBe(5);

    const overdue = document.querySelector('[data-app-card="overdue"]') as HTMLElement;
    expect(within(overdue).getByText("Overdue Actions")).toBeTruthy();
    expect(within(overdue).getByText("Follow up with TechCorp")).toBeTruthy();
    expect(within(overdue).getByText("3 days").className).toContain("text-danger-text");
    expect(within(overdue).getByText("1 day")).toBeTruthy();
    expect(within(overdue).getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/w/marketing/followups");

    const updates = document.querySelector('[data-app-card="updates"]') as HTMLElement;
    expect(within(updates).getByText("Recent Updates")).toBeTruthy();
    expect(within(updates).getByText("moved to Offer")).toBeTruthy();
    expect(within(updates).getByText("1 hour ago")).toBeTruthy();
    expect(within(updates).getByText("3 hours ago")).toBeTruthy();
    expect((updates.querySelector('[data-update-row="1"]') as HTMLElement).getAttribute("data-tone")).toBe("green");
    expect(within(updates).getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/w/marketing/activity");

    expect(screen.getByText("Keep applications moving!")).toBeTruthy();
    expect(screen.getByText("Follow up on pending applications and schedule interviews to help your consultants get placed.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask a question" })).toBeTruthy();
  });

  it("a consultant who shares only a summary shows the stage, a Summary chip and dotted 'Not shared' cells", async () => {
    const summary = { id: 9, code: null, consultant: c(9, "Dana Summary", "SUMMARY"), role: null, client: null, source: null, appliedOn: null, stage: { key: "offer", label: "Offer" }, owner: sarah, nextAction: null, nextActionDue: null };
    vi.stubGlobal("fetch", reply(200, fixture({}, { items: [summary], total: 1 })));
    mount();
    await screen.findByText("Dana Summary");
    const r = document.querySelector('[data-app-row="9"]') as HTMLElement;
    expect(within(r).getByText("Summary")).toBeTruthy();
    expect(r.querySelectorAll("[data-not-shared]").length).toBe(5); // role, client, source, date, next action
    expect(within(r).getByText("Offer")).toBeTruthy();
    expect(within(r).queryByRole("button", { name: /More for/ })).toBeNull(); // no actions on a row that is not shared
  });

  it("says how many consultants share nothing and are left out", async () => {
    vi.stubGlobal("fetch", reply(200, fixture({}, { notShared: 2 })));
    mount();
    expect(await screen.findByText(/2 consultants haven't shared their applications/)).toBeTruthy();
  });

  it("empty: every card shows its own empty copy and no made-up numbers", async () => {
    vi.stubGlobal(
      "fetch",
      reply(200, {
        kpis: [], tracker: { items: [], total: 0, page: 0, size: 8, tabs: [], filters: { consultants: [], clients: [] }, notShared: 0 },
        funnel: { period: "3m", total: 0, stages: [] }, overdue: [], overdueTotal: 0, updates: [], perms: { followups: true, record: true },
      }),
    );
    mount();
    expect(await screen.findByText("No applications for your consultants yet.")).toBeTruthy();
    expect(screen.getByText("No applications in this period.")).toBeTruthy();
    expect(screen.getByText("Nothing overdue. Nice.")).toBeTruthy();
    expect(screen.getByText("Nothing has happened yet.")).toBeTruthy();
    expect(screen.getAllByText("Nothing yet").length).toBe(4);
  });

  it("failure offers a retry that loads the board", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })).mockResolvedValue(new Response(JSON.stringify(fixture()), { status: 200 }));
    vi.stubGlobal("fetch", f);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText("Senior Java Developer")).toBeTruthy();
  });

  it("403 and 404 read as 'isn't part of your role'", async () => {
    for (const status of [403, 404]) {
      cleanup();
      vi.stubGlobal("fetch", reply(status, {}));
      mount();
      expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
    }
  });

  it("clicking a stage tab asks the API for that stage, and Clear resets the filters", async () => {
    const f = reply(200, fixture());
    vi.stubGlobal("fetch", f);
    mount();
    await screen.findByText("Senior Java Developer");
    fireEvent.click(screen.getByRole("tab", { name: /Offer/ }));
    await waitFor(() => expect(f.mock.calls.some((c) => String((c as unknown[])[0]).includes("stage=offer"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(String((f.mock.calls.at(-1) as unknown[])[0])).not.toContain("stage="));
  });

  it("the Application Date header toggles the sort", async () => {
    const f = reply(200, fixture());
    vi.stubGlobal("fetch", f);
    mount();
    await screen.findByText("Senior Java Developer");
    fireEvent.click(screen.getByRole("button", { name: "Sort by application date" }));
    await waitFor(() => expect(String((f.mock.calls.at(-1) as unknown[])[0])).toContain("sort=appliedOn%2Casc"));
  });

  it("marking an overdue action done calls only the follow-up-done record route and reloads", async () => {
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes("follow-up-done") ? fixture().tracker.items[0] : fixture()), { status: 200 }));
    vi.stubGlobal("fetch", f);
    mount();
    await screen.findByText("Follow up with TechCorp");
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark done: Follow up with TechCorp" }));
    await waitFor(() => expect((f.mock.calls as unknown as [string, RequestInit?][]).some(([u, i]) => u === "/api/orgs/2/mkt/applications/1/follow-up-done" && i?.method === "POST")).toBe(true));
  });

  it("the row menu records a note through the BFF (never a submission)", async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST" ? fixture().tracker.items[0] : fixture()), { status: 200 }));
    vi.stubGlobal("fetch", f);
    mount();
    await screen.findByText("Senior Java Developer");
    fireEvent.click(screen.getByRole("button", { name: "More for Alex Morgan" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add a note" }));
    fireEvent.change(await screen.findByPlaceholderText("What happened, what is next..."), { target: { value: "Called the vendor" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => {
      const posts = (f.mock.calls as unknown as [string, RequestInit?][]).filter(([, i]) => i?.method === "POST");
      expect(posts.length).toBe(1);
      expect(posts[0][0]).toBe("/api/orgs/2/mkt/applications/1/notes");
      expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ body: "Called the vendor" });
    });
  });

  it("the stage dialog says the consultant submits and nothing is sent to the client", async () => {
    mount();
    await screen.findByText("Senior Java Developer");
    fireEvent.click(screen.getByRole("button", { name: "More for Alex Morgan" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Record stage change" }));
    expect(await screen.findByText(/The consultant submits; nothing is sent to the client from here\./)).toBeTruthy();
  });

  it("without the write permissions the kebab is only an icon", async () => {
    vi.stubGlobal("fetch", reply(200, fixture({ perms: { followups: false, record: false } })));
    mount();
    await screen.findByText("Senior Java Developer");
    const kebab = within(document.querySelector('[data-app-row="1"]') as HTMLElement).getByLabelText("More for Alex Morgan");
    expect(kebab.tagName.toLowerCase()).not.toBe("button");
    expect(screen.getByRole("checkbox", { name: "Mark done: Follow up with TechCorp" }).hasAttribute("disabled")).toBe(true);
  });
});
