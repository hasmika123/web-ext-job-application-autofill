// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => "/w/consultant/resumes" }));

import { ToastProvider } from "@kiwiply/ui";
import ConsultantResumesPage from "./ResumesPage";

type W = Record<string, unknown>;
const tile = (value: number, extra: W = {}) => ({ value, previous: value - 1, delta: 1, deltaPct: 33.3, sparkline: [0, 1, 2, 3, 4, value], ...extra });

const fixture = (over: W = {}): W => ({
  orgId: 2,
  generatedAt: "2026-10-13T20:00:00Z",
  me: { consultantId: 1, name: "Anika Rao" },
  tiles: { totalResumes: tile(2), primary: { value: 1, title: "Technical Consultant Resume" }, totalViews: tile(24), totalDownloads: tile(12), timesShared: tile(8) },
  resumes: [
    { id: 11, title: "Technical Consultant Resume", targetRole: "General consulting opportunities", primary: true, updatedAt: "2026-10-14T10:24:00Z", visibility: "PUBLIC", versionNo: 3, approvalStatus: "APPROVED" },
    { id: 12, title: "Data Engineer Resume", targetRole: "Data & Analytics roles", primary: false, updatedAt: "2026-10-10T15:18:00Z", visibility: "PRIVATE", versionNo: 2, approvalStatus: "PENDING" },
  ],
  resumeStrength: { percent: 78, hasResume: true, checks: [{ key: "contact", label: "Contact information", done: true }, { key: "certifications", label: "Add certifications", done: false }] },
  improvements: [
    { key: "primary", title: "Choose a primary resume", hint: "The one used in your applications", action: "set-primary", href: null, resumeId: 12 },
    { key: "summary", title: "Enhance professional summary", hint: "Make a stronger first impression", action: "link", href: "/w/consultant/profile", resumeId: null },
  ],
  recentActivity: [
    { kind: "VIEWED", resumeId: 11, resumeTitle: "Technical Consultant Resume", versionNo: 3, at: "2026-10-14T11:32:00Z" },
    { kind: "UPDATED", resumeId: 11, resumeTitle: "Technical Consultant Resume", versionNo: 3, at: "2026-10-08T14:11:00Z" },
  ],
  ...over,
});

const PREVIEW = { id: 11, title: "Technical Consultant Resume", targetRole: null, versionNo: 3, visibility: "PUBLIC", updatedAt: "2026-10-14T10:24:00Z", name: "Anika Rao", email: "anika@example.org", jobTitle: "Engineer", headline: "Full Stack Developer", summary: "Builds things.", skills: ["Java"], experience: [{ title: "Lead", employer: "Acme", startYear: 2020, endYear: null }] };

let calls: { url: string; method: string; body: string | null }[] = [];
type Handler = (url: string, method: string, body: string | null) => { status: number; json?: unknown } | undefined;
let handler: Handler;

const respond = (status: number, json?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => json });

beforeEach(() => {
  push.mockClear();
  calls = [];
  handler = () => undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : null;
      calls.push({ url, method, body });
      const custom = handler(url, method, body);
      if (custom) return respond(custom.status, custom.json);
      if (url.endsWith("/preview")) return respond(200, PREVIEW);
      if (method === "GET") return respond(200, fixture());
      return respond(204);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (builder?: ComponentProps<typeof ConsultantResumesPage>["builder"]) =>
  render(
    <ToastProvider>
      <ConsultantResumesPage orgId={2} firstName="Anika Rao" builder={builder} />
    </ToastProvider>,
  );

const BUILDER = { profile: { itemCount: 0, roles: 0, schools: 0, skills: 0, score: null, headline: null }, defaultTemplateId: "modern", cap: { count: 2, max: 25 }, targetSuggestions: [] };

describe("ConsultantResumesPage", () => {
  it("draws the tiles, the resumes, strength, improvements and activity from the API", async () => {
    mount();
    expect(await screen.findByText("Data Engineer Resume")).toBeTruthy();
    const views = document.querySelector("[data-stat-tile=totalViews]")!;
    expect(within(views as HTMLElement).getByText("24")).toBeTruthy();
    expect(within(views as HTMLElement).getByText("+33%")).toBeTruthy();
    const total = document.querySelector("[data-stat-tile=totalResumes]")!;
    expect(within(total as HTMLElement).getByText("+1")).toBeTruthy();
    expect(within(document.querySelector("[data-stat-tile=primary]") as HTMLElement).getByText("Actively used in applications")).toBeTruthy();

    const row = document.querySelector("[data-resume='11']") as HTMLElement;
    expect(within(row).getByText("Primary")).toBeTruthy();
    expect(within(row).getByText("Public")).toBeTruthy();
    expect(within(row).getByText("v3")).toBeTruthy();
    const pending = document.querySelector("[data-resume='12']") as HTMLElement;
    expect(within(pending).getByText("Private")).toBeTruthy();
    expect(within(pending).getByText("Awaiting approval")).toBeTruthy();

    expect(document.querySelector("[data-check=certifications]")!.getAttribute("data-done")).toBe("false");
    expect(screen.getByText("78%")).toBeTruthy();
    expect(document.querySelector("[data-improvement=primary]")).toBeTruthy();
    expect(screen.getByText("Resume viewed")).toBeTruthy();
    expect(screen.getByText("Technical Consultant Resume (v3)")).toBeTruthy();
    expect(document.querySelector("[data-sample]")).toBeNull();
  });

  it("says so when there is nothing yet and draws no change chip without a comparison", async () => {
    handler = (_u, m) =>
      m === "GET"
        ? { status: 200, json: fixture({ resumes: [], improvements: [], recentActivity: [], tiles: { totalResumes: tile(0, { delta: null, deltaPct: null, previous: null, sparkline: [] }), primary: { value: 0, title: null }, totalViews: tile(0, { deltaPct: null }), totalDownloads: tile(0, { deltaPct: null }), timesShared: tile(0, { deltaPct: null }) } }) }
        : undefined;
    mount();
    expect(await screen.findByText(/don.t have a resume yet/)).toBeTruthy();
    expect(screen.getByText(/Nothing to suggest right now/)).toBeTruthy();
    expect(screen.getByText(/No activity yet/)).toBeTruthy();
    expect(screen.getByText("No primary resume yet")).toBeTruthy();
    expect(screen.queryByText("vs last month")).toBeNull();
  });

  it("Apply on the primary suggestion calls the set-primary endpoint and reloads", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Apply: Choose a primary resume" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/resumes/12/primary"))).toBe(true));
    await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.url.endsWith("/resumes")).length).toBeGreaterThan(1));
  });

  it("View opens the paper preview and records a VIEWED activity", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "View Technical Consultant Resume" }));
    const paper = await screen.findByLabelText("Technical Consultant Resume preview");
    expect(within(paper).getByText("Builds things.")).toBeTruthy();
    expect(within(paper).getByText("Java")).toBeTruthy();
    await waitFor(() => {
      const rec = calls.find((c) => c.method === "POST" && c.url.endsWith("/resumes/11/activity"));
      expect(rec?.body).toBe(JSON.stringify({ kind: "VIEWED" }));
    });
  });

  it("Edit saves only what changed and shows the server's refusal", async () => {
    handler = (u, m) => (m === "PATCH" ? { status: 422, json: { error: "name: looks like a Social Security number" } } : undefined);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Data Engineer Resume" }));
    const input = (await screen.findByLabelText("Resume name")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Data Engineer Resume"));
    fireEvent.change(input, { target: { value: "123-45-6789" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Social Security");
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url.endsWith("/resumes/12")).toBe(true);
    expect(patch.body).toBe(JSON.stringify({ name: "123-45-6789" }));
  });

  it("Create New Resume opens the SAME chooser as the personal app, creates through the tenant-aware route and opens the editor inside the workspace", async () => {
    handler = (u, m) => (m === "POST" && u.endsWith("/me-workspace/resumes/built") ? { status: 201, json: { orgResumeId: 5, resumeId: 77, row: {} } } : undefined);
    mount(BUILDER);
    fireEvent.click(await screen.findByRole("button", { name: "Create New Resume" }));
    expect(await screen.findByText("Start your resume from")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Start from scratch/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create resume" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/w/consultant/resumes/77"));
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/me-workspace/resumes/built"))!;
    expect(post.url).toBe("/api/orgs/2/me-workspace/resumes/built");
    expect(JSON.parse(post.body ?? "{}")).toMatchObject({ source: { kind: "scratch" }, label: "My resume" });
  });

  it("the quick actions open the same chooser on the right card (Import = upload)", async () => {
    mount(BUILDER);
    await screen.findByText("Data Engineer Resume");
    fireEvent.click(document.querySelector("[data-quick=import]") as HTMLElement);
    expect(await screen.findByText("Start your resume from")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Upload a resume/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("at the organization license's cap the chooser does not open and the dialog says who to ask (no plans link)", async () => {
    mount({ ...BUILDER, cap: { count: 25, max: 25 } });
    fireEvent.click(await screen.findByRole("button", { name: "Create New Resume" }));
    expect(await screen.findByText("You've used 25 of 25 resumes")).toBeTruthy();
    expect(screen.getByText(/organization admin/)).toBeTruthy();
    expect(screen.queryByText("Start your resume from")).toBeNull();
    expect(document.querySelector("a[href='/pricing']")).toBeNull();
  });

  it("Edit on a resume made in the builder opens it in the workspace's editor, not the details sheet", async () => {
    handler = (u, m) =>
      m === "GET" && u === "/api/orgs/2/me-workspace/resumes"
        ? { status: 200, json: fixture({ resumes: [{ id: 11, title: "Built resume", targetRole: null, primary: true, updatedAt: "2026-10-14T10:24:00Z", visibility: "PUBLIC", versionNo: 1, approvalStatus: "APPROVED", resumeId: 77, awaitingMyApproval: false }] }) }
        : undefined;
    mount(BUILDER);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Built resume" }));
    expect(push).toHaveBeenCalledWith("/w/consultant/resumes/77");
    expect(screen.queryByLabelText("Resume name")).toBeNull();
  });

  it("a resume a marketer made waits for the consultant: Approve and Send back are theirs, with a note", async () => {
    handler = (u, m) => {
      if (m === "GET" && u === "/api/orgs/2/me-workspace/resumes") {
        return { status: 200, json: fixture({ resumes: [{ id: 12, title: "Made by Sarah", targetRole: null, primary: false, updatedAt: "2026-10-14T10:24:00Z", visibility: "INTERNAL", versionNo: 1, approvalStatus: "PENDING", resumeId: 88, awaitingMyApproval: true }] }) };
      }
      return undefined;
    };
    mount(BUILDER);
    expect(await screen.findByText(/Made for you/)).toBeTruthy();
    // it can not become primary until approved
    fireEvent.click(screen.getByRole("button", { name: "Approve Made by Sarah" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/resumes/12/approve"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Send back Made by Sarah" }));
    fireEvent.change(await screen.findByLabelText("What should change"), { target: { value: "Please add my 2019 role" } });
    fireEvent.click(screen.getByRole("button", { name: "Send back" }));
    await waitFor(() => {
      const c = calls.find((x) => x.method === "POST" && x.url.endsWith("/resumes/12/request-changes"));
      expect(c?.body).toBe(JSON.stringify({ note: "Please add my 2019 role" }));
    });
  });

  it("duplicates a resume through the API", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Duplicate Data Engineer Resume" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/resumes/12/duplicate"))).toBe(true));
  });

  it("shows the role panel when the API says 404", async () => {
    handler = () => ({ status: 404 });
    mount();
    expect(await screen.findByText("This page isn't part of your role")).toBeTruthy();
  });

  it("shows a retry when the page fails to load", async () => {
    handler = () => ({ status: 500 });
    mount();
    expect(await screen.findByText(/didn.t load/)).toBeTruthy();
  });
});
