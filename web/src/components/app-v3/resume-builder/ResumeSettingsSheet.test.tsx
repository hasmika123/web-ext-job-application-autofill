import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config";
import { DEFAULT_BUILDER_CONFIG, PERSONAL_CAPABILITIES } from "@/lib/resume-builder-config";
import type { AccessGrant, AccessOverview, ResumeMeta } from "@/lib/resume-meta";
import { hoursAgo, testLink, testMeta } from "./test-meta";

const m = vi.hoisted(() => ({
  getMeta: vi.fn(),
  patchMeta: vi.fn(),
  getAccess: vi.fn(),
  getViews: vi.fn(),
  grantUser: vi.fn(),
  createLink: vi.fn(),
  revokeAccess: vi.fn(),
  setLinkDownload: vi.fn(),
  deleteResume: vi.fn(),
  push: vi.fn(),
  track: vi.fn(),
}));
vi.mock("@/lib/resume-meta", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-meta")>()),
  getMeta: m.getMeta,
  patchMeta: m.patchMeta,
  getAccess: m.getAccess,
  getViews: m.getViews,
  grantUser: m.grantUser,
  createLink: m.createLink,
  revokeAccess: m.revokeAccess,
  setLinkDownload: m.setLinkDownload,
  deleteResume: m.deleteResume,
}));
vi.mock("@/lib/analytics", () => ({ track: m.track }));
vi.mock("@/lib/use-date-display", () => ({ useDateDisplay: () => ({ locale: "en-US", timeZone: "UTC" }) })); // the machine's locale must not decide the text
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import ResumeSettingsSheet from "./ResumeSettingsSheet";

const ok = <T,>(value: T) => ({ kind: "ok" as const, value });
const fail = (status: number, message: string, code?: string) => ({ kind: "error" as const, status, message, code });
const overview = (o: Partial<AccessOverview> = {}): AccessOverview => ({ org: null, grants: [], links: [], viewers: 0, ...o });
const person = (o: Partial<AccessGrant> = {}): AccessGrant => ({
  id: 5,
  subjectType: "USER",
  login: "jane",
  name: "Jane Doe",
  role: "VIEW",
  expired: false,
  createdAt: hoursAgo(3),
  viewCount: 0,
  ...o,
});

const metaSpy = vi.fn();

function Harness({ initial, config, phone = false }: { initial: ResumeMeta; config: ResumeBuilderConfig; phone?: boolean }) {
  const [meta, setMeta] = useState<ResumeMeta>(initial);
  return (
    <ToastProvider>
      <ResumeSettingsSheet
        resumeId={42}
        meta={meta}
        onMeta={(next) => {
          metaSpy(next);
          setMeta(next);
        }}
        config={config}
        active
        phone={phone}
        liveScore={82}
      />
    </ToastProvider>
  );
}

async function renderSheet({
  meta = testMeta(),
  access = overview(),
  config = DEFAULT_BUILDER_CONFIG as ResumeBuilderConfig,
  phone = false,
}: { meta?: ResumeMeta; access?: AccessOverview; config?: ResumeBuilderConfig; phone?: boolean } = {}) {
  m.getAccess.mockResolvedValue(ok(access));
  const view = render(<Harness initial={meta} config={config} phone={phone} />);
  await waitFor(() => expect(m.getAccess).toHaveBeenCalled());
  await screen.findByTestId("visibility-summary");
  await waitFor(() => expect(screen.queryByText(/Loading who can see this/)).toBeNull());
  return view;
}

const section = (name: string) => screen.getByRole("region", { name });
const confirmDialog = (name: string | RegExp) => screen.getByRole("dialog", { name });

beforeEach(() => {
  vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
  for (const fn of Object.values(m)) fn.mockReset();
  metaSpy.mockReset();
  m.getViews.mockResolvedValue(ok([]));
  m.patchMeta.mockImplementation(async (_id: number, body: Record<string, unknown>) => ok(testMeta({ ...(body as Partial<ResumeMeta>), name: typeof body.name === "string" ? body.name : "Senior Software Engineer Resume" })));
  m.getMeta.mockResolvedValue(ok(testMeta()));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Resume settings: Details (name, target role, tags)", () => {
  it("shows the three fields and sends only the changed one, 500 ms after typing stops", async () => {
    await renderSheet({ meta: testMeta({ target: "Backend", tags: ["java"] }) });
    expect((screen.getByRole("textbox", { name: /^Name/ }) as HTMLInputElement).value).toBe("Senior Software Engineer Resume");
    expect((screen.getByRole("textbox", { name: "Target role" }) as HTMLInputElement).value).toBe("Backend");
    expect(within(section("Details")).getByText("java")).toBeTruthy();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const target = screen.getByRole("textbox", { name: "Target role" });
    fireEvent.change(target, { target: { value: "Backend E" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.change(target, { target: { value: "Backend Engineer" } });
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(m.patchMeta).not.toHaveBeenCalled(); // still typing: one call, not one per key
    await act(() => vi.advanceTimersByTimeAsync(2));
    expect(m.patchMeta).toHaveBeenCalledTimes(1);
    expect(m.patchMeta).toHaveBeenCalledWith(42, { target: "Backend Engineer" });
    expect(m.track).toHaveBeenCalledWith("resume_meta_changed", { field: "target" });
  });

  it("renames, adds a tag, and clears the target with null", async () => {
    await renderSheet({ meta: testMeta({ target: "Backend" }) });
    m.patchMeta.mockImplementation(async (_id: number, body: Record<string, unknown>) => ok(testMeta({ target: "Backend", ...(typeof body.name === "string" ? { name: body.name } : {}) })));
    fireEvent.change(screen.getByRole("textbox", { name: /^Name/ }), { target: { value: "  My new name " } });
    fireEvent.blur(screen.getByRole("textbox", { name: /^Name/ })); // leaving the field sends it at once
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { name: "My new name" }));

    const tagBox = screen.getByRole("textbox", { name: "Tags" });
    fireEvent.change(tagBox, { target: { value: "remote" } });
    fireEvent.keyDown(tagBox, { key: "Enter" });
    fireEvent.change(screen.getByRole("textbox", { name: "Target role" }), { target: { value: "" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Target role" }));
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { tags: ["remote"], target: null }));
  });

  it("never sends a blank name and says it is required", async () => {
    await renderSheet();
    fireEvent.change(screen.getByRole("textbox", { name: /^Name/ }), { target: { value: "   " } });
    fireEvent.blur(screen.getByRole("textbox", { name: /^Name/ }));
    expect(screen.getByText("Give your resume a name.")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(m.patchMeta).not.toHaveBeenCalled();
  });

  it("says what the server refused", async () => {
    m.patchMeta.mockResolvedValue(fail(422, "$.target: must be at most 80 characters"));
    await renderSheet();
    fireEvent.change(screen.getByRole("textbox", { name: "Target role" }), { target: { value: "x" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Target role" }));
    expect((await screen.findByRole("alert")).textContent).toContain("must be at most 80 characters");
  });

  it("flushes a pending edit when the sheet closes", async () => {
    const { unmount } = await renderSheet();
    fireEvent.change(screen.getByRole("textbox", { name: "Target role" }), { target: { value: "PM" } });
    unmount();
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { target: "PM" }));
  });
});

describe("Resume settings: Primary", () => {
  it("promotes this resume when the switch goes on", async () => {
    await renderSheet();
    const sw = screen.getByRole("switch", { name: /Use as my primary resume/ });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { primary: true }));
    expect(m.track).toHaveBeenCalledWith("resume_primary_set");
  });

  it("the primary's switch is on and cannot be turned off; the hint says to pick another", async () => {
    await renderSheet({ meta: testMeta({ primary: true }) });
    const sw = screen.getByRole("switch", { name: /Use as my primary resume/ }) as HTMLButtonElement;
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.disabled).toBe(true);
    expect(screen.getByText("Pick another resume as primary to turn this off")).toBeTruthy();
  });
});

describe("Resume settings: Visibility", () => {
  it("starts with the computed summary: private, or who it is shared with", async () => {
    const { unmount } = await renderSheet();
    expect(screen.getByTestId("visibility-summary").textContent).toBe("Private — only you");
    unmount();
    cleanup();
    await renderSheet({
      meta: testMeta({
        visibility: { mode: "PEOPLE", orgPaired: "Rahul", orgScope: "FULL", shareWithOrg: true, people: 2 },
        recruiterSharing: { on: true, links: 1, views: 3 },
      }),
    });
    expect(screen.getByTestId("visibility-summary").textContent).toBe("Shared with 2 people · 1 link · your marketer Rahul");
  });

  it("has no My organization row without an organization", async () => {
    await renderSheet();
    expect(screen.queryByTestId("org-row")).toBeNull();
  });

  it("at Summary scope the organization row says resumes are not visible and offers Change sharing, no switch", async () => {
    await renderSheet({ access: overview({ org: { scope: "SUMMARY", pairedWith: null, shareWithOrg: true } }) });
    const row = screen.getByTestId("org-row");
    expect(within(row).getByText(/You share Summary with your organization/)).toBeTruthy();
    expect(within(row).getByText(/resumes are not visible/)).toBeTruthy();
    expect(within(row).getByRole("link", { name: "Change sharing" }).getAttribute("href")).toBe("/settings/organizations");
    expect(within(row).queryByRole("switch")).toBeNull();
  });

  it("at Full scope the Include this resume switch turns org sharing on and off", async () => {
    await renderSheet({
      meta: testMeta({ shareWithOrg: false, visibility: { mode: "PRIVATE", orgPaired: "Rahul", orgScope: "FULL", shareWithOrg: false, people: 0 } }),
      access: overview({ org: { scope: "FULL", pairedWith: "Rahul", shareWithOrg: false } }),
    });
    const row = screen.getByTestId("org-row");
    expect(within(row).getByText("Rahul (your marketer) can open and download it")).toBeTruthy();
    fireEvent.click(within(row).getByRole("switch", { name: /Include this resume/ }));
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { shareWithOrg: true }));
  });

  it("lists the people with a grant and adds one by email", async () => {
    await renderSheet({ access: overview({ grants: [person()] }) });
    const block = screen.getByTestId("people-block");
    expect(within(block).getByText("Jane Doe")).toBeTruthy();
    expect(within(block).getByText(/Can view/)).toBeTruthy();

    m.grantUser.mockResolvedValue(ok(person({ id: 6, login: "sam", name: "Sam Lee" })));
    fireEvent.click(within(block).getByRole("button", { name: "+ Add person" }));
    fireEvent.change(within(block).getByRole("textbox", { name: "Their email" }), { target: { value: " Sam@Example.com " } });
    fireEvent.click(within(block).getByRole("button", { name: "Add person" }));
    await waitFor(() => expect(m.grantUser).toHaveBeenCalledWith(42, { email: "Sam@Example.com", expiresAt: undefined }));
    expect(m.track).toHaveBeenCalledWith("resume_shared", { kind: "user" });
    await waitFor(() => expect(m.getAccess.mock.calls.length).toBeGreaterThan(1)); // the list is read again
  });

  it("explains a 404 as: they need a Kiwiply account, send a link instead", async () => {
    await renderSheet();
    m.grantUser.mockResolvedValue(fail(404, "They need a Kiwiply account - send them the link instead", "USER_NOT_FOUND"));
    const block = screen.getByTestId("people-block");
    fireEvent.click(within(block).getByRole("button", { name: "+ Add person" }));
    fireEvent.change(within(block).getByRole("textbox", { name: "Their email" }), { target: { value: "ghost@example.com" } });
    fireEvent.click(within(block).getByRole("button", { name: "Add person" }));
    expect(await within(block).findByText("They need a Kiwiply account — send them a link instead")).toBeTruthy();
  });

  it("asks before removing a person", async () => {
    await renderSheet({ access: overview({ grants: [person()] }) });
    m.revokeAccess.mockResolvedValue(ok(null));
    fireEvent.click(screen.getByRole("button", { name: "Remove Jane Doe" }));
    expect(m.revokeAccess).not.toHaveBeenCalled();
    fireEvent.click(within(confirmDialog("Remove this person?")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(m.revokeAccess).toHaveBeenCalledWith(42, 5));
  });

  it("creates a link with the setting's defaults, shows its address with Copy, and Copy announces", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const link = testLink({ id: 11, label: "Sent to Acme" });
    await renderSheet({ config: { ...DEFAULT_BUILDER_CONFIG, share: { ...DEFAULT_BUILDER_CONFIG.share, linkDefaultDays: 14, allowDownloadDefault: true } } });
    m.createLink.mockResolvedValue(ok(link));
    m.getAccess.mockResolvedValue(ok(overview({ links: [link], viewers: 0 })));

    const block = screen.getByTestId("links-block");
    fireEvent.click(within(block).getByRole("button", { name: "+ Create link" }));
    expect(within(block).getByText("Leave empty and it works for 14 days.")).toBeTruthy();
    expect(within(block).getByRole("switch", { name: "Allow PDF download" }).getAttribute("aria-checked")).toBe("true"); // from the setting
    fireEvent.change(within(block).getByRole("textbox", { name: /Label/ }), { target: { value: "Sent to Acme" } });
    fireEvent.click(within(block).getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(m.createLink).toHaveBeenCalledWith(42, { label: "Sent to Acme", expiresAt: undefined, allowDownload: true }));
    expect(m.track).toHaveBeenCalledWith("resume_shared", { kind: "link" });

    const url = await within(block).findByRole("textbox", { name: "Share link" });
    expect((url as HTMLInputElement).value).toBe(link.url);
    fireEvent.click(within(block).getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link.url));
    const live = await waitFor(() => {
      const el = Array.from(document.querySelectorAll('[role="status"].sr-only')).find((n) => n.textContent === "Link copied");
      expect(el).toBeTruthy();
      return el;
    });
    expect(live).toBeTruthy();
  });

  it("confirms before revoking a link, and the switch changes PDF download", async () => {
    const link = testLink({ id: 11 });
    await renderSheet({ access: overview({ links: [link] }) });
    m.setLinkDownload.mockResolvedValue(ok({ ...link, allowDownload: true }));
    m.revokeAccess.mockResolvedValue(ok(null));
    const block = screen.getByTestId("links-block");
    fireEvent.click(within(block).getByRole("switch", { name: "Allow PDF download" }));
    await waitFor(() => expect(m.setLinkDownload).toHaveBeenCalledWith(42, 11, true));

    fireEvent.click(within(block).getByRole("button", { name: /Revoke link/ }));
    expect(m.revokeAccess).not.toHaveBeenCalled();
    fireEvent.click(within(confirmDialog("Revoke this link?")).getByRole("button", { name: "Revoke link" }));
    await waitFor(() => expect(m.revokeAccess).toHaveBeenCalledWith(42, 11));
  });

  it("hides the whole Links block when share links are switched off", async () => {
    await renderSheet({ config: { ...DEFAULT_BUILDER_CONFIG, features: { ...DEFAULT_BUILDER_CONFIG.features, shareLinks: false } } });
    expect(screen.queryByTestId("links-block")).toBeNull();
    expect(screen.getByTestId("people-block")).toBeTruthy();
  });

  it("Activity says how often and who last, and See all lists the views", async () => {
    m.getViews.mockImplementation(async (_id: number, limit?: number) =>
      ok(
        [
          { viewerKind: "ORG", viewerLabel: "Rahul (your marketer)", what: "PAGE", viewedAt: hoursAgo(2) },
          { viewerKind: "LINK", viewerLabel: "Link: Sent to Acme", what: "PDF", viewedAt: hoursAgo(30) },
        ].slice(0, limit ?? 50),
      ),
    );
    await renderSheet({ access: overview({ viewers: 12 }) });
    const row = await screen.findByTestId("activity-row");
    await waitFor(() => expect(row.textContent).toContain("Viewed 12 times"));
    expect(row.textContent).toContain("last by Rahul (your marketer) 2 hours ago");

    fireEvent.click(within(row).getByRole("button", { name: "See all" }));
    const sheet = await screen.findByRole("dialog", { name: "Who viewed this resume" });
    expect(await within(sheet).findByText("Link: Sent to Acme")).toBeTruthy();
    expect(within(sheet).getByText(/Downloaded the PDF/)).toBeTruthy();
    expect(m.getViews).toHaveBeenCalledWith(42, 50);
  });

  it("an unviewed resume says so and has no See all", async () => {
    await renderSheet();
    expect(screen.getByTestId("activity-row").textContent).toContain("Not viewed yet");
    expect(screen.queryByRole("button", { name: "See all" })).toBeNull();
  });
});

describe("Resume settings: About", () => {
  it("states the source, the dates with who, the last PDF and the live score", async () => {
    await renderSheet({ meta: testMeta({ lastExportedAt: "2026-10-11T08:00:00Z", updatedBy: { login: "rahul", label: "Rahul" } }) });
    const about = section("About");
    expect(within(about).getByText("Built · Modern")).toBeTruthy();
    expect(within(about).getByText(/Oct 2, 2026 by Priya Sharma/)).toBeTruthy();
    expect(within(about).getByText(/by Rahul/)).toBeTruthy();
    expect(within(about).getByText("Oct 11, 2026")).toBeTruthy();
    expect(within(about).getByText("82%")).toBeTruthy();
  });

  it("a marketer-made resume that needs approval shows the (not yet working) Approve button", async () => {
    await renderSheet({ meta: testMeta({ source: { kind: "BUILT", origin: "PROFILE", tailoredFrom: null, madeBy: "Rahul", approvalRequired: true, approvedAt: null } }) });
    const about = section("About");
    expect(within(about).getByText(/Made by your marketer Rahul/)).toBeTruthy();
    expect((within(about).getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers Download original only when the original file is kept", async () => {
    const { unmount } = await renderSheet();
    expect(screen.queryByRole("link", { name: /Download original/ })).toBeNull();
    unmount();
    cleanup();
    await renderSheet({ meta: testMeta({ hasOriginal: true }) });
    expect(screen.getByRole("link", { name: /Download original/ }).getAttribute("href")).toBe("/api/resumes/42/original");
  });
});

describe("Resume settings: Danger zone", () => {
  it("Archive confirms, archives, and leaves for My Resumes", async () => {
    await renderSheet();
    fireEvent.click(within(section("Danger zone")).getByRole("button", { name: "Archive" }));
    expect(m.patchMeta).not.toHaveBeenCalled();
    fireEvent.click(within(confirmDialog("Archive this resume?")).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { archived: true }));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/resume-builder"));
  });

  it("archiving the primary says to make another one primary first", async () => {
    await renderSheet({ meta: testMeta({ primary: true }) });
    m.patchMeta.mockResolvedValue(fail(409, "This is your primary resume: make another one primary before archiving it", "PRIMARY_REQUIRED"));
    fireEvent.click(within(section("Danger zone")).getByRole("button", { name: "Archive" }));
    expect(within(confirmDialog("Archive this resume?")).getByText(/make one of them primary first/)).toBeTruthy();
    fireEvent.click(within(confirmDialog("Archive this resume?")).getByRole("button", { name: "Archive" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((a) => a.textContent?.includes("make another one primary before archiving it"))).toBe(true);
    expect(m.push).not.toHaveBeenCalled();
  });

  it("an archived resume offers Unarchive", async () => {
    await renderSheet({ meta: testMeta({ archived: true, lifecycle: "ARCHIVED" }) });
    fireEvent.click(within(section("Danger zone")).getByRole("button", { name: "Unarchive" }));
    fireEvent.click(within(confirmDialog("Unarchive this resume?")).getByRole("button", { name: "Unarchive" }));
    await waitFor(() => expect(m.patchMeta).toHaveBeenCalledWith(42, { archived: false }));
    expect(m.push).not.toHaveBeenCalled();
  });

  it("Delete confirms, deletes and leaves; an application using it (409) is explained", async () => {
    await renderSheet();
    m.deleteResume.mockResolvedValueOnce(fail(409, "An application uses this resume. Archive it instead.")).mockResolvedValue(ok(null));
    fireEvent.click(within(section("Danger zone")).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(confirmDialog("Delete this resume?")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(m.deleteResume).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText(/Archive it instead/)).length).toBeGreaterThan(0);
    expect(m.push).not.toHaveBeenCalled();

    fireEvent.click(within(section("Danger zone")).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(confirmDialog("Delete this resume?")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/resume-builder"));
  });
});

describe("Resume settings: the other states", () => {
  it("an uploaded resume cannot be shared and says why", async () => {
    await renderSheet({
      meta: testMeta({ kind: "UPLOADED", source: { kind: "UPLOADED", origin: null, tailoredFrom: null, madeBy: null, approvalRequired: false, approvedAt: null }, templateId: null }),
    });
    expect(screen.getByText(/Only resumes built in Kiwiply can be shared/)).toBeTruthy();
    expect(screen.queryByTestId("people-block")).toBeNull();
    expect(screen.getByText("Uploaded")).toBeTruthy();
  });

  it("reads the metadata itself when the editor has none yet", async () => {
    m.getMeta.mockResolvedValue(ok(testMeta()));
    render(
      <ToastProvider>
        <ResumeSettingsSheet resumeId={42} meta={null} onMeta={metaSpy} config={DEFAULT_BUILDER_CONFIG} active phone={false} />
      </ToastProvider>,
    );
    expect(screen.getByText(/Loading details/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(metaSpy).toHaveBeenCalled());
  });

  it("on a phone the Who viewed sheet is fullscreen", async () => {
    m.getViews.mockResolvedValue(ok([{ viewerKind: "USER", viewerLabel: "jane@example.com", what: "PAGE", viewedAt: hoursAgo(1) }]));
    await renderSheet({ access: overview({ viewers: 1 }), phone: true });
    fireEvent.click(await screen.findByRole("button", { name: "See all" }));
    const sheet = await screen.findByRole("dialog", { name: "Who viewed this resume" });
    expect(sheet.closest("[data-mode]")?.getAttribute("data-mode")).toBe("fullscreen");
  });

  it("and on a desktop it is an overlay", async () => {
    m.getViews.mockResolvedValue(ok([]));
    await renderSheet({ access: overview({ viewers: 1 }) });
    fireEvent.click(await screen.findByRole("button", { name: "See all" }));
    const sheet = await screen.findByRole("dialog", { name: "Who viewed this resume" });
    expect(sheet.closest("[data-mode]")?.getAttribute("data-mode")).toBe("overlay");
  });
});

describe("Resume settings: links and people the organization paused", () => {
  const CONSULTANT_OFF: ResumeBuilderConfig = {
    ...DEFAULT_BUILDER_CONFIG,
    capabilities: { ...PERSONAL_CAPABILITIES, mode: "consultant", shareLinks: false, deleteResume: false, archiveResume: false, setPrimary: false, ai: false, tailor: false },
  };

  async function renderPaused(access: AccessOverview) {
    m.getAccess.mockResolvedValue(ok(access));
    render(<Harness initial={testMeta()} config={CONSULTANT_OFF} />);
    await waitFor(() => expect(m.getAccess).toHaveBeenCalled());
    return screen.findByTestId("paused-shares");
  }

  it("lists them read-only as Paused by your organization, with no way to create new ones", async () => {
    const box = await renderPaused(overview({ links: [testLink({ id: 9, label: "Sent to Acme", paused: true })], grants: [person({ id: 5, paused: true })] }));
    expect(within(box).getByRole("heading", { name: "Paused by your organization" })).toBeTruthy();
    expect(within(box).getByText("Sent to Acme")).toBeTruthy();
    expect(within(box).getByText("Jane Doe")).toBeTruthy();
    // read-only: no address to copy, no download switch, no add or create control anywhere (the Visibility card is hidden with the capability)
    expect(within(box).queryByRole("switch")).toBeNull();
    expect(within(box).queryByLabelText("Share link")).toBeNull();
    expect(screen.queryByRole("button", { name: /Create link|Add person/ })).toBeNull();
    expect(screen.queryByTestId("links-block")).toBeNull();
    expect(screen.queryByTestId("people-block")).toBeNull();
  });

  it("can still revoke a paused link, after a confirmation", async () => {
    m.revokeAccess.mockResolvedValue(ok(null));
    const box = await renderPaused(overview({ links: [testLink({ id: 9, label: "Sent to Acme", paused: true })] }));
    fireEvent.click(within(box).getByRole("button", { name: /Revoke link/ }));
    expect(m.revokeAccess).not.toHaveBeenCalled();
    fireEvent.click(within(confirmDialog("Revoke this link?")).getByRole("button", { name: "Revoke link" }));
    await waitFor(() => expect(m.revokeAccess).toHaveBeenCalledWith(42, 9));
  });

  it("draws nothing when no grant is paused (or it has expired), so a plain consultant resume shows no extra card", async () => {
    m.getAccess.mockResolvedValue(ok(overview({ links: [testLink({ id: 9, paused: false }), testLink({ id: 10, paused: true, expired: true })] })));
    render(<Harness initial={testMeta()} config={CONSULTANT_OFF} />);
    await waitFor(() => expect(m.getAccess).toHaveBeenCalled());
    await screen.findByTestId("resume-settings");
    expect(screen.queryByTestId("paused-shares")).toBeNull();
  });
});
