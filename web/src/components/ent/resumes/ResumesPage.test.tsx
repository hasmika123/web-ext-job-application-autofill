// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* useSearchParams follows window.history.replaceState, as it does in Next 16: a tiny store stands in for the router. */
vi.mock("next/navigation", async () => {
  const React = await import("react");
  const listeners = new Set<() => void>();
  const original = window.history.replaceState.bind(window.history);
  window.history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    original(...args);
    listeners.forEach((l) => l());
  };
  return {
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => {
      const search = React.useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => window.location.search,
        () => "",
      );
      return new URLSearchParams(search);
    },
  };
});

import { ToastProvider } from "@kiwiply/ui";
import type { ResumeCounts, ResumeDetail, ResumeRow, ResumeTile } from "@/lib/ent/resumes";
import ResumesPage from "./ResumesPage";

type Call = { method: string; url: string; path: string; params: URLSearchParams; body: Record<string, unknown> | undefined; headers: Record<string, string> };
let calls: Call[];
let store: Stored[];
let overrides: ((c: Call) => { status: number; body?: unknown } | undefined)[];
let counts: ResumeCounts;

interface Stored {
  id: number;
  consultant: string;
  name: string;
  role: string;
  version: number;
  primary: boolean;
  visibility: ResumeRow["visibility"];
  approval: ResumeRow["approvalStatus"];
  consultantId: number;
}

const rowOf = (s: Stored): ResumeRow => ({
  id: s.id,
  consultant: { id: s.consultantId, name: s.consultant, initials: s.consultant[0], email: `${s.consultant.split(" ")[0].toLowerCase()}@acme.test`, jobTitle: "Engineer", location: "Austin, TX", workMode: "REMOTE", availability: "AVAILABLE", status: "ACTIVE" },
  name: s.name,
  fileName: `${s.name.toLowerCase().replace(/ /g, "_")}.pdf`,
  targetRole: s.role,
  version: s.version,
  primary: s.primary,
  visibility: s.visibility,
  approvalStatus: s.approval,
  createdAt: "2026-08-01T10:00:00Z",
  updatedAt: "2026-10-10T10:00:00Z",
  owner: { memberId: 5, name: "Sarah Chen" },
  fileSizeKb: 842,
  updatedBy: s.id === 11 ? "Sarah Chen (marketer)" : null,
});
const detailOf = (s: Stored): ResumeDetail => ({
  row: rowOf(s),
  preview: { headline: s.role, summary: "Builds dependable services.", skills: ["Java", "Spring"], experience: [{ title: "Senior Engineer", employer: "Globex", startYear: 2020, endYear: null }] },
  actions: { setPrimary: true, setVisibility: true, decide: s.approval === "PENDING" || s.approval === "APPROVED", export: true },
});
const tile = (value: number, previous: number | null, series = [1, 2, 3, 4, 5, 6, 7, value]): ResumeTile => ({
  value,
  previous,
  delta: previous === null ? null : value - previous,
  deltaPercent: previous ? Math.round((1000 * (value - previous)) / previous) / 10 : null,
  series,
});

const seed = (): Stored[] => [
  { id: 11, consultant: "Jessica Davis", name: "Jessica Davis Resume", role: "Marketing Consultant", version: 3, primary: true, visibility: "INTERNAL", approval: "APPROVED", consultantId: 1 },
  { id: 12, consultant: "Jessica Davis", name: "Jessica Davis Resume (Growth)", role: "Growth Consultant", version: 1, primary: false, visibility: "PUBLIC", approval: "APPROVED", consultantId: 1 },
  { id: 13, consultant: "Michael Park", name: "Michael Park Resume", role: "Product Consultant", version: 2, primary: false, visibility: "PRIVATE", approval: "PENDING", consultantId: 2 },
];

function stubApi() {
  calls = [];
  overrides = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const u = new URL(input, "http://x");
      const raw = init.body;
      const call: Call = { method: init.method ?? "GET", url: input, path: u.pathname.replace(/^\/api\/orgs\/2\/resumes/, ""), params: u.searchParams, body: typeof raw === "string" ? JSON.parse(raw) : undefined, headers: (init.headers ?? {}) as Record<string, string> };
      calls.push(call);
      const r = answer(call);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {}, text: async () => "<html></html>" } as Response;
    }),
  );
}

function answer(c: Call): { status: number; body?: unknown } {
  for (const o of overrides) {
    const r = o(c);
    if (r) return r;
  }
  if (c.path === "" && c.method === "GET") {
    let items = [...store];
    if (c.params.get("tab") === "pending") items = items.filter((s) => s.approval === "PENDING");
    const vis = c.params.get("visibility");
    if (vis) items = items.filter((s) => s.visibility === vis);
    const q = (c.params.get("q") ?? "").toLowerCase();
    if (q) items = items.filter((s) => `${s.name} ${s.consultant} ${s.role}`.toLowerCase().includes(q));
    const size = Number(c.params.get("size") ?? 10);
    const page = Number(c.params.get("page") ?? 0);
    return { status: 200, body: { items: items.slice(page * size, page * size + size).map(rowOf), page, size, total: items.length, hasNext: false } };
  }
  if (c.path === "/counts") return { status: 200, body: counts };
  if (c.path === "/filters") return { status: 200, body: { departments: [{ value: "9", label: "Marketing" }], owners: [{ value: "5", label: "Sarah Chen" }] } };
  if (c.path === "/consultants") return { status: 200, body: [{ id: 1, name: "Jessica Davis", email: "jessica@acme.test" }] };
  const one = /^\/(\d+)(\/.*)?$/.exec(c.path);
  if (one) {
    const s = store.find((x) => x.id === Number(one[1]))!;
    const sub = one[2] ?? "";
    if (c.method === "GET" && sub === "") return { status: 200, body: detailOf(s) };
    if (c.method === "PUT" && sub === "/primary") {
      const on = (c.body as { primary: boolean }).primary;
      let lost: number | null = null;
      if (on) for (const o of store) if (o.consultantId === s.consultantId && o.primary && o.id !== s.id) {
        o.primary = false;
        lost = o.id;
      }
      s.primary = on;
      return { status: 200, body: { detail: detailOf(s), previousPrimaryId: lost } };
    }
    if (c.method === "PUT" && sub === "/visibility") {
      const previous = s.visibility;
      s.visibility = (c.body as { visibility: ResumeRow["visibility"] }).visibility;
      return { status: 200, body: { detail: detailOf(s), previous } };
    }
    if (c.method === "POST" && sub === "/decision") {
      const previous = s.approval;
      const d = (c.body as { decision: string }).decision;
      s.approval = d === "APPROVE" ? "APPROVED" : d === "REJECT" ? "REJECTED" : "PENDING";
      return { status: 200, body: { detail: detailOf(s), previous } };
    }
  }
  if (c.path === "/bulk" && c.method === "POST") {
    const b = c.body as { ids: number[]; action: string; visibility?: ResumeRow["visibility"] };
    const results = b.ids.map((id) => {
      const s = store.find((x) => x.id === id)!;
      if (b.action === "VISIBILITY") {
        const previous = s.visibility;
        s.visibility = b.visibility!;
        return { id, outcome: "APPLIED", reason: null, previous };
      }
      const previous = s.approval;
      s.approval = b.action === "APPROVE" ? "APPROVED" : b.action === "REJECT" ? "REJECTED" : "PENDING";
      return { id, outcome: "APPLIED", reason: null, previous };
    });
    return { status: 200, body: { applied: results.length, skipped: 0, results } };
  }
  return { status: 404, body: { error: "no" } };
}

const PERMS = { "resumes.view_for": "ORG", "resumes.edit_for": "ORG", "resumes.approve_request": "ORG" };

async function mount(over: { permissions?: Record<string, string>; url?: string } = {}) {
  window.history.replaceState(null, "", over.url ?? "/w/admin/resumes");
  const out = render(
    <ToastProvider>
      <ResumesPage orgId={2} orgName="Acme" workspace="admin" selfMemberId={1} permissions={over.permissions ?? PERMS} supportEmail={null} />
    </ToastProvider>,
  );
  await settle(0);
  return out;
}

const settle = async (ms = 50) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const rows = () => Array.from(document.querySelectorAll<HTMLElement>("tr[data-row-id]"));
const lists = () => calls.filter((c) => c.path === "" && c.method === "GET");
const drawerEl = () => document.querySelector<HTMLElement>("#ent-resume-sheet")!;
const calledWith = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

beforeEach(() => {
  vi.useFakeTimers();
  store = seed();
  counts = { asOf: "2026-10-13T10:00:00Z", scope: "ORG", total: tile(3, 2), primary: tile(1, null), needsApproval: tile(1, 2), updatedThisWeek: tile(3, 2) };
  stubApi();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Resumes: tiles and table", () => {
  it("shows the four tiles with their sparkline, and a delta only where the API gave one", async () => {
    await mount();
    expect(Array.from(document.querySelectorAll("[data-kpi]")).map((e) => e.getAttribute("data-kpi"))).toEqual(["total", "primary", "needsApproval", "updatedThisWeek"]);
    expect(document.querySelector("[data-kpi=total] [data-kpi-value]")?.textContent).toBe("3");
    expect(document.querySelector("[data-kpi=total] [data-kpi-delta]")?.textContent).toContain("+50%");
    expect(document.querySelector("[data-kpi=total] [data-kpi-delta]")?.textContent).toContain("vs last month");
    expect(document.querySelector("[data-kpi=updatedThisWeek] [data-kpi-delta]")?.textContent).toContain("vs last week");
    expect(document.querySelector("[data-kpi=primary] [data-kpi-delta]")).toBeNull();
    expect(document.querySelectorAll("[data-kpi-tiles] svg[data-sparkline]")).toHaveLength(4);
  });

  it("lists the resumes with the board columns and the first call carries the default sort", async () => {
    await mount();
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["11", "12", "13"]);
    const heads = Array.from(document.querySelectorAll("th")).map((h) => h.textContent?.trim());
    expect(heads).toEqual(expect.arrayContaining(["Consultant", "Resume Name", "Target Role", "Version", "Primary", "Visibility", "Status", "Last Modified", "Owner"]));
    expect(rows()[0].textContent).toContain("Jessica Davis Resume");
    expect(rows()[0].textContent).toContain("v3");
    expect(within(rows()[0]).getByText("Primary")).toBeTruthy();
    // "Modified <date> by <name>": the marketer who last changed it, by name and role; a row nobody is known to have changed says no name
    expect(rows()[0].querySelector("[data-modified-by]")?.textContent).toBe("by Sarah Chen (marketer)");
    expect(rows()[1].querySelector("[data-modified-by]")).toBeNull();
    expect(rows().every((r) => !r.textContent?.includes("ent#"))).toBe(true);
    expect(within(rows()[2]).getByText("Pending")).toBeTruthy();
    expect(within(rows()[2]).getByText("Private")).toBeTruthy();
    expect(document.querySelector("[data-range]")?.textContent).toBe("1-3 of 3 resumes");
    const first = lists()[0];
    expect(first.params.get("sort")).toBe("modified,desc");
    expect(first.params.get("tab")).toBe("all");
  });

  it("shows the bee help card once", async () => {
    await mount();
    expect(document.querySelectorAll("[data-help-bee]")).toHaveLength(1);
    expect(screen.getByText("Manage consultant resumes")).toBeTruthy();
  });
});

describe("Resumes: URL state", () => {
  it("switches tab, writes it to the URL and asks the API for it", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: /Pending Approval/ }));
    await settle();
    expect(window.location.search).toBe("?tab=pending");
    expect(lists().at(-1)!.params.get("tab")).toBe("pending");
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["13"]);
    fireEvent.click(screen.getByRole("tab", { name: /All Resumes/ }));
    await settle();
    expect(window.location.search).toBe("");
  });

  it("opens a shared link with the tab, the filter and the drawer already applied", async () => {
    await mount({ url: "/w/admin/resumes?tab=pending&vis=PRIVATE&open=13" });
    expect(lists()[0].params.get("tab")).toBe("pending");
    expect(lists()[0].params.get("visibility")).toBe("PRIVATE");
    expect(document.querySelector("[data-detail-body]")?.getAttribute("data-resume-id")).toBe("13");
  });

  it("filters by visibility from the bar", async () => {
    await mount();
    fireEvent.click(document.querySelector('[role=search] button[aria-label="Visibility"]')!);
    fireEvent.click(screen.getByRole("option", { name: "Public" }));
    await settle();
    expect(window.location.search).toContain("vis=PUBLIC");
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["12"]);
  });

  it("searches after the typing rests", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search resumes"), { target: { value: "michael" } });
    await settle(400);
    expect(window.location.search).toBe("?q=michael");
    expect(rows().map((r) => r.getAttribute("data-row-id"))).toEqual(["13"]);
  });

  it("sorts by a header and keeps the direction in aria-sort and the URL", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Consultant" }));
    await settle();
    expect(window.location.search).toBe("?sort=consultant%2Casc");
    expect(document.querySelector("th[aria-sort=ascending]")?.textContent).toContain("Consultant");
  });

  it("switches to the grid view and back", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    await settle();
    expect(window.location.search).toBe("?view=grid");
    expect(document.querySelector("[data-resume-cards=grid]")).toBeTruthy();
    expect(document.querySelector("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await settle();
    expect(document.querySelector("table")).toBeTruthy();
  });
});

describe("Resumes: the drawer", () => {
  const open = async (id: number) => {
    fireEvent.click(document.querySelector(`tr[data-row-id="${id}"]`)!);
    await settle();
  };

  it("opens from a row with the preview, the facts and the controls, and writes the id to the URL", async () => {
    await mount();
    await open(11);
    expect(window.location.search).toBe("?open=11");
    const body = document.querySelector("[data-detail-body]")!;
    expect(body.querySelector("h3")?.textContent).toBe("Jessica Davis");
    expect(body.querySelector("[data-resume-paper]")?.textContent).toContain("Globex");
    expect(body.querySelector("[data-resume-paper]")?.textContent).toContain("Java");
    expect(within(body as HTMLElement).getByText("v3 (Latest)")).toBeTruthy();
    expect(within(body as HTMLElement).getByText("842 KB")).toBeTruthy();
    for (const name of ["Preview", "Print", "Set as Primary"]) expect(within(body as HTMLElement).getByRole("button", { name })).toBeTruthy();
    expect(body.querySelector('a[download][href$="/api/orgs/2/resumes/11/export?format=txt"]')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/phone|\(555\)/i);
  });

  it("closing the drawer clears the id from the URL", async () => {
    await mount();
    await open(11);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await settle();
    expect(window.location.search).toBe("");
  });

  it("sets another resume as primary on the toggle, saves at once, and Undo gives the old one back", async () => {
    await mount();
    await open(12);
    fireEvent.click(screen.getByRole("switch", { name: "Primary resume" }));
    await settle();
    expect(calledWith("PUT", "/12/primary")[0].body).toEqual({ primary: true });
    expect(store.find((s) => s.id === 12)!.primary).toBe(true);
    expect(store.find((s) => s.id === 11)!.primary).toBe(false);
    expect(screen.getByText(/is now the primary resume/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(calledWith("PUT", "/11/primary")[0].body).toEqual({ primary: true });
    expect(store.find((s) => s.id === 11)!.primary).toBe(true);
    expect(store.find((s) => s.id === 12)!.primary).toBe(false);
  });

  it("will not offer primary on a resume that is not approved", async () => {
    await mount();
    await open(13);
    expect((screen.getByRole("switch", { name: "Primary resume" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Set as Primary" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Only an approved resume can be the primary one.")).toBeTruthy();
  });

  it("changes visibility from the select with an Undo", async () => {
    await mount();
    await open(11);
    fireEvent.click(within(drawerEl()).getByLabelText("Visibility", { selector: "button" }));
    fireEvent.click(screen.getByRole("option", { name: "Private (Owner and marketer only)" }));
    await settle();
    expect(calledWith("PUT", "/11/visibility")[0].body).toEqual({ visibility: "PRIVATE" });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(calledWith("PUT", "/11/visibility")[1].body).toEqual({ visibility: "INTERNAL" });
    expect(store[0].visibility).toBe("INTERNAL");
  });

  it("approves a pending resume and Undo puts it back to pending", async () => {
    await mount();
    await open(13);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await settle();
    expect(calledWith("POST", "/13/decision")[0].body).toMatchObject({ decision: "APPROVE" });
    expect(store[2].approval).toBe("APPROVED");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(calledWith("POST", "/13/decision")[1].body).toMatchObject({ decision: "REOPEN" });
    expect(store[2].approval).toBe("PENDING");
  });

  it("says why a change was refused", async () => {
    await mount();
    await open(11);
    overrides.push((c) => (c.method === "PUT" && c.path === "/11/visibility" ? { status: 404, body: { error: "Not found.", code: "NOT_FOUND" } } : undefined));
    fireEvent.click(within(drawerEl()).getByLabelText("Visibility", { selector: "button" }));
    fireEvent.click(screen.getByRole("option", { name: "Public (Shareable with clients)" }));
    await settle();
    expect(screen.getByText("This resume is no longer in your view.")).toBeTruthy();
  });

  it("hides the controls the API did not allow", async () => {
    await mount();
    overrides.push((c) => (c.method === "GET" && c.path === "/11" ? { status: 200, body: { ...detailOf(store[0]), actions: { setPrimary: false, setVisibility: false, decide: false, export: true } } } : undefined));
    await open(11);
    expect((screen.getByRole("switch", { name: "Primary resume" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("Resumes: bulk", () => {
  const select = (...names: string[]) => names.forEach((n) => fireEvent.click(screen.getByRole("checkbox", { name: `Select ${n}` })));

  it("approves the ticked resumes with an Idempotency-Key and Undo reopens them", async () => {
    await mount();
    select("Michael Park Resume");
    expect(document.querySelector("[data-bulk-bar]")?.textContent).toContain("1 selected");
    fireEvent.click(within(document.querySelector("[data-bulk-bar]") as HTMLElement).getByRole("button", { name: "Approve" }));
    await settle();
    const bulk = calledWith("POST", "/bulk")[0];
    expect(bulk.headers["idempotency-key"]).toBeTruthy();
    expect(bulk.body).toEqual({ ids: [13], action: "APPROVE" });
    expect(screen.getByText("1 resume approved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle();
    expect(calledWith("POST", "/bulk")[1].body).toEqual({ ids: [13], action: "REOPEN" });
    expect(store[2].approval).toBe("PENDING");
  });

  it("offers approval only to someone who holds the approval key", async () => {
    await mount({ permissions: { "resumes.view_for": "ASSIGNED", "resumes.edit_for": "ASSIGNED" } });
    select("Michael Park Resume");
    expect(within(document.querySelector("[data-bulk-bar]") as HTMLElement).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(document.querySelector("[data-upload-open]")).toBeTruthy();
  });
});

describe("Resumes: upload", () => {
  it("is hidden without the edit key", async () => {
    await mount({ permissions: { "resumes.view_for": "ORG" } });
    expect(document.querySelector("[data-upload-open]")).toBeNull();
  });

  it("records a resume from the form with an Idempotency-Key, then opens it", async () => {
    await mount();
    overrides.push((c) =>
      c.method === "POST" && c.path === "" ? { status: 201, body: detailOf({ id: 99, consultant: "Jessica Davis", name: "New Resume", role: "Engineer", version: 1, primary: false, visibility: "INTERNAL", approval: "PENDING", consultantId: 1 }) } : undefined,
    );
    fireEvent.click(document.querySelector("[data-upload-open]")!);
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Upload Resume" });
    expect((within(dialog).getByRole("button", { name: "Add resume" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText("Consultant", { selector: "button" }));
    fireEvent.click(screen.getByRole("option", { name: /Jessica Davis/ }));
    fireEvent.change(within(dialog).getByLabelText("Resume name"), { target: { value: "New Resume" } });
    await settle();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add resume" }));
    await settle();
    const post = calledWith("POST", "")[0];
    expect(post.headers["idempotency-key"]).toBeTruthy();
    expect(post.body).toMatchObject({ consultantId: 1, name: "New Resume", visibility: "INTERNAL" });
    expect(window.location.search).toBe("?open=99");
    expect(screen.getByText("New Resume was added")).toBeTruthy();
  });

  it("holds the submit while the text looks like a sensitive number, and shows the server refusal otherwise", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-upload-open]")!);
    await settle();
    const dialog = screen.getByRole("dialog", { name: "Upload Resume" });
    fireEvent.click(within(dialog).getByLabelText("Consultant", { selector: "button" }));
    fireEvent.click(screen.getByRole("option", { name: /Jessica Davis/ }));
    fireEvent.change(within(dialog).getByLabelText("Resume name"), { target: { value: "Resume" } });
    fireEvent.change(within(dialog).getByLabelText("Professional summary"), { target: { value: "My SSN is 123-45-6789" } });
    await settle();
    expect((within(dialog).getByRole("button", { name: "Add resume" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getAllByRole("alert").length).toBeGreaterThan(0);
    fireEvent.change(within(dialog).getByLabelText("Professional summary"), { target: { value: "Fine summary" } });
    await settle();
    overrides.push((c) => (c.method === "POST" && c.path === "" ? { status: 422, body: { error: "We never store it", code: "SENSITIVE_CONTENT" } } : undefined));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add resume" }));
    await settle();
    expect(within(dialog).getByText(/sensitive personal data/i)).toBeTruthy();
  });
});

describe("Resumes: empty and error states", () => {
  it("says nothing matches and offers to clear the filters", async () => {
    await mount({ url: "/w/admin/resumes?q=zzz" });
    overrides.push((c) => (c.path === "" && c.method === "GET" ? { status: 200, body: { items: [], page: 0, size: 10, total: 0, hasNext: false } } : undefined));
    fireEvent.change(screen.getByLabelText("Search resumes"), { target: { value: "zzzz" } });
    await settle(400);
    expect(screen.getByText("No resumes match")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Clear filters" }).length).toBeGreaterThan(0);
  });

  it("explains an empty pending tab", async () => {
    store = store.filter((s) => s.approval !== "PENDING");
    await mount({ url: "/w/admin/resumes?tab=pending" });
    expect(screen.getByText("Nothing is waiting for approval")).toBeTruthy();
  });

  it("shows an error with a retry when the list cannot load, and dashes where a tile failed", async () => {
    overrides.push((c) => (c.method === "GET" && (c.path === "" || c.path === "/counts") ? { status: 500, body: { error: "boom" } } : undefined));
    await mount();
    expect(screen.getByRole("button", { name: /Try again|Retry/ })).toBeTruthy();
    expect(document.querySelector("[data-kpi=total] [data-kpi-value]")?.textContent).toBe("—");
  });
});
