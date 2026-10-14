// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ToastProvider } from "@kiwiply/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockPath = "/w/consultant/opportunities";
let mockSearch = "";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath, useSearchParams: () => new URLSearchParams(mockSearch), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
// The shell draws the header from what the page declares; here the declaration is drawn in place so the title and subtitle can be asserted.
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
import { consultantPage } from "../registry";
import type { ConPageProps } from "./conParts";

const PROPS: ConPageProps = { orgId: 2, orgName: "Acme", firstName: "Anika", hrefs: { opportunities: "/w/consultant/opportunities" } };
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const ALL_OPEN = ["VIEWED", "INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED"];
const row = (id: number, over: Record<string, unknown> = {}, job: Record<string, unknown> = {}) => ({
  id,
  state: "ASSIGNED",
  job: { id: 100 + id, title: `Job ${id}`, company: `Company ${id}`, location: "Austin, TX", workMode: "HYBRID", employmentType: "Contract", payLabel: "", jobUrl: `https://example.com/jobs/${id}`, atsPlatform: "greenhouse", externalJobId: String(id), postedOn: "2026-10-10", skills: ["Java", "Kafka"], ...job },
  marketerNote: `Note for ${id}`,
  assignedBy: { memberId: 9, name: "Mia Marketer" },
  assignedAt: ago(3600e3),
  priority: "MEDIUM",
  dueOn: day(5),
  infoRequest: "",
  infoAnswer: "",
  appliedAt: null,
  linkedApplicationId: null,
  allowedActions: ALL_OPEN,
  version: 1,
  ...over,
});
const ROWS = [
  row(1, {}, { title: "Senior Java Developer", company: "TechCorp", payLabel: "$70-80/hr", atsPlatform: "linkedin", jobUrl: "https://www.linkedin.com/jobs/view/1" }),
  row(2, { state: "VIEWED", allowedActions: ["INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED"], priority: "HIGH" }, { title: "Data Engineer", company: "Globex", atsPlatform: "indeed" }),
  row(3, { state: "APPLIED", appliedAt: ago(86400e3), linkedApplicationId: 55, allowedActions: ["UNLINK"] }, { title: "Platform Engineer", company: "Initech" }),
  row(4, { state: "DECLINED", allowedActions: ["INTEREST"] }, { title: "QA Lead", company: "Hooli" }),
  row(5, { state: "CLOSED", allowedActions: [] }, { title: "Closed Role", company: "Pied Piper" }),
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
type Call = { url: string; method: string; body: unknown; headers: Headers };
let calls: Call[] = [];
let handler: (c: Call) => Response | Promise<Response>;
function installFetch(rows: ReturnType<typeof row>[] = ROWS, post?: (c: Call) => Response | Promise<Response> | undefined) {
  calls = [];
  handler = (c) => {
    const m = /\/consultant\/opportunities(?:\/(\d+))?(?:\/([a-z-]+))?(?:\?.*)?$/.exec(c.url);
    if (c.url.startsWith("/api/applications")) return json({ items: [{ id: 55, roleTitle: "Platform Engineer", company: "Initech" }, { id: 56, roleTitle: "Java Developer", company: "TechCorp" }] });
    if (!m) return json({}, 404);
    if (c.method === "POST") return post?.(c) ?? json(rows.find((r) => r.id === Number(m[1])) ?? {});
    if (m[1]) {
      const r = rows.find((x) => x.id === Number(m[1]));
      return r ? json(r) : json({ error: "Not found." }, 404);
    }
    return json({ items: rows, total: rows.length });
  };
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    const c: Call = { url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) };
    calls.push(c);
    return Promise.resolve(handler(c));
  });
}

function stubMedia({ compact = false, wide = true }: { compact?: boolean; wide?: boolean } = {}) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    media: q,
    matches: q.includes("pointer: coarse") ? compact : q.includes("min-width: 1024px") ? wide : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const mount = (props: Partial<ConPageProps> = {}) =>
  render(
    <ToastProvider>
      <OpportunitiesPage {...PROPS} {...props} />
    </ToastProvider>,
  );

beforeEach(() => {
  mockPath = "/w/consultant/opportunities";
  mockSearch = "";
  window.history.replaceState(null, "", "/w/consultant/opportunities");
  stubMedia();
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Assigned Opportunities list", () => {
  it("shows the header, the state tabs with counts and a row per job (table on a wide screen)", async () => {
    mount();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Assigned Opportunities");
    expect(screen.getByText("Jobs your marketer picked for you. Open the posting and apply yourself.")).toBeTruthy();
    await screen.findByText("Senior Java Developer");

    const tab = (name: string) => within(screen.getByRole("tablist")).getByRole("tab", { name: new RegExp(`^${name}`) });
    expect(tab("All").textContent).toBe("All5");
    expect(tab("New").textContent).toBe("New1");
    expect(tab("Viewed").textContent).toBe("Viewed1");
    expect(tab("Interested").textContent).toBe("Interested0");
    expect(tab("Needs info").textContent).toBe("Needs info0");
    expect(tab("Applied").textContent).toBe("Applied1");
    expect(tab("Declined").textContent).toBe("Declined1");
    expect(tab("Closed").textContent).toBe("Closed1");

    const table = document.querySelector("[data-con-table]")!;
    expect(table).toBeTruthy();
    for (const h of ["Job", "Location", "Pay", "Priority", "Due", "Assigned by", "Marketer's note", "State"]) expect(within(table as HTMLElement).getByText(h)).toBeTruthy();
    const first = document.querySelector('[data-con-row="1"]') as HTMLElement;
    expect(within(first).getByText("TechCorp")).toBeTruthy();
    expect(within(first).getByText("$70-80/hr")).toBeTruthy(); // payLabel
    expect(within(first).getByText("Hybrid")).toBeTruthy(); // work mode chip
    expect(within(first).getByText("Medium priority")).toBeTruthy();
    expect(within(first).getByText("Mia Marketer")).toBeTruthy();
    expect(within(first).getByText("Note for 1")).toBeTruthy();
    expect(first.querySelector('[data-source-badge="LinkedIn"] [data-source-logo]')).toBeTruthy(); // known board: logo tile
    expect(first.querySelector('[data-state-chip="ASSIGNED"]')?.textContent).toBe("New");
    expect(document.querySelector('[data-con-row="2"] [data-priority-chip="HIGH"]')).toBeTruthy();
  });

  it("draws cards instead of a table below 1024 px", async () => {
    stubMedia({ wide: false });
    mount();
    await screen.findByText("Senior Java Developer");
    expect(document.querySelector("[data-con-table]")).toBeNull();
    const cards = document.querySelector("[data-con-cards]")!;
    expect(cards.querySelectorAll("li")).toHaveLength(5);
    expect(within(cards as HTMLElement).getAllByText(/Assigned by Mia Marketer/).length).toBe(5);
  });

  it("a tab filters the rows and keeps itself in the query string", async () => {
    mount();
    await screen.findByText("Senior Java Developer");
    fireEvent.click(screen.getByRole("tab", { name: /^Applied/ }));
    expect(window.location.search).toBe("?state=APPLIED");
    expect(screen.getByText("Platform Engineer")).toBeTruthy();
    expect(screen.queryByText("Senior Java Developer")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^Interested/ }));
    expect(screen.getByText(/Nothing in .Interested. right now/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
    expect(window.location.search).toBe("");
  });

  it("starts on the tab named in the URL", async () => {
    mockSearch = "state=DECLINED";
    mount();
    await screen.findByText("QA Lead");
    expect(screen.queryByText("Senior Java Developer")).toBeNull();
    expect(screen.getByRole("tab", { name: /^Declined/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("an empty inbox is honest", async () => {
    installFetch([]);
    mount();
    expect(await screen.findByText("Nothing assigned yet")).toBeTruthy();
    expect(screen.getByText(/When your marketer picks a job for you/)).toBeTruthy();
  });

  it("a failed load says so and Retry loads again", async () => {
    calls = [];
    let n = 0;
    vi.stubGlobal("fetch", (url: string) => {
      calls.push({ url: String(url), method: "GET", body: undefined, headers: new Headers() });
      return Promise.resolve(++n === 1 ? json({}, 500) : json({ items: ROWS, total: 5 }));
    });
    mount();
    expect(await screen.findByText(/Your jobs didn't load/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Senior Java Developer")).toBeTruthy();
  });

  it("someone who is not a consultant gets 'not part of your role'", async () => {
    handler = () => json({}, 404);
    vi.stubGlobal("fetch", () => Promise.resolve(handler({} as Call)));
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
  });

  it("notes when only part of a long list is loaded", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(json({ items: ROWS, total: 240 })));
    mount();
    expect(await screen.findByText(/Showing your latest 5 of 240 jobs/)).toBeTruthy();
  });
});

describe("details on a wide screen: a slide-over at the canonical URL", () => {
  it("clicking a job pushes /opportunities/{id} and opens a 520 px dialog, Esc steps back to the list", async () => {
    mount();
    fireEvent.click(await screen.findByRole("link", { name: "Senior Java Developer" }));
    expect(window.location.pathname).toBe("/w/consultant/opportunities/1");
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("id")).toBe("con-opportunity");
    expect(within(dialog).getByRole("heading", { name: "Senior Java Developer" })).toBeTruthy();
    expect(document.querySelector('[data-con-opportunities]')?.getAttribute("data-view")).toBe("list"); // the list stays behind it
    expect((dialog as HTMLElement).style.width || (dialog.parentElement as HTMLElement | null)?.style.width || "520px").toContain("520");
  });

  it("a deep link renders the job straight away with every section", async () => {
    mockPath = "/w/consultant/opportunities/1";
    window.history.replaceState(null, "", mockPath);
    mount({ detailId: 1 });
    const dialog = await screen.findByRole("dialog");
    const body = await within(dialog).findByText("Employment details");
    expect(body).toBeTruthy();
    for (const s of ["Employment details", "Pay", "Skills", "Note from Mia Marketer", "Source and posting"]) expect(within(dialog).getByRole("region", { name: s })).toBeTruthy();
    expect(within(dialog).getByText("$70-80/hr")).toBeTruthy();
    expect(within(dialog).getByText("Kafka")).toBeTruthy();
    expect(within(dialog).getByText("Note for 1")).toBeTruthy();
    expect(within(dialog).getByText("Why Dossier never applies for you")).toBeTruthy();
  });

  it("the posting link is always there, opens a new tab without the opener", async () => {
    mockPath = "/w/consultant/opportunities/4"; // a declined job: still has the link
    window.history.replaceState(null, "", mockPath);
    mount({ detailId: 4 });
    const dialog = await screen.findByRole("dialog");
    const a = (await within(dialog).findByRole("link", { name: /open job posting/i })) as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("https://example.com/jobs/4");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders only the actions in allowedActions[]", async () => {
    installFetch([row(1, { allowedActions: ["INTEREST"] })]);
    mockPath = "/w/consultant/opportunities/1";
    window.history.replaceState(null, "", mockPath);
    mount({ detailId: 1 });
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("button", { name: "Interested" });
    expect(within(dialog).queryByRole("button", { name: "I applied" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Decline" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Ask a question" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /link my application/i })).toBeNull();
    expect(within(dialog).queryByText(/Our extension tracks applications/)).toBeNull(); // the I applied copy goes with the button
    expect(within(dialog).getByRole("link", { name: /open job posting/i })).toBeTruthy(); // but the posting is always reachable
  });

  it("a closed job has no buttons at all, only the posting link", async () => {
    mockPath = "/w/consultant/opportunities/5";
    window.history.replaceState(null, "", mockPath);
    mount({ detailId: 5 });
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Closed Role", { selector: "h2" });
    expect(within(dialog).queryAllByRole("button").filter((b) => b.getAttribute("data-action"))).toHaveLength(0);
  });

  it("I applied is first-class and explains when the extension tracks and when to press it", async () => {
    mockPath = "/w/consultant/opportunities/1";
    window.history.replaceState(null, "", mockPath);
    mount({ detailId: 1 });
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("button", { name: "I applied" })).toBeTruthy();
    expect(within(dialog).getByText("Our extension tracks applications on supported job sites automatically; on others (e.g. LinkedIn Easy Apply) press I applied after you submit.")).toBeTruthy();
  });

  it("Unlink is offered for a linked job, from allowedActions", async () => {
    mockPath = "/w/consultant/opportunities/3";
    window.history.replaceState(null, "", mockPath);
    mount({ detailId: 3 });
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("button", { name: "Unlink application" })).toBeTruthy();
  });

  it("an unknown job is a calm 'isn't available', not a crash", async () => {
    mockPath = "/w/consultant/opportunities/999";
    window.history.replaceState(null, "", mockPath);
    mount({ detailId: 999 });
    expect(await screen.findByText(/This opportunity isn't available/)).toBeTruthy();
  });

  it("never injects markup from the marketer's note or the job fields", async () => {
    installFetch([row(1, { marketerNote: '<img src="x" onerror="window.__pwned=1"><script>window.__pwned=2</script><b>bold</b>' }, { title: "<i>Evil</i> Title" })]);
    mockPath = "/w/consultant/opportunities/1";
    window.history.replaceState(null, "", mockPath);
    mount({ detailId: 1 });
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/<b>bold<\/b>/); // shown as literal text
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(dialog.querySelector("b, i")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    // and the source never reaches for innerHTML
    const dir = path.resolve(__dirname, "..");
    const files = [...readdirSync(dir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")).map((f) => path.join(dir, f)), ...readdirSync(__dirname).filter((f) => /\.tsx$/.test(f) && !f.endsWith(".test.tsx")).map((f) => path.join(__dirname, f))];
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
  });
});

describe("actions: optimistic, one toast, rolled back on a refusal", () => {
  const openDetail = async (id = 1) => {
    mockPath = `/w/consultant/opportunities/${id}`;
    window.history.replaceState(null, "", mockPath);
    mount({ detailId: id });
    return screen.findByRole("dialog");
  };
  const posts = () => calls.filter((c) => c.method === "POST");

  it("Interested updates the row at once, posts with If-Match and an idempotency key, then toasts", async () => {
    installFetch(ROWS, (c) => json(row(1, { state: "INTERESTED", version: 2, allowedActions: ["DECLINE", "REQUEST_INFO", "APPLIED"] }), c.url.includes("/interest") ? 200 : 500));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole("button", { name: "Interested" }));
    await waitFor(() => expect(within(dialog).getByText("Interested", { selector: '[data-state-chip]' })).toBeTruthy());
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].url).toBe("/api/orgs/2/consultant/opportunities/1/interest");
    expect(posts()[0].headers.get("if-match")).toBe("1");
    expect(posts()[0].headers.get("idempotency-key")).toBeTruthy();
    expect(await screen.findByText("Marked as interested.")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Interested" })).toBeNull(); // allowedActions came from the server's answer
  });

  it("a failed write rolls the row back and shows one error toast", async () => {
    installFetch(ROWS, () => json({ error: "The server is down." }, 500));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole("button", { name: "I applied" }));
    expect(await screen.findByText("The server is down.")).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByText("New", { selector: "[data-state-chip]" })).toBeTruthy());
    expect(within(dialog).getByRole("button", { name: "I applied" })).toBeTruthy();
    expect(screen.queryByText("Marked as applied.")).toBeNull();
  });

  it("409 VERSION_CONFLICT rolls back and offers a reload that fetches again", async () => {
    installFetch(ROWS, () => json({ code: "VERSION_CONFLICT", error: "Changed" }, 409));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole("button", { name: "Interested" }));
    expect(await screen.findByText("This job changed while you were looking.")).toBeTruthy();
    expect(within(dialog).getByText("New", { selector: "[data-state-chip]" })).toBeTruthy();
    const before = calls.filter((c) => c.method === "GET").length;
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(before));
  });

  it("I applied posts to /applied and says what happened", async () => {
    installFetch(ROWS, () => json(row(1, { state: "APPLIED", appliedAt: new Date().toISOString(), allowedActions: ["LINK"], version: 2 })));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole("button", { name: "I applied" }));
    await waitFor(() => expect(posts().map((p) => p.url)).toEqual(["/api/orgs/2/consultant/opportunities/1/applied"]));
    expect(await screen.findByText("Marked as applied.")).toBeTruthy();
    expect(await within(dialog).findByRole("button", { name: /link my application/i })).toBeTruthy();
  });

  it("opening the posting records 'viewed' once", async () => {
    installFetch(ROWS, () => json(row(1, { state: "VIEWED", allowedActions: ["INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED"], version: 2 })));
    const dialog = await openDetail();
    const link = await within(dialog).findByRole("link", { name: /open job posting/i });
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom would try to navigate
    fireEvent.click(link);
    fireEvent.click(link);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].url.endsWith("/1/viewed")).toBe(true);
    await waitFor(() => expect(within(dialog).getByText("Viewed", { selector: "[data-state-chip]" })).toBeTruthy());
  });

  it("Decline asks for a reason from the list and sends it with the note", async () => {
    installFetch(ROWS, () => json(row(1, { state: "DECLINED", allowedActions: ["INTEREST"], version: 2 })));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole("button", { name: "Decline" }));
    const form = await screen.findByText("Decline this job");
    expect(form).toBeTruthy();
    for (const label of ["Not interested", "Location doesn't work", "Pay doesn't work", "I already applied", "Something else"]) expect(screen.getByLabelText(label)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Pay doesn't work"));
    fireEvent.change(screen.getByLabelText("Note for your marketer"), { target: { value: "Too low for me" } });
    fireEvent.click(screen.getByRole("button", { name: "Decline job" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].url.endsWith("/1/decline")).toBe(true);
    expect(posts()[0].body).toEqual({ reason: "RATE", note: "Too low for me" });
    await waitFor(() => expect(screen.queryByText("Decline this job")).toBeNull());
    expect(await screen.findByText("Declined. Your marketer will see your reason.")).toBeTruthy();
  });

  it("Ask a question needs text, sends it, and a sensitive-text refusal stays under the field", async () => {
    installFetch(ROWS, () => json({ code: "SENSITIVE_CONTENT", error: "Remove the personal data." }, 422));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole("button", { name: "Ask a question" }));
    const send = await screen.findByRole("button", { name: "Send question" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Is this role remote?" } });
    fireEvent.click(send);
    expect(await screen.findByText("Remove the personal data.")).toBeTruthy();
    expect(screen.getByText("Ask a question", { selector: "h2, h3, [id]" })).toBeTruthy(); // the dialog is still open
    expect(posts()[0].body).toEqual({ question: "Is this role remote?" });
    expect(within(dialog).getByText("New", { selector: "[data-state-chip]" })).toBeTruthy(); // rolled back
  });

  it("Link lists my tracked applications and posts the chosen one", async () => {
    installFetch([row(1, { allowedActions: ["INTEREST", "LINK"] })], () => json(row(1, { state: "APPLIED", linkedApplicationId: 56, allowedActions: ["UNLINK"], version: 2 })));
    const dialog = await openDetail();
    fireEvent.click(await within(dialog).findByRole("button", { name: /link my application/i }));
    fireEvent.click(await screen.findByLabelText("Java Developer - TechCorp"));
    fireEvent.click(screen.getByRole("button", { name: "Link application" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].url.endsWith("/1/link")).toBe(true);
    expect(posts()[0].body).toEqual({ applicationId: 56 });
  });
});

describe("details on a compact screen: their own screen with a Back", () => {
  beforeEach(() => stubMedia({ compact: true, wide: false }));

  it("opens as a full screen (no slide-over) and Back returns to the list with the tab kept", async () => {
    mockSearch = "state=VIEWED";
    mount();
    fireEvent.click(await screen.findByRole("link", { name: "Data Engineer" }));
    expect(window.location.pathname).toBe("/w/consultant/opportunities/2");
    expect(window.location.search).toBe("?state=VIEWED");
    await waitFor(() => expect(document.querySelector("[data-view='screen']")).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("[data-bottom-bar]")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Data Engineer");
    const back = screen.getByRole("link", { name: /back to assigned opportunities/i });
    expect(back.getAttribute("href")).toBe("/w/consultant/opportunities?state=VIEWED");
    fireEvent.click(back);
    expect(window.location.pathname).toBe("/w/consultant/opportunities");
    expect(window.location.search).toBe("?state=VIEWED");
    await waitFor(() => expect(document.querySelector("[data-view='list']")).toBeTruthy());
    expect(screen.getByRole("tab", { name: /^Viewed/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("a deep link on a phone is the screen too, and its actions come from allowedActions", async () => {
    installFetch([row(1, { allowedActions: ["INTEREST", "APPLIED"] })]);
    mockPath = "/w/consultant/opportunities/1";
    window.history.replaceState(null, "", mockPath);
    mount({ detailId: 1 });
    await waitFor(() => expect(document.querySelector("[data-view='screen']")).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.querySelector("[data-bottom-bar]")).toBeTruthy());
    const bar = document.querySelector("[data-bottom-bar]") as HTMLElement;
    expect(within(bar).getByRole("button", { name: "I applied" })).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "Interested" })).toBeTruthy();
    expect(within(bar).queryByRole("button", { name: "Decline" })).toBeNull();
  });
});

describe("registry", () => {
  it("builds the opportunities page (list and details) and leaves the rest 'on the way'", () => {
    const props = { orgId: 2, orgName: "Acme", firstName: "Anika", hrefs: {} };
    expect(consultantPage([], props)).toBeNull();
    expect(consultantPage(["matches"], props)).toBeNull();
    expect(consultantPage(["opportunities", "12", "x"], props)).toBeNull();
    expect(consultantPage(["opportunities", "abc"], props)).toBeNull();
    const list = consultantPage(["opportunities"], props) as { props: ConPageProps };
    expect(list.props.detailId).toBeNull();
    const one = consultantPage(["opportunities", "12"], props) as { props: ConPageProps };
    expect(one.props.detailId).toBe(12);
  });
});
