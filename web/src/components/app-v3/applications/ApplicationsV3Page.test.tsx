import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { Application } from "@/lib/applications";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/components/app-v2/common", async (orig) => {
  const real = await orig<typeof import("@/components/app-v2/common")>();
  return { ...real, HeroBand: ({ title }: { title: ReactNode }) => <header>{title}</header> };
});
// The sheet has its own tests; here it is only "which application is open".
vi.mock("./ApplicationDetail", () => ({
  default: ({ id }: { id: number | null }) => (id === null ? null : <div role="dialog" aria-label="detail" data-open-id={id} />),
}));

import ApplicationsV3Page, { tabOf } from "./ApplicationsV3Page";

const row = (id: number, over: Partial<Application> = {}): Application => ({
  id,
  company: `Company ${id}`,
  roleTitle: `Role ${id}`,
  location: "Remote",
  status: "APPLIED",
  appliedAt: "2026-10-08T12:00:00Z",
  createdAt: "2026-10-01T12:00:00Z",
  ...over,
});

const SUMMARY = { ALL: 42, DRAFT: 1, SAVED: 4, APPLIED: 18, IN_REVIEW: 10, INTERVIEW: 8, OFFER: 1, REJECTED: 0, WITHDRAWN: 0, GHOSTED: 3, ARCHIVED: 5 };
const urls: string[] = [];
let respond: (url: string) => unknown;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  urls.length = 0;
  window.history.replaceState(null, "", "/applications");
  respond = () => ({ items: [row(1), row(2, { status: "INTERVIEW", nextStep: { label: "Video interview", at: "2026-10-14T14:00:00Z" } })], total: 42, page: 0, size: 20, summary: SUMMARY });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const body = respond(url);
      return body instanceof Response ? body : json(body);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (props: { initialOpenId?: number | null } = {}) =>
  render(
    <ToastProvider>
      <ApplicationsV3Page {...props} />
    </ToastProvider>,
  );

describe("My Applications (list v2)", () => {
  it("tab counts come from the server's summary, not from the rows on screen", async () => {
    mount();
    await screen.findAllByText("Role 1");
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["All42", "Applied18", "Under review10", "Interviews8", "Offers1", "Rejected0", "Archived5"]);
    expect(screen.getByText("Showing 1–2 of 42 applications")).toBeTruthy();
  });

  it("shows the next step the server derived", async () => {
    mount();
    await screen.findAllByText("Role 2");
    expect(screen.getAllByText("Video interview").length).toBeGreaterThan(0);
  });

  it("a tab asks the server for that status, and Archived for archived rows", async () => {
    mount();
    await screen.findAllByText("Role 1");
    fireEvent.click(screen.getByRole("tab", { name: /^Interviews/ }));
    await waitFor(() => expect(urls.at(-1)).toContain("status=INTERVIEW"));
    expect(window.location.search).toContain("status=INTERVIEW");
    fireEvent.click(screen.getByRole("tab", { name: /^Archived/ }));
    await waitFor(() => expect(urls.at(-1)).toContain("archived=true"));
    expect(urls.at(-1)).not.toContain("status=");
    fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
    await waitFor(() => expect(urls.at(-1)).not.toContain("archived"));
  });

  it("real paging: page 2 is a second request, and the footer follows", async () => {
    mount();
    await screen.findAllByText("Role 1");
    respond = () => ({ items: [row(21)], total: 42, page: 1, size: 20, summary: SUMMARY });
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await screen.findAllByText("Role 21");
    expect(urls.at(-1)).toContain("page=1");
    expect(screen.getByText("Showing 21–21 of 42 applications")).toBeTruthy();
  });

  it("search and sort go to the server", async () => {
    mount();
    await screen.findAllByText("Role 1");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search applications" }), { target: { value: "acme" } });
    await waitFor(() => expect(urls.at(-1)).toContain("q=acme"));
  });

  it("a filtered tab with no rows says so; a search with no rows offers to clear it", async () => {
    mount();
    await screen.findAllByText("Role 1");
    respond = () => ({ items: [], total: 0, page: 0, size: 20, summary: SUMMARY });
    fireEvent.click(screen.getByRole("tab", { name: /^Offers/ }));
    expect(await screen.findByText("Nothing in this tab yet")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search applications" }), { target: { value: "zzz" } });
    expect(await screen.findByText('Nothing matches "zzz"')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
  });

  it("a brand-new account gets the mascot empty state, never a sample row", async () => {
    respond = () => ({ items: [], total: 0, page: 0, size: 20, summary: { ...SUMMARY, ALL: 0, ARCHIVED: 0, SAVED: 0, GHOSTED: 0 } });
    const { container } = mount();
    expect(await screen.findByText("No applications yet")).toBeTruthy();
    expect(container.querySelector("[data-empty-state='page']")).not.toBeNull();
    expect(screen.queryByText("Google")).toBeNull();
    expect(screen.getByRole("link", { name: "Find jobs" }).getAttribute("href")).toBe("/jobs");
  });

  it("a failed load is an error with Retry, not a blank page", async () => {
    respond = () => json({ message: "boom" }, 500);
    mount();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("?app=<id> opens that application, and opening a row records it in the URL without losing the filters", async () => {
    mount({ initialOpenId: 4 });
    expect((await screen.findByRole("dialog")).getAttribute("data-open-id")).toBe("4");
    await screen.findAllByText("Role 1");
    fireEvent.click(screen.getByRole("tab", { name: /^Applied/ }));
    await waitFor(() => expect(window.location.search).toContain("status=APPLIED"));
    fireEvent.click(screen.getAllByRole("button", { name: "Role 1" })[0]);
    await waitFor(() => expect(screen.getByRole("dialog").getAttribute("data-open-id")).toBe("1"));
    const p = new URLSearchParams(window.location.search);
    expect(p.get("app")).toBe("1");
    expect(p.get("status")).toBe("APPLIED");
  });
});

describe("tabOf", () => {
  it("reads the tab from the filters", () => {
    expect(tabOf({})).toBe("all");
    expect(tabOf({ status: "OFFER" })).toBe("offer");
    expect(tabOf({ status: "IN_REVIEW" })).toBe("in-review");
    expect(tabOf({ archived: "true", status: undefined })).toBe("archived");
    expect(tabOf({ status: ["APPLIED", "OFFER"] })).toBe("all");
  });
});
