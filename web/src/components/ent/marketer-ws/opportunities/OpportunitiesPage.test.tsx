// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@kiwiply/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/marketing/opportunities" }));
// The shell draws the header from what the page declares; here the declaration is drawn in place so the board's title and subtitle can be asserted.
vi.mock("@/components/ent/shell/ShellContext", () => ({
  default: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
  ClaimsMascot: () => null,
  ClaimsHelpCard: () => null,
  openHelpPanel: vi.fn(),
}));

import OpportunitiesPage from "./OpportunitiesPage";

const NOW = Date.now();
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const person = (id: number, name: string) => ({ id, name, avatarUrl: null });
const SARAH = person(101, "Sarah Chen");
const JAMES = person(102, "James Lee");
const DAVID = person(103, "David Kim");

const opp = (id: number, who: [number, string], title: string, location: string, client: string, score: number, interest: string, resume: string, owner: unknown, next: number, action: string, status = "ASSIGNED") => ({
  id, consultant: person(who[0], who[1]), requirementId: 100 + id, jobTitle: title, location, clientId: id, client, matchScore: score, interest, resumeStatus: resume, owner,
  nextActionAt: day(next), action, status, lastActivityAt: ago(3600e3), stale: false, ready: false, reason: "Skills match.",
});
const ROWS = [
  opp(1, [1, "Alex Morgan"], "Senior Java Developer", "New York, NY (Hybrid)", "TechCorp", 92, "VERY_INTERESTED", "UPDATED", SARAH, 1, "REVIEW"),
  opp(2, [2, "Priya Sharma"], "Data Analyst", "Remote", "Global Bank", 88, "INTERESTED", "UPDATED", JAMES, 2, "ASSIGN", "SUGGESTED"),
  opp(3, [3, "Michael Park"], "AWS Cloud Engineer", "Austin, TX (Hybrid)", "CloudScale", 85, "OPEN", "NEEDS_UPDATE", SARAH, 0, "FOLLOW_UP"),
  opp(4, [4, "Emily Lawson"], "Project Manager (PMP)", "Remote", "NextGen", 78, "VERY_INTERESTED", "UPDATED", DAVID, 3, "REVIEW"),
  opp(5, [5, "David Kim"], "Business Analyst", "Chicago, IL (Hybrid)", "HealthPlus", 82, "INTERESTED", "UPDATED", JAMES, 1, "ASSIGN", "SUGGESTED"),
  opp(6, [6, "Jessica Wong"], "DevOps Engineer", "Seattle, WA (Remote)", "DataSystems", 76, "NOT_INTERESTED", "UPDATED", SARAH, 5, "COMPARE"),
  opp(7, [7, "Robert Chen"], "Full Stack Developer", "San Francisco, CA (Hybrid)", "FinTech Co", 80, "INTERESTED", "NEEDS_UPDATE", DAVID, 2, "FOLLOW_UP"),
  opp(8, [8, "Maria Garcia"], "Product Owner", "New York, NY (Hybrid)", "RetailPro", 74, "OPEN", "UPDATED", SARAH, 4, "ASSIGN", "SUGGESTED"),
];
const kpi = (key: string, value: number, deltaPct: number | null) => ({ key, value, deltaPct, sparkline: [1, 2, 2, 3, 4, value] });

const fixture = (over: Record<string, unknown> = {}) => ({
  kpis: [kpi("open", 86, 12), kpi("ready", 28, 18), kpi("awaiting", 42, -10), kpi("stale", 14, -22)],
  items: ROWS,
  total: 8,
  page: 0,
  size: 8,
  topMatches: [
    { id: 1, jobTitle: "Senior Java Developer", client: "TechCorp", location: "New York, NY", matchScore: 92 },
    { id: 2, jobTitle: "Data Analyst", client: "Global Bank", location: "Remote", matchScore: 88 },
  ],
  responses: {
    total: 86,
    days: 30,
    slices: [
      { key: "VERY_INTERESTED", label: "Very Interested", count: 28 },
      { key: "INTERESTED", label: "Interested", count: 24 },
      { key: "OPEN", label: "Open", count: 17 },
      { key: "NOT_INTERESTED", label: "Not Interested", count: 10 },
      { key: "NO_RESPONSE", label: "No Response", count: 7 },
    ],
  },
  activity: [
    { id: 1, kind: "INTEREST_CHANGED", consultant: "Alex Morgan", text: "marked as Very Interested", detail: "Senior Java Developer at TechCorp", at: ago(2 * 3600e3) },
    { id: 2, kind: "RESUME_REQUESTED", consultant: "Michael Park", text: "requested resume update", detail: "AWS Cloud Engineer at CloudScale", at: ago(6 * 3600e3) },
  ],
  filters: { consultants: [{ id: 1, name: "Alex Morgan" }], clients: [{ id: 1, name: "TechCorp" }] },
  ...over,
});

const HREFS = { matches: "/w/marketing/matches", jobs: "/w/marketing/jobs", activity: "/w/marketing/activity", opportunities: "/w/marketing/opportunities" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface Call { url: string; method: string; body: string }
function stub(list: () => Response = () => json(200, fixture()), info: unknown = null) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : "" };
      calls.push(call);
      if (call.method === "POST" && /\/assign$/.test(url)) return json(200, { message: "Assigned. Priya Sharma was asked for their interest.", changed: true });
      if (call.method === "POST" && /\/request$/.test(url)) return json(200, { message: "Asked Michael Park to update their resume.", changed: true });
      if (call.method === "POST" && /\/notify$/.test(url)) return json(200, { done: 2, skipped: [], message: "Asked 2 consultants for their interest." });
      if (call.method === "POST") return json(200, { message: "Done.", changed: true });
      if (/\/opportunities\/\d+$/.test(url)) return json(200, { item: ROWS[5], alternatives: [ROWS[0]], events: [], info });
      if (/\/options/.test(url)) return json(200, { consultants: [{ id: 1, name: "Alex Morgan" }], jobs: [{ id: 9, title: "Java Lead", client: "TechCorp", location: "NY" }] });
      return list();
    }),
  );
  return calls;
}
const lists = (calls: Call[]) => calls.filter((c) => c.method === "GET" && /\/mkt\/opportunities\?/.test(c.url));
const mount = () => render(<ToastProvider><OpportunitiesPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={HREFS} /></ToastProvider>);
const row = async (id: number) => await waitFor(() => {
  const r = document.querySelector(`[data-opp-row="${id}"]`) as HTMLElement;
  expect(r).toBeTruthy();
  return r;
});

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OpportunitiesPage", () => {
  it("draws the board's title, the plan's subtitle and two tiles (awaiting, stale) with no delta or sparkline", async () => {
    stub();
    mount();
    expect(screen.getByRole("heading", { name: "Opportunities", level: 1 })).toBeTruthy();
    expect(screen.getByText("Openings you've shortlisted for your consultants, and where each stands.")).toBeTruthy();
    await waitFor(() => {
      const t = document.querySelector('[data-stat-tile="awaiting"]') as HTMLElement;
      expect(within(t).getByText("42")).toBeTruthy();
    });
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(2);
    for (const [key, title, value] of [["awaiting", "Awaiting consultant review", "42"], ["stale", "Stale", "14"]]) {
      const t = document.querySelector(`[data-stat-tile="${key}"]`) as HTMLElement;
      expect(within(t).getByText(title)).toBeTruthy();
      expect(within(t).getByText(value)).toBeTruthy();
      expect(t.textContent).not.toContain("%");
      expect(t.textContent).not.toContain("vs last month");
    }
  });

  it("interest status is a chip row with counts (it replaced the donut); a chip filters the list and shows pressed", async () => {
    const calls = stub();
    mount();
    await row(1);
    const chips = document.querySelector("[data-opp-chips]") as HTMLElement;
    for (const label of ["Very interested (28)", "Interested (24)", "Open (17)", "Not interested (10)", "No response (7)", "Stale (14)"]) expect(within(chips).getByRole("button", { name: label }), label).toBeTruthy();
    expect(document.querySelector('[data-opp-card="responses"]')).toBeNull();
    fireEvent.click(within(chips).getByRole("button", { name: "Interested (24)" }));
    await waitFor(() => expect(lists(calls).some((c) => c.url.includes("interest=INTERESTED"))).toBe(true));
    expect(within(chips).getByRole("button", { name: "Interested (24)" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("lists every board column and row: consultant, opening + location, client, score, interest, resume, next action, button (no Owner)", async () => {
    stub();
    mount();
    const card = await waitFor(() => {
      const c = document.querySelector('[data-opp-card="table"]') as HTMLElement;
      expect(within(c).getByText("Alex Morgan")).toBeTruthy();
      return c;
    });
    expect(within(card).getByRole("heading", { name: "Opportunities" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: /Add opportunity/ })).toBeTruthy();
    const heads = Array.from(card.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
    expect(heads).toEqual(["Consultant", "Opening", "Client", "Match score", "Consultant interest", "Resume status", "Next action", "Actions"]);
    const r1 = await row(1);
    for (const text of ["Alex Morgan", "Senior Java Developer", "New York, NY (Hybrid)", "TechCorp", "92%", "Very interested", "Updated", "1 day"]) expect(within(r1).getByText(text)).toBeTruthy();
    expect(within(r1).queryByText("Sarah Chen")).toBeNull();
    expect(within(r1).getByRole("button", { name: "Review" })).toBeTruthy();
    const r3 = await row(3);
    expect(within(r3).getByText("Needs update")).toBeTruthy();
    expect(within(r3).getByText("Today")).toBeTruthy();
    expect(within(r3).getByRole("button", { name: "Follow up" })).toBeTruthy();
    expect(within(await row(2)).getByRole("button", { name: "Assign" })).toBeTruthy();
    expect(within(await row(6)).getByRole("button", { name: "Compare" })).toBeTruthy();
    expect(within(await row(6)).getByText("Not interested")).toBeTruthy();
    expect(within(r1).getByRole("button", { name: /More for Alex Morgan/ })).toBeTruthy();
    expect(document.querySelectorAll("[data-opp-row]")).toHaveLength(8);
  });

  it("writes a score nobody computed as Not scored, never 0%", async () => {
    stub(() => json(200, fixture({ items: [{ ...ROWS[0], matchScore: 0 }] })));
    mount();
    const r1 = await row(1);
    expect(within(r1).getByText("Not scored")).toBeTruthy();
    expect(within(r1).queryByText("0%")).toBeNull();
  });

  it("keeps the search box the save-for-consultant rehearsal types into, and the data-opp-row hook", async () => {
    stub();
    mount();
    await row(1);
    expect(screen.getByLabelText("Search by consultant or job title")).toBeTruthy();
  });

  it("shows the search box and the filters with the board labels (interest status is the chip row)", async () => {
    stub();
    mount();
    await row(1);
    const bar = document.querySelector("[data-opp-filters]") as HTMLElement;
    expect(within(bar).getByPlaceholderText("Search by consultant or job title...")).toBeTruthy();
    for (const label of ["All consultants", "All clients", "Match score", "Last 30 days"]) expect(within(bar).getByText(label)).toBeTruthy();
    expect(within(bar).queryByText("Interest Status")).toBeNull();
  });

  it("asks the API for the filtered list when a filter changes (search is debounced)", async () => {
    const calls = stub();
    mount();
    await row(1);
    fireEvent.change(screen.getByPlaceholderText("Search by consultant or job title..."), { target: { value: "priya" } });
    await waitFor(() => expect(lists(calls).some((c) => c.url.includes("q=priya"))).toBe(true));
    expect(lists(calls)[0].url).toContain("days=30");
  });

  it("has no lower cards, bee help card or Quick Actions (the page ends with the table)", async () => {
    stub();
    mount();
    await row(1);
    for (const c of ["top", "responses", "activity", "quick"]) expect(document.querySelector(`[data-opp-card="${c}"]`), c).toBeNull();
    expect(screen.queryByText("Top Opportunities by Match")).toBeNull();
    expect(screen.queryByText("Recent Opportunity Activity")).toBeNull();
    expect(screen.queryByText("Quick Actions")).toBeNull();
    expect(screen.queryByRole("button", { name: /Ask a question/ })).toBeNull();
  });

  it("shows the board's empty copy with no rows and a filter message when filters hide everything", async () => {
    stub(() => json(200, fixture({ items: [], total: 0, topMatches: [], activity: [], responses: { total: 0, days: 30, slices: [] }, kpis: [] })));
    mount();
    expect(await screen.findByText("Assign the first opportunity.")).toBeTruthy();
    expect(document.querySelectorAll("[data-stat-tile]")).toHaveLength(2);
    fireEvent.change(screen.getByPlaceholderText("Search by consultant or job title..."), { target: { value: "zzz" } });
    expect(await screen.findByText("No opportunities match these filters.")).toBeTruthy();
  });

  it("offers a retry when the board fails to load", async () => {
    let ok = false;
    stub(() => (ok ? json(200, fixture()) : json(500, {})));
    mount();
    const retry = await screen.findByRole("button", { name: /try again|retry/i });
    ok = true;
    fireEvent.click(retry);
    expect((await screen.findAllByText("Alex Morgan")).length).toBeGreaterThan(0);
  });

  it("says the page isn't part of the role on a 403/404", async () => {
    stub(() => json(404, { status: 404 }));
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
  });

  it("Assign posts to the assign route, tells the marketer, and reloads (it never sets an interest)", async () => {
    const calls = stub();
    mount();
    fireEvent.click(within(await row(2)).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/orgs/2/mkt/opportunities/2/assign")).toBe(true));
    expect(await screen.findByText("Assigned. Priya Sharma was asked for their interest.")).toBeTruthy();
    await waitFor(() => expect(lists(calls).length).toBeGreaterThan(1));
    expect(calls.filter((c) => c.method !== "GET").every((c) => !/interest"\s*:|submit/i.test(c.body))).toBe(true);
  });

  it("Follow up on a stale resume asks the consultant for a resume update", async () => {
    const calls = stub();
    mount();
    fireEvent.click(within(await row(3)).getByRole("button", { name: "Follow up" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/orgs/2/mkt/opportunities/3/request" && c.body === '{"kind":"RESUME"}')).toBe(true));
    expect(await screen.findByText("Asked Michael Park to update their resume.")).toBeTruthy();
  });

  it("Follow up with an up to date resume asks for their interest", async () => {
    const calls = stub(() => json(200, fixture({ items: [opp(9, [9, "Sam Lee"], "QA Lead", "Remote", "Acme", 81, "NO_RESPONSE", "UPDATED", SARAH, 1, "FOLLOW_UP")] })));
    mount();
    fireEvent.click(within(await row(9)).getByRole("button", { name: "Follow up" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/9/request") && c.body === '{"kind":"INTEREST"}')).toBe(true));
  });

  it("Compare opens the comparison with the consultant's other opportunities", async () => {
    const calls = stub();
    mount();
    fireEvent.click(within(await row(6)).getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("Compare opportunities")).toBeTruthy();
    expect(calls.some((c) => c.method === "GET" && c.url === "/api/orgs/2/mkt/opportunities/6")).toBe(true);
    expect(await screen.findByText(/other open opportunities/)).toBeTruthy();
    expect(document.querySelectorAll("[data-compare-row]")).toHaveLength(1);
  });

  it("Review opens the review dialog and Mark as reviewed posts the review", async () => {
    const calls = stub();
    mount();
    fireEvent.click(within(await row(1)).getByRole("button", { name: "Review" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark as reviewed" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/review"))).toBe(true));
  });

  it("Review shows the consultant's question and sends the marketer's answer (MKT-41); only the answer is posted", async () => {
    const calls = stub(undefined, { question: "Is the role onsite three days a week?", answer: "", awaitingAnswer: true });
    mount();
    fireEvent.click(within(await row(1)).getByRole("button", { name: "Review" }));
    expect(await screen.findByText("Is the role onsite three days a week?")).toBeTruthy();
    const send = screen.getByRole("button", { name: "Send answer" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Two days onsite, three remote." } });
    fireEvent.click(send);
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && /\/opportunities\/\d+\/answer-info$/.test(c.url))).toBe(true));
    const post = calls.find((c) => c.url.endsWith("/answer-info"))!;
    expect(JSON.parse(post.body)).toEqual({ answer: "Two days onsite, three remote." });
    await waitFor(() => expect(document.querySelector("[data-opp-info-answer]")?.textContent).toContain("Two days onsite"));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("Review shows no answer box when the consultant asked nothing, and no input once the question is closed", async () => {
    stub();
    mount();
    fireEvent.click(within(await row(1)).getByRole("button", { name: "Review" }));
    await screen.findByText("Timeline");
    expect(document.querySelector("[data-opp-info]")).toBeNull();
    cleanup();
    stub(undefined, { question: "Visa sponsorship?", answer: "Not needed.", awaitingAnswer: false });
    mount();
    fireEvent.click(within(await row(1)).getByRole("button", { name: "Review" }));
    expect(await screen.findByText("Visa sponsorship?")).toBeTruthy();
    expect(screen.queryByLabelText("Your answer")).toBeNull();
  });

  it("Notify consultants asks to confirm, then posts the request", async () => {
    const calls = stub();
    mount();
    await row(1);
    fireEvent.click(screen.getByRole("button", { name: /Notify consultants/ }));
    expect(await screen.findByText(/42 assigned opportunities are waiting/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send requests" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/orgs/2/mkt/opportunities/notify")).toBe(true));
    expect(await screen.findByText("Asked 2 consultants for their interest.")).toBeTruthy();
  });

  it("Export is a download link carrying the board's filters", async () => {
    stub();
    mount();
    await row(1);
    const link = screen.getByRole("link", { name: /Export/ });
    expect(link.getAttribute("href")).toBe("/api/orgs/2/mkt/opportunities/export?days=30&sort=recent&dir=desc");
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("the Stale chip filters the list to stale rows for any period, and pressing it again goes back", async () => {
    const calls = stub();
    mount();
    await row(1);
    fireEvent.click(screen.getByRole("button", { name: "Stale (14)" }));
    await waitFor(() => expect(lists(calls).some((c) => c.url.includes("stale=true") && c.url.includes("days=0"))).toBe(true));
    expect(screen.getByRole("button", { name: "Stale (14)" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Stale (14)" }));
    await waitFor(() => expect(lists(calls)[lists(calls).length - 1].url).not.toContain("stale=true"));
  });

  it("Add opportunity loads the consultants and jobs and posts a create request", async () => {
    const calls = stub();
    mount();
    await row(1);
    fireEvent.click(screen.getByRole("button", { name: /Add opportunity/ }));
    expect((await screen.findAllByText("Add opportunity")).length).toBeGreaterThan(1); // the header button and the dialog title
    await waitFor(() => expect(calls.some((c) => c.url.includes("/options"))).toBe(true));
    expect(await screen.findByText(/not contacted until you assign/)).toBeTruthy();
  });

  it("Bulk assign lists the ready opportunities and assigns the ticked ones", async () => {
    const ready = { ...ROWS[1], ready: true };
    const calls = stub(() => json(200, fixture({ items: [ready] })));
    mount();
    await row(2);
    fireEvent.click(screen.getByRole("button", { name: /Bulk assign/ }));
    expect(await screen.findByText("Bulk assign opportunities")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Assign 1" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/bulk-assign") && c.body === '{"ids":[2]}')).toBe(true));
  });

  describe("the duplicate and cap guards (Sprint 2 / B1)", () => {
    const finding = { rule: "VENDOR_CHAIN", message: "This consultant already has the same role through another vendor: TekVendor (Data Analyst)." };
    /** Like stub(), but a single assign answers with what the test says. */
    function stubAssign(answer: (body: string) => Response) {
      const calls: Call[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          const call = { url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : "" };
          calls.push(call);
          if (call.method === "POST" && /\/assign$/.test(url)) return answer(call.body);
          if (call.method === "POST" && /\/bulk-assign$/.test(url)) return json(200, { done: 1, skipped: [{ id: 5, code: "DUPLICATE_WARNING" }, { id: 8, code: "ASSIGNMENT_CAP" }], message: "Assigned 1 opportunity." });
          if (/\/options/.test(url)) return json(200, { consultants: [], jobs: [] });
          return json(200, fixture({ items: [{ ...ROWS[1], ready: true }, ROWS[4], ROWS[7]] }));
        }),
      );
      return calls;
    }

    it("a duplicate warning opens a dialog with what was found, and Assign anyway needs a reason", async () => {
      const calls = stubAssign((body) => (body ? json(200, { message: "Assigned. Priya Sharma was asked for their interest.", changed: true }) : json(409, { error: "Duplicate. Confirm with a reason to go ahead.", code: "DUPLICATE_WARNING", findings: [finding] })));
      mount();
      fireEvent.click(within(await row(2)).getByRole("button", { name: "Assign" }));
      const dialog = await waitFor(() => {
        const d = document.querySelector("[data-opp-dialog=duplicate]") as HTMLElement;
        expect(d).toBeTruthy();
        return d;
      });
      expect(within(dialog).getByText(/through another vendor: TekVendor/)).toBeTruthy();
      expect(screen.queryByText("Duplicate. Confirm with a reason to go ahead.")).toBeNull(); // no error toast: the dialog is the answer
      const go = within(dialog).getByRole("button", { name: "Assign anyway" }) as HTMLButtonElement;
      expect(go.disabled).toBe(true);
      fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "The client asked for both vendors" } });
      expect(go.disabled).toBe(false);
      fireEvent.click(go);
      await waitFor(() => expect(calls.some((c) => /\/2\/assign$/.test(c.url) && c.body === JSON.stringify({ confirmDuplicate: true, duplicateReason: "The client asked for both vendors" }))).toBe(true));
      expect(await screen.findByText("Assigned. Priya Sharma was asked for their interest.")).toBeTruthy();
      await waitFor(() => expect(document.querySelector("[data-opp-dialog=duplicate]")).toBeNull());
    });

    it("a block is a plain message with nothing to confirm", async () => {
      stubAssign(() => json(409, { error: "This consultant already has the same role. Your organization does not allow this.", code: "DUPLICATE_BLOCKED", findings: [finding] }));
      mount();
      fireEvent.click(within(await row(2)).getByRole("button", { name: "Assign" }));
      expect(await screen.findByText("This consultant already has the same role. Your organization does not allow this.")).toBeTruthy();
      expect(document.querySelector("[data-opp-dialog=duplicate]")).toBeNull();
    });

    it("the open-opportunity limit is a plain message too", async () => {
      stubAssign(() => json(409, { error: "This consultant already has 5 open opportunities, the most your organization allows (5).", code: "ASSIGNMENT_CAP", open: 5, cap: 5 }));
      mount();
      fireEvent.click(within(await row(2)).getByRole("button", { name: "Assign" }));
      expect(await screen.findByText(/already has 5 open opportunities, the most your organization allows/)).toBeTruthy();
      expect(document.querySelector("[data-opp-dialog=duplicate]")).toBeNull();
    });

    it("a bulk assign names why rows were left out", async () => {
      const calls = stubAssign(() => json(200, {}));
      mount();
      await row(2);
      fireEvent.click(screen.getByRole("button", { name: /Bulk assign/ }));
      fireEvent.click(await screen.findByRole("button", { name: /^Assign \d/ }));
      await waitFor(() => expect(calls.some((c) => c.url.endsWith("/bulk-assign"))).toBe(true));
      expect(await screen.findByText(/Left out: 1 looked like a duplicate \(assign those one by one to confirm\); 1 over the open-opportunity limit\./)).toBeTruthy();
    });
  });
});
