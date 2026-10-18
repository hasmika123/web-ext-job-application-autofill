import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { Resume } from "@/components/ResumeList";
import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { QUICK_TIPS, VIEW_STORAGE_KEY } from "./constants";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/components/app-v2/resume/ResumeDrawer", () => ({ default: () => <div data-testid="drawer" /> }));
const createBuilt = vi.fn();
vi.mock("@/lib/resume-doc", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-doc")>()),
  createBuilt: (...a: unknown[]) => createBuilt(...a),
}));
const api = { duplicateResume: vi.fn(), importUploaded: vi.fn(), patchResumeMeta: vi.fn(), deleteResume: vi.fn(), attachOriginal: vi.fn() };
vi.mock("@/lib/resume-list-api", () => ({
  duplicateResume: (...a: unknown[]) => api.duplicateResume(...a),
  importUploaded: (...a: unknown[]) => api.importUploaded(...a),
  patchResumeMeta: (...a: unknown[]) => api.patchResumeMeta(...a),
  deleteResume: (...a: unknown[]) => api.deleteResume(...a),
  attachOriginal: (...a: unknown[]) => api.attachOriginal(...a),
}));

import MyResumesPage from "./MyResumesPage";

type Row = Resume & { score?: number | null };

const resumes = (): Row[] => [
  // primary, up to date
  { id: 1, label: "Software Engineer", kind: "BUILT", templateId: "modern", defaultResume: true, archived: false, createdAt: "2026-09-15T12:00:00Z", updatedAt: "2026-10-10T12:00:00Z", contentHash: "a", exportedHash: "a", score: 82 },
  // PDF out of date
  { id: 2, label: "Product Manager", kind: "BUILT", templateId: "modern", defaultResume: false, archived: false, createdAt: "2026-09-20T12:00:00Z", updatedAt: "2026-10-08T12:00:00Z", contentHash: "b", exportedHash: "a" },
  // an uploaded file, no created date known
  { id: 3, label: "Data Analyst", kind: "UPLOADED", defaultResume: false, archived: false, createdAt: null },
  // archived
  { id: 4, label: "AI/ML Engineer", kind: "UPLOADED", defaultResume: false, archived: true, createdAt: "2026-08-10T12:00:00Z" },
];

const cfg = (over: Partial<ResumeBuilderConfig> = {}): ResumeBuilderConfig => ({ ...DEFAULT_BUILDER_CONFIG, resumes: { count: 3, max: 25 }, ...over });

const renderPage = (rs: Resume[] = resumes(), config: ResumeBuilderConfig = cfg(), profile = { itemCount: 2, roles: 1, schools: 1, skills: 4, score: 60, headline: null }) =>
  render(
    <ToastProvider>
      <MyResumesPage resumes={rs} usage={{}} baseProfile={{}} isPro={config.plan !== "FREE"} config={config} profile={profile} />
    </ToastProvider>,
  );

const names = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const tab = (re: RegExp) => screen.getByRole("tab", { name: re });
const card = (id: number) => document.querySelector(`[data-resume-id="${id}"]`) as HTMLElement;
const pickSort = (option: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Sort by" }));
  fireEvent.click(screen.getByRole("option", { name: option }));
};
const pickStatus = (item: string) => {
  fireEvent.click(screen.getByRole("button", { name: /Status filter/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
};
const openCardMenu = (id: number, name: string) => fireEvent.click(within(card(id)).getByRole("button", { name: `More actions for ${name}` }));

beforeEach(() => {
  window.localStorage.clear();
  createBuilt.mockReset();
  push.mockReset();
  refresh.mockReset();
  Object.values(api).forEach((f) => f.mockReset());
  api.patchResumeMeta.mockResolvedValue({ kind: "ok" });
  api.deleteResume.mockResolvedValue({ kind: "ok" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
    expect(within(card(2)).getByText("Draft")).toBeTruthy();
  });

  it("shows a resume's own tags and target and finds it by tag, target or template name", () => {
    const rs = resumes();
    rs[1] = { ...rs[1], tags: ["backend", "remote"], target: "Staff Platform Engineer" };
    renderPage(rs);
    expect(within(card(2)).getByText("backend")).toBeTruthy();
    expect(within(card(2)).getByText("Staff Platform Engineer")).toBeTruthy();
    expect(within(card(2)).queryByText("Built")).toBeNull();
    const box = screen.getByRole("searchbox", { name: "Search resumes" });
    fireEvent.change(box, { target: { value: "platform" } });
    expect(names()).toEqual(["Product Manager"]);
    fireEvent.change(box, { target: { value: "remote" } });
    expect(names()).toEqual(["Product Manager"]);
    fireEvent.change(box, { target: { value: "modern" } });
    expect(names()).toEqual(["Software Engineer", "Product Manager"]);
  });

  it("search narrows by name and offers to clear when nothing matches", () => {
    renderPage();
    const box = screen.getByRole("searchbox", { name: "Search resumes" });
    fireEvent.change(box, { target: { value: "product" } });
    expect(names()).toEqual(["Product Manager"]);
    // tab counts stay whole-list counts
    expect(tab(/^All Resumes/).textContent).toContain("4");

    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No resumes match “zzz”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(names()).toHaveLength(4);
  });

  it("the status menu keeps Primary, Active and Archived apart, with a Type group beside it", () => {
    renderPage();
    pickStatus("Primary");
    expect(names()).toEqual(["Software Engineer"]);
    pickStatus("Archived");
    expect(names()).toEqual(["AI/ML Engineer"]);
    pickStatus("Draft");
    expect(screen.getByText("No resumes match")).toBeTruthy();
    pickStatus("All Status");
    expect(names()).toHaveLength(4);

    pickStatus("Uploaded");
    expect(names()).toEqual(["AI/ML Engineer", "Data Analyst"]);
    pickStatus("Built");
    expect(names()).toEqual(["Software Engineer", "Product Manager"]);
    // choosing the active type again clears it
    pickStatus("Built");
    expect(names()).toHaveLength(4);
  });

  it("Type and Status combine", () => {
    const rs = resumes();
    rs[1] = { ...rs[1], role: "TAILORED" };
    renderPage(rs);
    pickStatus("Tailored");
    expect(names()).toEqual(["Product Manager"]);
    pickStatus("Primary");
    expect(screen.getByText("No resumes match")).toBeTruthy();
  });

  it("sorts by name, by date created, by score and by last exported", () => {
    const rs = resumes();
    rs[0] = { ...rs[0], score: 64, exportedAt: "2026-10-01T00:00:00Z" };
    rs[1] = { ...rs[1], score: 91, exportedAt: "2026-10-09T00:00:00Z" };
    renderPage(rs);
    pickSort("Name (A-Z)");
    expect(names()).toEqual(["AI/ML Engineer", "Data Analyst", "Product Manager", "Software Engineer"]);
    pickSort("Date Created");
    // newest created first; Data Analyst has no created date -> last
    expect(names()).toEqual(["Product Manager", "Software Engineer", "AI/ML Engineer", "Data Analyst"]);
    pickSort("Score");
    // highest first; resumes with no score keep a stable order after
    expect(names().slice(0, 2)).toEqual(["Product Manager", "Software Engineer"]);
    pickSort("Last Exported");
    expect(names().slice(0, 2)).toEqual(["Product Manager", "Software Engineer"]);
  });
});

describe("My Resumes: cards", () => {
  it("shows Primary, Active and Archived chips, ATS Friendly and the PDF state", () => {
    renderPage();
    const first = card(1);
    expect(within(first).getByText("Primary")).toBeTruthy();
    expect(within(first).getByText("ATS Friendly")).toBeTruthy();
    expect(within(first).queryByText("PDF out of date")).toBeNull();
    expect(within(first).getByText("82% score")).toBeTruthy(); // the Resume Score badge (R2.5), built resumes only

    const second = card(2);
    expect(within(second).getByText("Active")).toBeTruthy();
    expect(within(second).getByText("PDF out of date")).toBeTruthy();
    expect(within(second).queryByText(/% score/)).toBeNull(); // never scored

    const archived = card(4);
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
    expect(within(card(1)).getByText("PDF updating…")).toBeTruthy();
    expect(within(card(2)).getByText("PDF updating…")).toBeTruthy();
    expect(within(card(3)).getByText("PDF failed")).toBeTruthy();
    // READY wins over the legacy hash comparison: no "out of date" chip
    expect(within(card(4)).queryByText("PDF out of date")).toBeNull();
    expect(within(card(4)).queryByText("PDF updating…")).toBeNull();
  });

  it("shows an 'N% score' badge when the API reports a score, and none when it does not", () => {
    const rs = resumes();
    rs[0] = { ...rs[0], score: 82 };
    rs[1] = { ...rs[1], score: 41 };
    renderPage(rs);
    expect(within(card(1)).getByText("82% score")).toBeTruthy();
    expect(within(card(2)).getByText("41% score")).toBeTruthy();
    expect(within(card(3)).queryByText(/% score/)).toBeNull();
  });

  it("hides the Created / Modified rows the API does not provide", () => {
    renderPage();
    expect(within(card(1)).getByText(/^Created .*2026$/)).toBeTruthy();
    expect(within(card(1)).getByText(/^Modified .*2026$/)).toBeTruthy();
    expect(within(card(3)).queryByText(/Created/)).toBeNull();
    expect(within(card(3)).queryByText(/Modified/)).toBeNull();
  });

  it("the action buttons build the right hrefs: edit, view (?view=pdf) and AI (?tab=ai)", () => {
    renderPage([{ ...resumes()[0] }], cfg({ aiAllowed: true, plan: "PRO" }));
    const first = card(1);
    expect(within(first).getByRole("link", { name: "Edit Software Engineer" }).getAttribute("href")).toBe("/resume-builder/1");
    expect(within(first).getByRole("link", { name: "View Software Engineer" }).getAttribute("href")).toBe("/resume-builder/1?view=pdf");
    expect(within(first).getByRole("link", { name: "AI tools for Software Engineer" }).getAttribute("href")).toBe("/resume-builder/1?tab=ai");
  });

  it("the AI action is a lock that leads to the plans on Free", () => {
    renderPage([{ ...resumes()[0] }], cfg({ aiAllowed: false }));
    const lock = within(card(1)).getByRole("link", { name: "AI tools for Software Engineer (Pro)" });
    expect(lock.getAttribute("href")).toBe("/pricing");
    expect(lock.closest("[data-tooltip-trigger]")).not.toBeNull(); // the lock explains itself in a tooltip
  });

  it("View on an uploaded file opens the stored file, and it has no AI action", () => {
    renderPage();
    const up = card(3);
    expect(within(up).getByRole("link", { name: "View Data Analyst" }).getAttribute("href")).toBe("/api/resumes/3/file");
    expect(within(up).queryByRole("link", { name: /AI tools/ })).toBeNull();
  });

  it("Set as Primary in the card menu patches meta and refreshes; the primary card does not offer it", async () => {
    api.patchResumeMeta.mockResolvedValue({ kind: "ok" });
    renderPage();
    const primary = document.querySelector('[data-resume-id="1"]') as HTMLElement;
    fireEvent.click(within(primary).getByText("More actions for Software Engineer"));
    expect(screen.queryByRole("menuitem", { name: "Set as Primary" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });

    const second = document.querySelector('[data-resume-id="2"]') as HTMLElement;
    fireEvent.click(within(second).getByText("More actions for Product Manager"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Set as Primary" }));
    await screen.findByText("Product Manager is now your primary resume");
    expect(api.patchResumeMeta).toHaveBeenCalledWith(2, { primary: true });
    expect(refresh).toHaveBeenCalled();
  });

  it("Set as Primary says why it failed and does not refresh", async () => {
    api.patchResumeMeta.mockResolvedValue({ kind: "error", status: 422, message: "An archived resume cannot be primary" });
    renderPage();
    const second = document.querySelector('[data-resume-id="2"]') as HTMLElement;
    fireEvent.click(within(second).getByText("More actions for Product Manager"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Set as Primary" }));
    expect(await screen.findByText("An archived resume cannot be primary")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Edit on an uploaded file converts it and opens the builder, not the manage panel", async () => {
    api.importUploaded.mockResolvedValue({ kind: "ok" });
    renderPage();
    fireEvent.click(within(card(3)).getByRole("button", { name: "Edit Data Analyst" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resume-builder/3"));
    expect(api.importUploaded).toHaveBeenCalledWith(3);
    expect(screen.queryByTestId("drawer")).toBeNull();
  });

  it("a failed conversion stays on the list with an error", async () => {
    api.importUploaded.mockResolvedValue({ kind: "error", message: "nope" });
    renderPage();
    fireEvent.click(within(card(3)).getByRole("button", { name: "Edit Data Analyst" }));
    expect(await screen.findByText("Couldn't open it in the builder")).toBeTruthy();
    expect(push).not.toHaveBeenCalledWith("/resume-builder/3");
  });

  it("Duplicate makes a copy and opens it in the editor", async () => {
    api.duplicateResume.mockResolvedValue({ kind: "ok", id: 91 });
    renderPage();
    fireEvent.click(within(card(1)).getByRole("button", { name: "Duplicate Software Engineer" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resume-builder/91"));
    expect(api.duplicateResume).toHaveBeenCalledWith(1);
  });

  it("a Duplicate that hits the plan's cap shows the upgrade notice instead", async () => {
    api.duplicateResume.mockResolvedValue({ kind: "limit", plan: "FREE", message: "Free accounts keep up to 3 resumes." });
    renderPage();
    fireEvent.click(within(card(1)).getByRole("button", { name: "Duplicate Software Engineer" }));
    // the server's 402 (a stale client count) opens the same dialog
    expect(await screen.findByRole("dialog", { name: /used \d+ of \d+ resumes/ })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("My Resumes: the ⋮ menu", () => {
  it("a built card offers Open, Settings, Duplicate, Rename, Set as Primary, Archive and Delete", () => {
    renderPage();
    openCardMenu(2, "Product Manager");
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).toEqual(["Open", "Settings", "Duplicate", "Rename", "Set as Primary", "Archive", "Delete"]);
  });

  it("Settings opens the editor with Resume settings showing", () => {
    renderPage();
    openCardMenu(2, "Product Manager");
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(push).toHaveBeenCalledWith("/resume-builder/2?view=settings");
  });

  it("the primary resume is not offered Set as Primary", () => {
    renderPage();
    openCardMenu(1, "Software Engineer");
    expect(screen.queryByRole("menuitem", { name: "Set as Primary" })).toBeNull();
  });

  it("an uploaded card can be opened in the builder", async () => {
    api.importUploaded.mockResolvedValue({ kind: "ok" });
    renderPage();
    openCardMenu(3, "Data Analyst");
    fireEvent.click(screen.getByRole("menuitem", { name: "Open in builder" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resume-builder/3"));
    expect(api.importUploaded).toHaveBeenCalledWith(3);
  });

  it("an archived card offers Unarchive and Delete only, and is dimmed", async () => {
    renderPage();
    expect(card(4).getAttribute("data-archived")).toBe("true");
    openCardMenu(4, "AI/ML Engineer");
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Unarchive", "Delete"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Unarchive" }));
    await waitFor(() => expect(api.patchResumeMeta).toHaveBeenCalledWith(4, { archived: false }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("Set as Primary and Archive patch the resume's metadata and refresh the list", async () => {
    renderPage();
    openCardMenu(2, "Product Manager");
    fireEvent.click(screen.getByRole("menuitem", { name: "Set as Primary" }));
    await waitFor(() => expect(api.patchResumeMeta).toHaveBeenCalledWith(2, { primary: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    openCardMenu(2, "Product Manager");
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await waitFor(() => expect(api.patchResumeMeta).toHaveBeenCalledWith(2, { archived: true }));
  });

  it("a refused change (the primary cannot be archived) is shown, and the list is not refreshed", async () => {
    api.patchResumeMeta.mockResolvedValue({ kind: "error", code: "PRIMARY_REQUIRED", message: "This is your primary resume: make another one primary before archiving it" });
    renderPage();
    openCardMenu(1, "Software Engineer");
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(await screen.findByText(/make another one primary before archiving it/)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Rename asks for the new name, then patches it", async () => {
    renderPage();
    openCardMenu(2, "Product Manager");
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const dialog = screen.getByRole("dialog", { name: "Rename resume" });
    const input = within(dialog).getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Product Manager");
    fireEvent.change(input, { target: { value: "PM — Growth" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.patchResumeMeta).toHaveBeenCalledWith(2, { name: "PM — Growth" }));
  });

  it("Delete asks first, and only then deletes", async () => {
    renderPage();
    openCardMenu(3, "Data Analyst");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: /Delete .Data Analyst.\?/ });
    expect(api.deleteResume).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteResume).toHaveBeenCalledWith(3));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("a delete the API refuses (used by an application) explains why", async () => {
    api.deleteResume.mockResolvedValue({ kind: "error", code: "IN_USE", message: "This resume is used by a tracked application — archive it instead." });
    renderPage();
    openCardMenu(3, "Data Analyst");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/archive it instead/)).toBeTruthy();
  });
});

describe("My Resumes: Popular Templates and Quick Tips", () => {
  it("lists the enabled registry templates and the four default Quick Tips", () => {
    renderPage();
    expect(screen.getByAltText("Modern template")).toBeTruthy();
    for (const tip of QUICK_TIPS) expect(screen.getByText(tip)).toBeTruthy();
  });

  it("Quick Tips are the lines from the settings", () => {
    renderPage(resumes(), cfg({ list: { quickTips: ["Be brief", "Be honest"], virtualizeAbove: 60 } }));
    expect(screen.getByText("Be brief")).toBeTruthy();
    expect(screen.getByText("Be honest")).toBeTruthy();
    expect(screen.queryByText(QUICK_TIPS[0])).toBeNull();
  });

  it("a template that is not enabled is not offered", () => {
    renderPage(resumes(), cfg({ templates: { ...DEFAULT_BUILDER_CONFIG.templates, enabled: ["ghost"], popular: ["ghost"] } }));
    // 'ghost' is not in the UI registry; the strip falls back to the default template rather than being empty
    expect(screen.getByAltText("Modern template")).toBeTruthy();
  });

  it("choosing one opens the chooser with that template named on the second step", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Use the Modern template" }));
    const dialog = screen.getByRole("dialog", { name: "Start your resume from" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/Template:/).textContent).toContain("Modern");
  });

  it("View all is a link to the template gallery (R3.13)", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /View all/ }).getAttribute("href")).toBe("/resume-builder/templates");
  });

  it("arriving from the gallery (?template=modern) opens the chooser with that template preselected, once, and clears the address", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    render(
      <ToastProvider>
        <MyResumesPage resumes={resumes()} usage={{}} baseProfile={{}} isPro={false} config={cfg()} profile={{ itemCount: 2, roles: 1, schools: 1, skills: 4, score: 60, headline: null }} initialTemplate="modern" />
      </ToastProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Start your resume from" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(screen.getByText(/Template:/).textContent).toContain("Modern");
    expect(replace).toHaveBeenCalledTimes(1);
    replace.mockRestore();
  });

  it("arriving from the profile setup (?new=profile) opens the chooser on Use my profile, once, and clears the address", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    render(
      <ToastProvider>
        <MyResumesPage resumes={resumes()} usage={{}} baseProfile={{}} isPro={false} config={cfg()} profile={{ itemCount: 2, roles: 1, schools: 1, skills: 4, score: 60, headline: null }} initialNew="profile" />
      </ToastProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Start your resume from" });
    expect(within(dialog).getByRole("radio", { name: /Use my profile/ }).getAttribute("aria-checked")).toBe("true");
    expect(replace).toHaveBeenCalledTimes(1);
    replace.mockRestore();
  });

  it("an id that is not an enabled template opens nothing", () => {
    render(
      <ToastProvider>
        <MyResumesPage resumes={resumes()} usage={{}} baseProfile={{}} isPro={false} config={cfg()} initialTemplate="not-a-template" />
      </ToastProvider>,
    );
    expect(screen.queryByRole("dialog", { name: "Start your resume from" })).toBeNull();
  });

  it("the plan's cap is still checked first when the gallery sends you here", () => {
    render(
      <ToastProvider>
        <MyResumesPage resumes={resumes()} usage={{}} baseProfile={{}} isPro={false} config={cfg({ resumes: { count: 3, max: 3 }, plan: "FREE" })} initialTemplate="modern" />
      </ToastProvider>,
    );
    expect(screen.queryByRole("dialog", { name: "Start your resume from" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "You've used 3 of 3 resumes" })).toBeTruthy();
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
    expect(VIEW_STORAGE_KEY).toBe("rb.list.view");

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

describe("My Resumes: a big list", () => {
  it("shows a page at a time above resume.list.virtualizeAbove, with a button for the rest", () => {
    const many: Resume[] = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, label: `Resume ${i + 1}`, kind: "UPLOADED", archived: false, defaultResume: i === 0, createdAt: `2026-09-0${i + 1}T00:00:00Z` }));
    renderPage(many, cfg({ list: { quickTips: ["x"], virtualizeAbove: 5 } }));
    expect(names()).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(names()).toHaveLength(7);
  });
});

describe("My Resumes: on a phone", () => {
  it("collapses status, sort and layout into one Filters sheet", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: /max-width: 639px/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    renderPage();
    expect(screen.queryByRole("button", { name: /Status filter/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Grid view" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    fireEvent.click(within(sheet).getByRole("radio", { name: "Archived" }));
    expect(names()).toEqual(["AI/ML Engineer"]);
    fireEvent.click(within(sheet).getByRole("radio", { name: "Name (A-Z)" }));
    expect(within(sheet).getByRole("button", { name: "List view" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();
    expect(screen.getByRole("button", { name: /Filters \(2\)/ })).toBeTruthy();
  });
});

describe("My Resumes: empty state and New Resume", () => {
  it("with no resumes shows the empty state with the four ways to start, and zero counts", () => {
    renderPage([]);
    expect(screen.getByText("No resumes yet")).toBeTruthy();
    expect(tab(/^All Resumes/).textContent).toContain("0");
    for (const title of ["Use my profile", "Upload a resume", "Copy an existing resume", "Start from scratch"]) {
      expect(screen.getByRole("button", { name: new RegExp(title) })).toBeTruthy();
    }
  });

  it("New Resume opens the chooser, and Create lands in the editor", async () => {
    createBuilt.mockResolvedValue({ kind: "ok", id: 55 });
    renderPage([]);
    fireEvent.click(screen.getAllByRole("button", { name: /New Resume/ })[0]);
    const dialog = screen.getByRole("dialog", { name: "Start your resume from" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Start from scratch/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Name your resume" })).getByRole("button", { name: "Create resume" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resume-builder/55"));
    expect(createBuilt.mock.calls[0][0]).toMatchObject({ source: { kind: "scratch" }, label: "My resume" });
  });

  it("a card of the empty state opens the chooser on that source", () => {
    renderPage([]);
    fireEvent.click(screen.getByRole("button", { name: /Start from scratch/ }));
    const dialog = screen.getByRole("dialog", { name: "Start your resume from" });
    expect(within(dialog).getByRole("radio", { name: /Start from scratch/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("at the plan's cap New Resume shows the friendly cap dialog and never the chooser", () => {
    renderPage(resumes(), cfg({ plan: "FREE", resumes: { count: 3, max: 3 } }));
    fireEvent.click(screen.getAllByRole("button", { name: /New Resume/ })[0]);
    const dialog = screen.getByRole("dialog", { name: "You've used 3 of 3 resumes" });
    expect(within(dialog).getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/pricing");
    expect(within(dialog).getByRole("button", { name: "Manage resumes" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Start your resume from" })).toBeNull();
    expect(createBuilt).not.toHaveBeenCalled();
  });

  it("the cap number comes from the server config, not the code", () => {
    renderPage(resumes(), cfg({ plan: "PRO", resumes: { count: 25, max: 25 } }));
    fireEvent.click(screen.getAllByRole("button", { name: /New Resume/ })[0]);
    const dialog = screen.getByRole("dialog", { name: "You've used 25 of 25 resumes" });
    expect(within(dialog).getByRole("link", { name: "Upgrade" })).toBeTruthy();
  });

  it("at the cap Duplicate shows the dialog without calling the server", () => {
    renderPage(resumes(), cfg({ plan: "FREE", resumes: { count: 3, max: 3 } }));
    fireEvent.click(within(card(1)).getByRole("button", { name: "Duplicate Software Engineer" }));
    expect(screen.getByRole("dialog", { name: /used 3 of 3 resumes/ })).toBeTruthy();
    expect(api.duplicateResume).not.toHaveBeenCalled();
  });

  it("Manage resumes closes the dialog and opens the manage panel", () => {
    renderPage(resumes(), cfg({ plan: "FREE", resumes: { count: 3, max: 3 } }));
    fireEvent.click(screen.getAllByRole("button", { name: /New Resume/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Manage resumes" }));
    expect(screen.queryByRole("dialog", { name: /used 3 of 3/ })).toBeNull();
    expect(screen.getByTestId("drawer")).toBeTruthy();
  });
});
