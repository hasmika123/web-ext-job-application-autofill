import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { Resume } from "@/components/ResumeList";
import { QUICK_TIPS, VIEW_STORAGE_KEY } from "./constants";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/components/app-v2/resume/ResumeDrawer", () => ({ default: () => <div data-testid="drawer" /> }));
const createBuilt = vi.fn();
vi.mock("@/lib/resume-doc", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-doc")>()),
  createBuilt: (...a: unknown[]) => createBuilt(...a),
}));

import MyResumesPage from "./MyResumesPage";

const resumes = (): (Resume & { updatedAt?: string })[] => [
  // primary, up to date
  { id: 1, label: "Software Engineer", kind: "BUILT", templateId: "modern", defaultResume: true, archived: false, createdAt: "2026-09-15T12:00:00Z", updatedAt: "2026-10-10T12:00:00Z", contentHash: "a", exportedHash: "a" },
  // PDF out of date
  { id: 2, label: "Product Manager", kind: "BUILT", templateId: "modern", defaultResume: false, archived: false, createdAt: "2026-09-20T12:00:00Z", updatedAt: "2026-10-08T12:00:00Z", contentHash: "b", exportedHash: "a" },
  // an uploaded file, no created date known
  { id: 3, label: "Data Analyst", kind: "UPLOADED", defaultResume: false, archived: false, createdAt: null },
  // archived
  { id: 4, label: "AI/ML Engineer", kind: "UPLOADED", defaultResume: false, archived: true, createdAt: "2026-08-10T12:00:00Z" },
];

const renderPage = (rs: Resume[] = resumes()) =>
  render(
    <ToastProvider>
      <MyResumesPage resumes={rs} usage={{}} baseProfile={{}} isPro={false} />
    </ToastProvider>,
  );

const names = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const tab = (re: RegExp) => screen.getByRole("tab", { name: re });
const pick = (control: string, option: string) => {
  fireEvent.click(screen.getByRole("button", { name: control }));
  fireEvent.click(screen.getByRole("option", { name: option }));
};

beforeEach(() => {
  window.localStorage.clear();
  createBuilt.mockReset();
  push.mockReset();
});
afterEach(cleanup);

describe("My Resumes: tabs, counts, filter, sort, search", () => {
  it("shows the hero and a count on every tab", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "My Resumes" })).toBeTruthy();
    expect(tab(/^All Resumes/).textContent).toContain("4");
    expect(tab(/^Active/).textContent).toContain("3");
    expect(tab(/^Drafts/).textContent).toContain("0");
    expect(tab(/^Archived/).textContent).toContain("1");
  });

  it("lists newest-modified first by default", () => {
    renderPage();
    // Data Analyst has no modified time at all -> last; Software Engineer was modified last.
    expect(names()).toEqual(["Software Engineer", "Product Manager", "AI/ML Engineer", "Data Analyst"]);
  });

  it("tabs filter the cards", () => {
    renderPage();
    fireEvent.click(tab(/^Archived/));
    expect(names()).toEqual(["AI/ML Engineer"]);
    fireEvent.click(tab(/^Active/));
    expect(names()).toEqual(["Software Engineer", "Product Manager", "Data Analyst"]);
    expect(tab(/^Active/).getAttribute("aria-selected")).toBe("true");
  });

  it("Drafts is empty when no resume is a draft, with its own empty state", () => {
    renderPage();
    fireEvent.click(tab(/^Drafts/));
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(screen.getByText("No drafts yet")).toBeTruthy();
  });

  it("the server's lifecycle fills the Drafts tab, and drafts are not in Active", () => {
    const rs = resumes();
    rs[1] = { ...rs[1], lifecycle: "DRAFT" };
    rs[0] = { ...rs[0], lifecycle: "ACTIVE" };
    rs[3] = { ...rs[3], lifecycle: "ARCHIVED" };
    renderPage(rs);
    expect(tab(/^Drafts/).textContent).toContain("1");
    expect(tab(/^Active/).textContent).toContain("2");
    fireEvent.click(tab(/^Drafts/));
    expect(names()).toEqual(["Product Manager"]);
    const card = document.querySelector('[data-resume-id="2"]') as HTMLElement;
    expect(within(card).getByText("Draft")).toBeTruthy();
  });

  it("shows a resume's own tags and finds it by tag or target", () => {
    const rs = resumes();
    rs[1] = { ...rs[1], tags: ["backend", "remote"], target: "Staff Platform Engineer" };
    renderPage(rs);
    const card = document.querySelector('[data-resume-id="2"]') as HTMLElement;
    expect(within(card).getByText("backend")).toBeTruthy();
    expect(within(card).queryByText("Built")).toBeNull();
    const box = screen.getByRole("searchbox", { name: "Search resumes" });
    fireEvent.change(box, { target: { value: "platform" } });
    expect(names()).toEqual(["Product Manager"]);
    fireEvent.change(box, { target: { value: "remote" } });
    expect(names()).toEqual(["Product Manager"]);
  });

  it("search narrows by name and offers to clear when nothing matches", () => {
    renderPage();
    const box = screen.getByRole("searchbox", { name: "Search resumes" });
    fireEvent.change(box, { target: { value: "product" } });
    expect(names()).toEqual(["Product Manager"]);
    // tab counts stay whole-list counts
    expect(tab(/^All Resumes/).textContent).toContain("4");

    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No resumes match")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(names()).toHaveLength(4);
  });

  it("the status filter keeps Primary, Active and Archived apart", () => {
    renderPage();
    pick("Status", "Primary");
    expect(names()).toEqual(["Software Engineer"]);
    pick("Status", "Archived");
    expect(names()).toEqual(["AI/ML Engineer"]);
    pick("Status", "Draft");
    expect(screen.getByText("No resumes match")).toBeTruthy();
    pick("Status", "All Status");
    expect(names()).toHaveLength(4);
  });

  it("sorts by name and by date created", () => {
    renderPage();
    pick("Sort by", "Name (A-Z)");
    expect(names()).toEqual(["AI/ML Engineer", "Data Analyst", "Product Manager", "Software Engineer"]);
    pick("Sort by", "Date Created");
    // newest created first; Data Analyst has no created date -> last
    expect(names()).toEqual(["Product Manager", "Software Engineer", "AI/ML Engineer", "Data Analyst"]);
  });
});

describe("My Resumes: cards", () => {
  it("shows Primary, Active and Archived chips, ATS Friendly and the PDF state", () => {
    renderPage();
    const first = document.querySelector('[data-resume-id="1"]') as HTMLElement;
    expect(within(first).getByText("Primary")).toBeTruthy();
    expect(within(first).getByText("ATS Friendly")).toBeTruthy();
    expect(within(first).queryByText("PDF out of date")).toBeNull();

    const second = document.querySelector('[data-resume-id="2"]') as HTMLElement;
    expect(within(second).getByText("Active")).toBeTruthy();
    expect(within(second).getByText("PDF out of date")).toBeTruthy();

    const archived = document.querySelector('[data-resume-id="4"]') as HTMLElement;
    expect(within(archived).getByText("Archived")).toBeTruthy();
    // uploaded: no template, so no ATS chip
    expect(within(archived).queryByText("ATS Friendly")).toBeNull();
  });

  it("shows 'PDF updating…' and 'PDF failed' from the API's PDF job state (R3.7)", () => {
    renderPage([
      { id: 1, label: "Pending one", kind: "BUILT", templateId: "modern", archived: false, pdf: { status: "PENDING" } },
      { id: 2, label: "Stale one", kind: "BUILT", templateId: "modern", archived: false, pdf: { status: "STALE" } },
      { id: 3, label: "Failed one", kind: "BUILT", templateId: "modern", archived: false, pdf: { status: "FAILED" } },
      { id: 4, label: "Ready one", kind: "BUILT", templateId: "modern", archived: false, pdf: { status: "READY" }, contentHash: "b", exportedHash: "a" },
    ]);
    const card = (id: number) => document.querySelector(`[data-resume-id="${id}"]`) as HTMLElement;
    expect(within(card(1)).getByText("PDF updating…")).toBeTruthy();
    expect(within(card(2)).getByText("PDF updating…")).toBeTruthy();
    expect(within(card(3)).getByText("PDF failed")).toBeTruthy();
    // READY wins over the legacy hash comparison: no "out of date" chip
    expect(within(card(4)).queryByText("PDF out of date")).toBeNull();
    expect(within(card(4)).queryByText("PDF updating…")).toBeNull();
  });

  it("hides the Created / Modified rows the API does not provide", () => {
    renderPage();
    const first = document.querySelector('[data-resume-id="1"]') as HTMLElement;
    expect(within(first).getByText(/^Created .*2026$/)).toBeTruthy();
    expect(within(first).getByText(/^Modified .*2026$/)).toBeTruthy();
    const noDates = document.querySelector('[data-resume-id="3"]') as HTMLElement;
    expect(within(noDates).queryByText(/Created/)).toBeNull();
    expect(within(noDates).queryByText(/Modified/)).toBeNull();
  });

  it("Edit opens the editor for a built resume; the unbuilt actions say Coming soon", async () => {
    renderPage();
    const first = document.querySelector('[data-resume-id="1"]') as HTMLElement;
    expect(within(first).getByRole("link", { name: "Edit Software Engineer" }).getAttribute("href")).toBe("/resume-builder/1");
    fireEvent.click(within(first).getByRole("button", { name: "Duplicate Software Engineer" }));
    expect(await screen.findByText("Coming soon")).toBeTruthy();
  });

  it("Edit on an uploaded file opens the manage panel", () => {
    renderPage();
    const up = document.querySelector('[data-resume-id="3"]') as HTMLElement;
    fireEvent.click(within(up).getByRole("button", { name: "Edit Data Analyst" }));
    expect(screen.getByTestId("drawer")).toBeTruthy();
  });

  it("lists Popular Templates from the registry and the four Quick Tips", () => {
    renderPage();
    expect(screen.getByAltText("Modern template")).toBeTruthy();
    for (const tip of QUICK_TIPS) expect(screen.getByText(tip)).toBeTruthy();
  });
});

describe("My Resumes: grid / list toggle", () => {
  it("defaults to grid, switches to list and remembers it", () => {
    const { unmount } = renderPage();
    const grid = screen.getByRole("button", { name: "Grid view" });
    const list = screen.getByRole("button", { name: "List view" });
    expect(grid.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-view]")!.getAttribute("data-view")).toBe("grid");

    fireEvent.click(list);
    expect(list.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-view]")!.getAttribute("data-view")).toBe("list");
    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBe("list");

    unmount();
    renderPage();
    expect(document.querySelector("[data-view]")!.getAttribute("data-view")).toBe("list");
  });

  it("still works when storage throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(document.querySelector("[data-view]")!.getAttribute("data-view")).toBe("list");
    get.mockRestore();
    set.mockRestore();
  });
});

describe("My Resumes: empty state and New Resume", () => {
  it("with no resumes shows the empty state, zero counts and a working New Resume", async () => {
    createBuilt.mockResolvedValue({ kind: "ok", id: 55 });
    renderPage([]);
    expect(screen.getByText("No resumes yet")).toBeTruthy();
    expect(tab(/^All Resumes/).textContent).toContain("0");
    const btn = screen.getAllByRole("button", { name: /New Resume/ });
    expect(btn.length).toBeGreaterThan(0);
    fireEvent.click(btn[btn.length - 1]);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/resume-builder/55"));
  });

  it("shows the plan-limit notice when the API answers 402", async () => {
    createBuilt.mockResolvedValue({ kind: "limit", plan: "FREE", message: "Free accounts keep up to 3 resumes." });
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: /New Resume/ })[0]);
    expect((await screen.findByRole("alert")).textContent).toContain("Free accounts keep up to 3 resumes.");
    expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/pricing");
    expect(push).not.toHaveBeenCalled();
  });
});
