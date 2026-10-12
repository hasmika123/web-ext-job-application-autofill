import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { Resume } from "@/components/ResumeList";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/components/app-v2/resume/ResumeDrawer", () => ({ default: () => <div data-testid="drawer" /> }));

import MyResumesPage from "./MyResumesPage";

const fetchMock = vi.fn<(url: string) => Promise<Response>>();
const mine: Resume[] = [{ id: 1, label: "Software Engineer", kind: "BUILT", templateId: "modern", defaultResume: true, archived: false, createdAt: "2026-09-15T12:00:00Z" }];

const renderPage = () =>
  render(
    <ToastProvider>
      <MyResumesPage resumes={mine} usage={{}} baseProfile={{}} isPro={false} config={DEFAULT_BUILDER_CONFIG} />
    </ToastProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("My Resumes: Shared with me tab (R3.11)", () => {
  it("is a tab that loads only when opened, and my own list is unchanged", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "Shared with me" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 3, name: "Software Engineer" })).toBeTruthy();
  });

  it("lists what was shared, each opening the read-only viewer", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ resumeId: 77, name: "Backend", owner: "Ada Lovelace", role: "VIEW", via: "USER" }]), { status: 200 }),
    );
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Shared with me" }));
    const link = await screen.findByRole("link", { name: /Backend/ });
    expect(link.getAttribute("href")).toBe("/resume-builder/shared/77");
    expect(link.textContent).toContain("Ada Lovelace");
    expect(fetchMock).toHaveBeenCalledWith("/api/resumes/shared-with-me", { cache: "no-store" });
    // my own resumes and their filters are not shown on this tab
    expect(screen.queryByRole("heading", { level: 3, name: "Software Engineer" })).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("says so when nothing is shared, and when the list cannot be loaded", async () => {
    fetchMock.mockResolvedValueOnce(new Response("[]", { status: 200 }));
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Shared with me" }));
    expect(await screen.findByText("Nothing shared with you")).toBeTruthy();

    cleanup();
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Shared with me" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Couldn't load/));
  });

  it("going back to All Resumes shows my list again", async () => {
    fetchMock.mockResolvedValue(new Response("[]", { status: 200 }));
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Shared with me" }));
    await screen.findByText("Nothing shared with you");
    fireEvent.click(screen.getByRole("tab", { name: /^All Resumes/ }));
    expect(screen.getByRole("heading", { level: 3, name: "Software Engineer" })).toBeTruthy();
  });
});
