import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config";
import type { ResumeLineage, ResumeMeta } from "@/lib/resume-meta";
import { hoursAgo, testLineage, testLink, testMeta, testVersions } from "./test-meta";
import type { Viewport } from "./state/ui";

const m = vi.hoisted(() => ({
  getMeta: vi.fn(),
  patchMeta: vi.fn(),
  getLineage: vi.fn(),
  detachResume: vi.fn(),
  createCheckpoint: vi.fn(),
  listVersions: vi.fn(),
  getVersionText: vi.fn(),
  restoreVersion: vi.fn(),
  getAccess: vi.fn(),
  createLink: vi.fn(),
  revokeAccess: vi.fn(),
  setLinkDownload: vi.fn(),
  deleteResume: vi.fn(),
  syncMaster: vi.fn(),
  applySyncMaster: vi.fn(),
  exportText: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/resume-meta", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-meta")>()),
  getMeta: m.getMeta,
  patchMeta: m.patchMeta,
  getLineage: m.getLineage,
  detachResume: m.detachResume,
  createCheckpoint: m.createCheckpoint,
  listVersions: m.listVersions,
  getVersionText: m.getVersionText,
  restoreVersion: m.restoreVersion,
  getAccess: m.getAccess,
  createLink: m.createLink,
  revokeAccess: m.revokeAccess,
  setLinkDownload: m.setLinkDownload,
  deleteResume: m.deleteResume,
  syncMaster: m.syncMaster,
  applySyncMaster: m.applySyncMaster,
}));
vi.mock("@/lib/resume-doc", async (orig) => ({ ...(await orig<typeof import("@/lib/resume-doc")>()), exportText: m.exportText }));
vi.mock("@/lib/use-date-display", () => ({ useDateDisplay: () => ({ locale: "en-US", timeZone: "UTC" }) })); // the machine's locale must not decide the text
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import ResumeHeaderBar from "./ResumeHeaderBar";

const ok = <T,>(value: T) => ({ kind: "ok" as const, value });
const ensureSaved = vi.fn<() => Promise<boolean>>();
const onDocReplaced = vi.fn();
const onTailor = vi.fn();
const onOpenSettings = vi.fn();

function renderBar({
  meta = testMeta(),
  lineage = testLineage(),
  viewport = "wide" as Viewport,
  config = DEFAULT_BUILDER_CONFIG as ResumeBuilderConfig,
}: { meta?: ResumeMeta; lineage?: ResumeLineage; viewport?: Viewport; config?: ResumeBuilderConfig } = {}) {
  m.getMeta.mockResolvedValue(ok(meta));
  m.getLineage.mockResolvedValue(ok(lineage));
  return render(
    <ToastProvider>
      <ResumeHeaderBar
        resumeId={42}
        initialMeta={meta}
        fallbackName="Fallback"
        config={config}
        viewport={viewport}
        savedAt={null}
        ensureSaved={ensureSaved}
        onDocReplaced={onDocReplaced}
        onTailor={onTailor}
        onOpenSettings={onOpenSettings}
      />
    </ToastProvider>,
  );
}

const header = () => screen.getByRole("region", { name: "Resume details" });
const chip = (name: string | RegExp) => within(header()).getByRole("button", { name });
const menuItems = () => within(screen.getByRole("menu")).getAllByRole("menuitem");
const menuItem = (name: string | RegExp) => within(screen.getByRole("menu")).getByRole("menuitem", { name });
const confirmDialog = (name: string | RegExp) => screen.getByRole("dialog", { name });
const settle = () => waitFor(() => expect(m.getLineage).toHaveBeenCalled());

beforeEach(() => {
  vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
  for (const fn of Object.values(m)) fn.mockReset();
  ensureSaved.mockReset().mockResolvedValue(true);
  onDocReplaced.mockReset();
  onTailor.mockReset();
  onOpenSettings.mockReset();
  m.patchMeta.mockImplementation(async (_id: number, body: Record<string, unknown>) => ok(testMeta(body.name ? { name: String(body.name) } : {})));
  m.getLineage.mockResolvedValue(ok(testLineage()));
  m.listVersions.mockResolvedValue(ok(testVersions()));
  m.getAccess.mockResolvedValue(ok({ org: null, grants: [], links: [], viewers: 0 }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ResumeHeaderBar: row 1", () => {
  it("shows the name, the type pill and the kebab, then the chips of row 2 in board order", async () => {
    renderBar();
    await settle();
    expect(within(header()).getByRole("heading", { name: "Senior Software Engineer Resume" })).toBeTruthy();
    expect(chip("Master Resume")).toBeTruthy();
    expect(within(header()).getByText("Created Oct 2, 2026")).toBeTruthy();
    expect(within(header()).getByText(/Last modified 2 hours ago/)).toBeTruthy();
    const chips = within(within(header()).getByRole("group", { name: "Resume status" })).getAllByRole("button").map((b) => b.textContent);
    expect(chips).toEqual(["Private", "Set as primary", "Shared with Recruiters: Off", "Version 3"]);
  });

  it("rename inline saves on Enter and cancels on Esc", async () => {
    renderBar();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("Resume name") as HTMLInputElement;
    expect(input.value).toBe("Senior Software Engineer Resume");

    fireEvent.change(input, { target: { value: "Dropped" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByLabelText("Resume name")).toBeNull();
    expect(m.patchMeta).not.toHaveBeenCalled();
    expect(within(header()).getByRole("heading", { name: "Senior Software Engineer Resume" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Resume name"), { target: { value: "Platform Engineer" } });
    fireEvent.keyDown(screen.getByLabelText("Resume name"), { key: "Enter" });
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { name: "Platform Engineer" }));
    expect(await within(header()).findByRole("heading", { name: "Platform Engineer" })).toBeTruthy();
  });

  it("a blank rename becomes 'Untitled resume'", async () => {
    renderBar();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Resume name"), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByLabelText("Resume name"), { key: "Enter" });
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { name: "Untitled resume" }));
  });

  it("kebab menu order", async () => {
    renderBar();
    await settle();
    fireEvent.click(within(header()).getByText("More actions"));
    expect(menuItems().map((i) => i.textContent)).toEqual([
      "Rename",
      "Duplicate",
      "Set as primary",
      "Tailor for a job…",
      "Save as version…",
      "Version history",
      "Resume settings…",
      "Archive",
      "Delete",
    ]);
  });

  it("the kebab hides Set as primary on the primary resume and Tailor when tailoring is off", async () => {
    renderBar({ meta: testMeta({ primary: true }), config: { ...DEFAULT_BUILDER_CONFIG, features: { ...DEFAULT_BUILDER_CONFIG.features, tailor: false } } });
    await settle();
    fireEvent.click(within(header()).getByText("More actions"));
    const labels = menuItems().map((i) => i.textContent);
    expect(labels).not.toContain("Set as primary");
    expect(labels).not.toContain("Tailor for a job…");
  });

  it("the kebab's Tailor for a job… opens the Tailor panel; Resume settings… calls the settings opener", async () => {
    renderBar();
    await settle();
    fireEvent.click(within(header()).getByText("More actions"));
    fireEvent.click(menuItem("Tailor for a job…"));
    expect(onTailor).toHaveBeenCalledTimes(1);
    fireEvent.click(within(header()).getByText("More actions"));
    fireEvent.click(menuItem("Resume settings…"));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("Archive confirms, patches and leaves for the list; Delete asks first and deletes", async () => {
    m.deleteResume.mockResolvedValue(ok(null));
    renderBar();
    await settle();
    fireEvent.click(within(header()).getByText("More actions"));
    fireEvent.click(menuItem("Archive"));
    fireEvent.click(within(confirmDialog("Archive this resume?")).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { archived: true }));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/resume-builder"));

    m.push.mockReset();
    fireEvent.click(within(header()).getByText("More actions"));
    fireEvent.click(menuItem("Delete"));
    fireEvent.click(within(confirmDialog("Delete this resume?")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(m.deleteResume).toHaveBeenCalledWith(42));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/resume-builder"));
  });
});

describe("ResumeHeaderBar: the type menu", () => {
  it("lists the tailored versions on a master, with Master changed, and opens one", async () => {
    renderBar({
      meta: testMeta({ lineage: { masterId: 42, masterName: "Senior Software Engineer Resume", masterChanged: false, children: 2 } }),
      lineage: testLineage({
        children: [
          { id: 50, name: "PM copy", job: { title: "Product Manager", company: "Stripe" }, updatedAt: hoursAgo(2), masterChanged: true },
          { id: 51, name: "Backend copy", job: null, updatedAt: hoursAgo(30), masterChanged: false },
        ],
      }),
    });
    await settle();
    await waitFor(() => expect(m.getLineage).toHaveBeenCalled());
    fireEvent.click(chip("Master Resume"));
    const menu = within(screen.getByRole("menu"));
    expect(menu.getByText("This is the base you tailor from")).toBeTruthy();
    expect(menu.getByText("Tailored versions")).toBeTruthy();
    expect(menu.getByText("Product Manager @ Stripe · edited 2 hours ago")).toBeTruthy();
    expect(menu.getByText("Master changed")).toBeTruthy();
    expect(menu.getByText("Backend copy · edited yesterday")).toBeTruthy();
    fireEvent.click(menu.getByText("Product Manager @ Stripe · edited 2 hours ago"));
    expect(m.push).toHaveBeenCalledWith("/resume-builder/50");
  });

  it("offers + Tailor for a job… on a master, and says so when there are no copies", async () => {
    renderBar();
    await settle();
    fireEvent.click(chip("Master Resume"));
    expect(within(screen.getByRole("menu")).getByText("No tailored versions yet")).toBeTruthy();
    fireEvent.click(menuItem("+ Tailor for a job…"));
    expect(onTailor).toHaveBeenCalledTimes(1);
  });

  it("type menu lists children on a master and Open master on a child", async () => {
    renderBar({
      meta: testMeta({
        id: 42,
        name: "PM copy",
        role: "TAILORED",
        source: { kind: "BUILT", origin: "TAILOR", tailoredFrom: { resumeId: 7, label: "Senior Software Engineer Resume", job: { title: "Product Manager", company: "Stripe" } }, madeBy: null, approvalRequired: false, approvedAt: null },
        lineage: { masterId: 7, masterName: "Senior Software Engineer Resume", masterChanged: false, children: 0 },
      }),
      lineage: testLineage({
        self: "TAILORED",
        master: { id: 7, name: "Senior Software Engineer Resume", updatedAt: hoursAgo(2) },
        children: [
          { id: 42, name: "PM copy", job: { title: "Product Manager", company: "Stripe" }, updatedAt: hoursAgo(2), masterChanged: false },
          { id: 51, name: "Data copy", job: { title: "Data Engineer", company: "Acme" }, updatedAt: hoursAgo(5), masterChanged: false },
        ],
      }),
    });
    await settle();
    fireEvent.click(chip("Tailored Resume"));
    const menu = within(screen.getByRole("menu"));
    expect(menu.getByText("Tailored for Product Manager @ Stripe")).toBeTruthy();
    expect(menu.getByText("Data Engineer @ Acme · edited 5 hours ago")).toBeTruthy(); // a sibling; this resume is not listed again
    expect(menu.queryByText(/^Product Manager @ Stripe · edited/)).toBeNull();
    fireEvent.click(menu.getByText(/^Open master/));
    expect(m.push).toHaveBeenCalledWith("/resume-builder/7");
  });

  const tailored = (masterChanged: boolean) =>
    testMeta({ id: 50, name: "PM copy", role: "TAILORED", lineage: { masterId: 42, masterName: "Senior Software Engineer Resume", masterChanged, children: 0 } });

  it("Pull changes enabled only when master changed", async () => {
    const { unmount } = renderBar({ meta: tailored(false), lineage: testLineage({ self: "TAILORED" }) });
    await settle();
    fireEvent.click(chip("Tailored Resume"));
    expect(menuItem(/Pull changes from master/).getAttribute("aria-disabled")).toBe("true");
    unmount();
    cleanup();

    renderBar({ meta: tailored(true), lineage: testLineage({ self: "TAILORED" }) });
    await settle();
    m.syncMaster.mockResolvedValue(ok({ changes: [{ id: "c1", kind: "changed", section: "Summary", before: "Old summary", after: "New summary" }] }));
    fireEvent.click(chip("Tailored Resume"));
    const pull = menuItem("Pull changes from master");
    expect(pull.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(pull);
    expect(await screen.findByRole("dialog", { name: "Pull changes from master" })).toBeTruthy();
    expect(await screen.findByText("New summary")).toBeTruthy();
    expect(m.syncMaster).toHaveBeenCalledWith(42);
  });

  it("applying the ticked master changes hands the merged document to the editor", async () => {
    renderBar({ meta: tailored(true), lineage: testLineage({ self: "TAILORED" }) });
    await settle();
    m.syncMaster.mockResolvedValue(ok({ changes: [{ id: "c1", kind: "changed", section: "Summary", before: "Old", after: "New" }, { id: "c2", kind: "added", section: "Skills", after: { group: "Go", skills: ["Go"] } }] }));
    const merged = { resumeId: 50, doc: { schema: 2 }, docVersion: 31 };
    m.applySyncMaster.mockResolvedValue(ok(merged));
    fireEvent.click(chip("Tailored Resume"));
    fireEvent.click(menuItem("Pull changes from master"));
    const sheet = await screen.findByRole("dialog", { name: "Pull changes from master" });
    await within(sheet).findByText("New");
    fireEvent.click(within(sheet).getAllByRole("checkbox")[1]); // untick the second change
    fireEvent.click(within(sheet).getByRole("button", { name: "Apply 1 change" }));
    await waitFor(() => expect(m.applySyncMaster).toHaveBeenCalledWith(42, ["c1"]));
    await waitFor(() => expect(onDocReplaced).toHaveBeenCalledWith(merged));
  });

  it("Make this a master calls detach after confirm", async () => {
    m.detachResume.mockResolvedValue(ok(testMeta({ id: 50, name: "PM copy", role: "MASTER" })));
    renderBar({ meta: tailored(false), lineage: testLineage({ self: "TAILORED" }) });
    await settle();
    fireEvent.click(chip("Tailored Resume"));
    fireEvent.click(menuItem("Make this a master"));
    expect(m.detachResume).not.toHaveBeenCalled();
    const dialog = confirmDialog("Make this a master?");
    expect(within(dialog).getByText(/stops following Senior Software Engineer Resume/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Make this a master" }));
    await waitFor(() => expect(m.detachResume).toHaveBeenCalledWith(42));
    expect(await within(header()).findByRole("button", { name: "Master Resume" })).toBeTruthy();
  });
});

describe("ResumeHeaderBar: primary, visibility and recruiters", () => {
  it("primary chip patches primary and shows the toast", async () => {
    m.patchMeta.mockResolvedValue(ok(testMeta({ primary: true })));
    renderBar();
    await settle();
    fireEvent.click(chip("Set as primary"));
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { primary: true }));
    expect(await screen.findByText("Now your primary resume")).toBeTruthy();
    expect(within(header()).getByText("Primary Resume")).toBeTruthy();
    expect(within(header()).queryByRole("button", { name: "Set as primary" })).toBeNull();
  });

  it("a primary resume shows the green Primary Resume pill, not a button", async () => {
    renderBar({ meta: testMeta({ primary: true }) });
    await settle();
    expect(within(header()).getByText("Primary Resume")).toBeTruthy();
    expect(within(header()).queryByRole("button", { name: /primary/i })).toBeNull();
  });

  it("visibility label derives People > Org > Private", async () => {
    const label = async (visibility: ResumeMeta["visibility"]) => {
      const r = renderBar({ meta: testMeta({ visibility }) });
      await settle();
      const text = within(within(header()).getByRole("group", { name: "Resume status" })).getAllByRole("button")[0].textContent;
      r.unmount();
      cleanup();
      return text;
    };
    expect(await label({ mode: "PEOPLE", orgPaired: "Acme", orgScope: "FULL", shareWithOrg: true, people: 2 })).toBe("Specific people (2)");
    expect(await label({ mode: "ORG", orgPaired: "Acme", orgScope: "FULL", shareWithOrg: true, people: 0 })).toBe("My organization");
    expect(await label({ mode: "PRIVATE", orgPaired: null, orgScope: null, shareWithOrg: true, people: 0 })).toBe("Private");
  });

  it("choosing Private confirms and patches", async () => {
    renderBar({ meta: testMeta({ visibility: { mode: "PEOPLE", orgPaired: null, orgScope: null, shareWithOrg: true, people: 2 } }) });
    await settle();
    fireEvent.click(chip("Specific people (2)"));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Visibility" })).getByRole("button", { name: /^Private/ }));
    const dialog = confirmDialog("Make this resume private?");
    expect(within(dialog).getByText("Remove 2 people and stop sharing with your organization?")).toBeTruthy();
    expect(m.patchMeta).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Make private" }));
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { visibility: "PRIVATE" }));
  });

  it("choosing Private on an already private resume only closes the menu", async () => {
    renderBar();
    await settle();
    fireEvent.click(chip("Private"));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Visibility" })).getByRole("button", { name: /^Private/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.patchMeta).not.toHaveBeenCalled();
  });

  it("org row shows Change sharing when scope < FULL, and is hidden without an organization", async () => {
    const { unmount } = renderBar({ meta: testMeta({ visibility: { mode: "PRIVATE", orgPaired: "Acme", orgScope: "SUMMARY", shareWithOrg: true, people: 0 } }) });
    await settle();
    fireEvent.click(chip("Private"));
    const panel = within(screen.getByRole("dialog", { name: "Visibility" }));
    expect(panel.getByText("Requires Full sharing with Acme")).toBeTruthy();
    expect(panel.getByRole("link", { name: "Change sharing" }).getAttribute("href")).toBe("/settings/organizations");
    expect((panel.getByRole("button", { name: /My organization/ }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    cleanup();

    renderBar();
    await settle();
    fireEvent.click(chip("Private"));
    expect(within(screen.getByRole("dialog", { name: "Visibility" })).queryByText("My organization")).toBeNull();
  });

  it("at FULL scope the org row names who can see it and toggles shareWithOrg", async () => {
    renderBar({ meta: testMeta({ visibility: { mode: "ORG", orgPaired: "Rahul", orgScope: "FULL", shareWithOrg: true, people: 0 } }) });
    await settle();
    fireEvent.click(chip("My organization"));
    const panel = within(screen.getByRole("dialog", { name: "Visibility" }));
    expect(panel.getByText("Rahul (your marketer) can view and download")).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: /My organization/ }));
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { shareWithOrg: false }));
  });

  it("recruiter sharing On creates a link and Off revokes after confirm", async () => {
    m.patchMeta.mockImplementation(async (_id: number, body: Record<string, unknown>) =>
      ok(testMeta({ recruiterSharing: body.recruiterSharing ? { on: true, links: 1, views: 12 } : { on: false, links: 0, views: 0 } })),
    );
    m.getAccess.mockResolvedValue(ok({ org: null, grants: [], links: [testLink()], viewers: 12 }));
    renderBar();
    await settle();
    fireEvent.click(chip("Shared with Recruiters: Off"));
    const panel = screen.getByRole("dialog", { name: "Shared with Recruiters" });
    fireEvent.click(within(panel).getByRole("button", { name: /^On/ }));
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { recruiterSharing: true }));
    expect(await within(panel).findByDisplayValue("http://localhost:3000/r/AbCdEfGhIjKlMnOpQrStUvWxYz012345")).toBeTruthy();
    expect(within(panel).getByText(/Expires in 23 days/)).toBeTruthy();
    expect(within(panel).getByText(/12 views/)).toBeTruthy();
    expect(within(header()).getByText("Shared with Recruiters: On")).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: /^Off/ }));
    const dialog = confirmDialog("Turn off recruiter links?");
    expect(within(dialog).getByText("Everyone with the link will lose access.")).toBeTruthy();
    expect(m.patchMeta).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(m.patchMeta).toHaveBeenLastCalledWith(42, { recruiterSharing: false }));
    expect(await within(header()).findByText("Shared with Recruiters: Off")).toBeTruthy();
  });

  it("a link row copies, switches PDF download, revokes, and adds another up to the admin limit", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    m.setLinkDownload.mockResolvedValue(ok(testLink({ allowDownload: true })));
    m.revokeAccess.mockResolvedValue(ok(null));
    m.createLink.mockResolvedValue(ok(testLink({ id: 10 })));
    m.getAccess.mockResolvedValue(ok({ org: null, grants: [], links: [testLink()], viewers: 12 }));
    renderBar({ meta: testMeta({ recruiterSharing: { on: true, links: 1, views: 12 } }), config: { ...DEFAULT_BUILDER_CONFIG, share: { maxLinks: 2 } } });
    await settle();
    fireEvent.click(chip("Shared with Recruiters: On"));
    const panel = within(screen.getByRole("dialog", { name: "Shared with Recruiters" }));
    await panel.findByDisplayValue(/\/r\/AbCd/);

    fireEvent.click(panel.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("http://localhost:3000/r/AbCdEfGhIjKlMnOpQrStUvWxYz012345"));
    expect(await screen.findByText("Link copied")).toBeTruthy();

    fireEvent.click(panel.getByRole("switch", { name: "Allow PDF download" }));
    await waitFor(() => expect(m.setLinkDownload).toHaveBeenCalledWith(42, 9, true));

    fireEvent.click(panel.getByRole("button", { name: "+ Another link" }));
    await waitFor(() => expect(m.createLink).toHaveBeenCalledWith(42));

    fireEvent.click(panel.getByRole("button", { name: /Revoke link/ }));
    await waitFor(() => expect(m.revokeAccess).toHaveBeenCalledWith(42, 9));
  });

  it("hides Shared with Recruiters entirely when share links are off", async () => {
    renderBar({ config: { ...DEFAULT_BUILDER_CONFIG, features: { ...DEFAULT_BUILDER_CONFIG.features, shareLinks: false } } });
    await settle();
    expect(within(header()).queryByText(/Shared with Recruiters/)).toBeNull();
  });
});

describe("ResumeHeaderBar: versions", () => {
  it("version menu lists rows with kind and by, Restore confirms, Compare opens diff", async () => {
    m.getVersionText.mockResolvedValue(ok("Priya Sharma\nBuilt things quickly.\n"));
    m.exportText.mockResolvedValue({ kind: "ok", blob: { text: async () => "Priya Sharma\nBuilt big things.\n" } as unknown as Blob, fileName: "r.txt" }); // jsdom's Blob has no text()
    m.restoreVersion.mockResolvedValue(ok({ resumeId: 42, doc: { schema: 2 }, docVersion: 12 }));
    renderBar();
    await settle();
    fireEvent.click(chip("Version 3"));
    const panel = within(screen.getByRole("dialog", { name: "Versions" }));
    const row7 = (await panel.findByText("Before tailoring")).closest("li")!;
    expect(within(row7).getByText("v7")).toBeTruthy();
    expect(within(row7).getByText("named")).toBeTruthy();
    expect(within(row7).getByText((_, el) => el?.tagName === "P" && /2 hours ago · you/.test(el.textContent ?? ""))).toBeTruthy();
    expect(panel.getAllByText("Auto-save", { selector: "span" })).toHaveLength(2);
    expect(panel.getByText("Template switch")).toBeTruthy();
    expect(panel.getByText(/· Rahul/)).toBeTruthy();

    // Compare
    fireEvent.click(panel.getByRole("button", { name: "Compare v6" }));
    const sheet = await screen.findByRole("dialog", { name: "Compare versions" });
    await waitFor(() => expect(within(sheet).getByRole("group", { name: /Changes:/ })).toBeTruthy());
    expect(m.getVersionText).toHaveBeenCalledWith(42, 6);
    const diff = within(sheet).getByRole("group", { name: /Changes:/ });
    const text = (tag: string) => [...diff.querySelectorAll(tag)].map((n) => n.textContent).join("");
    expect(text("ins")).toContain("big");
    expect(text("del")).toContain("quickly");
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Compare versions" })).toBeNull());

    // Restore asks first, and says what happens to the current content
    fireEvent.click(chip(/^Version/));
    fireEvent.click(await screen.findByRole("button", { name: "Restore v5" }));
    const dialog = confirmDialog("Restore v5?");
    expect(within(dialog).getByText("Your current content is saved as a new version first.")).toBeTruthy();
    expect(m.restoreVersion).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(m.restoreVersion).toHaveBeenCalledWith(42, 5));
    await waitFor(() => expect(onDocReplaced).toHaveBeenCalledWith({ resumeId: 42, doc: { schema: 2 }, docVersion: 12 }));
    expect(await screen.findByText("Restored v5")).toBeTruthy();
  });

  it("a restore is refused while the latest edits are not saved", async () => {
    ensureSaved.mockResolvedValue(false);
    renderBar();
    await settle();
    fireEvent.click(chip("Version 3"));
    fireEvent.click(await screen.findByRole("button", { name: "Restore v6" }));
    fireEvent.click(within(confirmDialog("Restore v6?")).getByRole("button", { name: "Restore" }));
    expect(await screen.findByText("Couldn't restore yet")).toBeTruthy();
    expect(m.restoreVersion).not.toHaveBeenCalled();
  });

  it("Save as version… names the version after saving what is pending", async () => {
    m.createCheckpoint.mockResolvedValue(ok({ versionNo: 8, reason: "NAMED", pdf: null }));
    renderBar();
    await settle();
    fireEvent.click(chip("Version 3"));
    fireEvent.click(await screen.findByRole("button", { name: "Save as version…" }));
    const dialog = screen.getByRole("dialog", { name: "Save as version" });
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Sent to Acme" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save version" }));
    await waitFor(() => expect(m.createCheckpoint).toHaveBeenCalledWith(42, "Sent to Acme"));
    expect(ensureSaved).toHaveBeenCalled();
    expect(await screen.findByText("Saved as v8")).toBeTruthy();
  });

  it("All versions opens the full list with a filter and the retention rule from the admin setting", async () => {
    renderBar({ config: { ...DEFAULT_BUILDER_CONFIG, versions: { retentionAuto: 45 } } });
    await settle();
    fireEvent.click(chip("Version 3"));
    fireEvent.click(await screen.findByRole("button", { name: "All versions" }));
    const sheet = await screen.findByRole("dialog", { name: "All versions" });
    await within(sheet).findByText("Before tailoring");
    expect(within(sheet).getByText(/Keeps the last 45 automatic versions and every named one/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("radio", { name: "Named" }));
    expect(within(sheet).getByText("Before tailoring")).toBeTruthy();
    expect(within(sheet).queryByText("Template switch")).toBeNull();
  });

  it("says 'No versions yet' before the first", async () => {
    renderBar({ meta: testMeta({ version: { current: 0, latest: null } }) });
    await settle();
    expect(chip("No versions yet")).toBeTruthy();
  });
});

describe("ResumeHeaderBar: responsive", () => {
  it("header collapses to chips at 390", async () => {
    renderBar({ viewport: "phone" });
    await settle();
    // row 1: name, rename, kebab only; the type pill moves into the chip row; Created / Last modified leave the row
    expect(within(header()).queryByText(/Created/)).toBeNull();
    expect(within(header()).queryByText(/Last modified/)).toBeNull();
    const chips = within(within(header()).getByRole("group", { name: "Resume status" })).getAllByRole("button").map((b) => b.textContent);
    expect(chips).toEqual(["Master", "Private", "Set as primary", "Recruiters: Off", "v3"]); // the type pill joins the chip row
    // ... and are in the kebab's About
    fireEvent.click(within(header()).getByText("More actions"));
    expect(screen.getByRole("menuitem", { name: "Created Oct 2, 2026" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^Last modified 2 hours ago/ })).toBeTruthy();
  });

  it("at 1024-1279 the chips shorten", async () => {
    renderBar({ viewport: "desktop", meta: testMeta({ primary: true }) });
    await settle();
    expect(within(header()).getByText("Oct 2, 2026")).toBeTruthy();
    expect(within(header()).getByText("2 hours ago")).toBeTruthy();
    const chips = within(within(header()).getByRole("group", { name: "Resume status" })).getAllByRole("button").map((b) => b.textContent);
    expect(chips).toEqual(["Private", "Recruiters: Off", "v3"]);
    expect(within(header()).getByText("Primary")).toBeTruthy();
  });

  it("at 768-1023 row 2 scrolls sideways instead of wrapping", async () => {
    renderBar({ viewport: "tablet" });
    await settle();
    expect(within(header()).getByRole("group", { name: "Resume status" }).className).toContain("overflow-x-auto");
  });
});

describe("ResumeHeaderBar: loading", () => {
  it("shows the fallback name and reads the metadata itself when the server could not", async () => {
    m.getMeta.mockResolvedValue(ok(testMeta({ name: "Read by the bar" })));
    render(
      <ToastProvider>
        <ResumeHeaderBar resumeId={42} initialMeta={null} fallbackName="Fallback" config={DEFAULT_BUILDER_CONFIG} viewport="wide" savedAt={null} ensureSaved={ensureSaved} onDocReplaced={onDocReplaced} onTailor={onTailor} />
      </ToastProvider>,
    );
    expect(screen.getByRole("heading", { name: "Fallback" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Read by the bar" })).toBeTruthy();
  });

  it("offers Try again when the metadata cannot be read", async () => {
    m.getMeta.mockResolvedValueOnce({ kind: "error", status: 500, message: "boom" }).mockResolvedValue(ok(testMeta({ name: "Second try" })));
    render(
      <ToastProvider>
        <ResumeHeaderBar resumeId={42} initialMeta={null} fallbackName="Fallback" config={DEFAULT_BUILDER_CONFIG} viewport="wide" savedAt={null} ensureSaved={ensureSaved} onDocReplaced={onDocReplaced} onTailor={onTailor} />
      </ToastProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Second try" })).toBeTruthy();
  });
});
