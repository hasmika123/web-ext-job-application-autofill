import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { Application } from "@/lib/applications";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/components/app-v2/common", async (orig) => {
  const real = await orig<typeof import("@/components/app-v2/common")>();
  return { ...real, HeroBand: ({ title }: { title: ReactNode }) => <header>{title}</header> };
});

import SavedV3Page, { savedTabOf } from "./SavedV3Page";

const job = (id: number, over: Partial<Application> = {}): Application => ({
  id,
  company: `Company ${id}`,
  roleTitle: `Role ${id}`,
  location: "Remote",
  salary: "$150k",
  jobMode: "REMOTE",
  jobType: "FULL_TIME",
  jobUrl: `https://jobs.example/${id}`,
  status: "SAVED",
  createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  ...over,
});

const SUMMARY = { ALL: 9, SAVED: 3, APPLIED: 2, IN_REVIEW: 1, INTERVIEW: 1, OFFER: 0, REJECTED: 1, GHOSTED: 0, ARCHIVED: 7 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const calls: { method: string; url: string; body?: unknown }[] = [];
let list: (url: string) => unknown;
let patchStatus = 200;

beforeEach(() => {
  calls.length = 0;
  patchStatus = 200;
  push.mockClear();
  window.history.replaceState(null, "", "/saved");
  list = (url) => {
    // the Not-interested counter asks for one archived row
    if (url.includes("archived=true") && url.includes("size=1")) return { items: [job(99)], total: 5, page: 0, size: 1 };
    return { items: [job(1), job(2)], total: 3, page: 0, size: 20, summary: SUMMARY };
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "PATCH") return patchStatus === 200 ? json({ id: 1 }) : json({ message: "no" }, patchStatus);
      return json(list(url));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = () =>
  render(
    <ToastProvider>
      <SavedV3Page />
    </ToastProvider>,
  );
const patches = () => calls.filter((c) => c.method === "PATCH");
const getsWith = (needle: string) => calls.filter((c) => c.method === "GET" && c.url.includes(needle));

describe("Saved Jobs on real SAVED applications", () => {
  it("opens on To apply (status=SAVED) and the tab counts are the server's", async () => {
    mount();
    await screen.findAllByText("Role 1");
    expect(getsWith("status=SAVED")[0]).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["To apply(3)", "Applied(5)", "Not interested(5)"]));
  });

  it("each card says what it is, links the posting for Apply, and opens its page in My Applications", async () => {
    mount();
    await screen.findAllByText("Role 1");
    expect(screen.getByRole("link", { name: "Apply to Role 1 at Company 1" }).getAttribute("href")).toBe("https://jobs.example/1");
    expect(screen.getAllByText("Remote").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Full-time").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Saved 2 days ago/).length).toBe(2);
    expect(screen.getByRole("link", { name: "Role 1" }).getAttribute("href")).toBe("/applications?app=1");
  });

  it("a job saved without a link has a disabled Apply, not a dead one", async () => {
    list = () => ({ items: [job(1, { jobUrl: null })], total: 1, page: 0, size: 20, summary: SUMMARY });
    mount();
    await screen.findByText("Role 1");
    expect(screen.queryByRole("link", { name: /^Apply to/ })).toBeNull();
    expect(screen.getByText("Apply").getAttribute("aria-disabled")).toBe("true");
  });

  it("Applied asks for the submitted statuses; Not interested asks for archived SAVED", async () => {
    mount();
    await screen.findAllByText("Role 1");
    fireEvent.click(screen.getByRole("tab", { name: /^Applied/ }));
    await waitFor(() => expect(calls.filter((c) => c.method === "GET").at(-1)?.url).toContain("status=APPLIED%2CIN_REVIEW%2CINTERVIEW%2COFFER%2CREJECTED"));
    fireEvent.click(screen.getByRole("tab", { name: /^Not interested/ }));
    await waitFor(() => {
      const u = calls.filter((c) => c.method === "GET").at(-1)?.url ?? "";
      expect(u).toContain("archived=true");
      expect(u).toContain("status=SAVED");
    });
  });

  it("Remove from saved leaves at once, offers Undo, and Undo restores it", async () => {
    mount();
    await screen.findAllByText("Role 1");
    fireEvent.click(screen.getByRole("button", { name: "More actions for Role 1 at Company 1" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove from saved" }));
    await waitFor(() => expect(patches()[0]?.body).toEqual({ archived: true }));
    expect(await screen.findByText("Removed from saved jobs")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(patches()[1]?.body).toEqual({ archived: false }));
  });

  it("a refused removal brings the card back and says so", async () => {
    patchStatus = 500;
    mount();
    await screen.findAllByText("Role 1");
    fireEvent.click(screen.getByRole("button", { name: "More actions for Role 1 at Company 1" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove from saved" }));
    expect(await screen.findByText("Couldn't remove that")).toBeTruthy();
    expect(screen.getAllByText("Role 1").length).toBeGreaterThan(0);
  });

  it("Mark as applied patches the status and can be undone", async () => {
    mount();
    await screen.findAllByText("Role 2");
    fireEvent.click(screen.getByRole("button", { name: "More actions for Role 2 at Company 2" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mark as applied" }));
    await waitFor(() => expect(patches()[0]?.body).toEqual({ status: "APPLIED" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(patches()[1]?.body).toEqual({ status: "SAVED" }));
  });

  it("in Not interested a card can be put back in To apply", async () => {
    window.history.replaceState(null, "", "/saved?status=SAVED&archived=true");
    mount();
    await screen.findAllByText("Role 1");
    fireEvent.click(screen.getByRole("button", { name: "More actions for Role 1 at Company 1" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Put back in To apply" }));
    await waitFor(() => expect(patches()[0]?.body).toEqual({ archived: false }));
    expect(await screen.findByText("Back in your To apply list")).toBeTruthy();
  });

  it("honest empty states per tab: a new account sees the mascot and Find jobs, never a sample card", async () => {
    list = () => ({ items: [], total: 0, page: 0, size: 20, summary: { ...SUMMARY, SAVED: 0, APPLIED: 0, IN_REVIEW: 0, INTERVIEW: 0, REJECTED: 0 } });
    const { container } = mount();
    expect(await screen.findByText("Nothing saved yet")).toBeTruthy();
    expect(container.querySelector("[data-empty-state='page']")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Find jobs" }).getAttribute("href")).toBe("/jobs");
    expect(screen.queryByText("Google")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^Applied/ }));
    expect(await screen.findByText("No applications yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /^Not interested/ }));
    expect(await screen.findByText("Nothing set aside")).toBeTruthy();
  });

  it("a failed load is an error with Retry", async () => {
    list = () => {
      throw new Error("x");
    };
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "boom" }, 500)));
    mount();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("the grid/list toggle is kept", async () => {
    mount();
    await screen.findAllByText("Role 1");
    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    expect(screen.getByRole("button", { name: "Grid view" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("savedTabOf", () => {
  it("reads the tab from the filters", () => {
    expect(savedTabOf({ status: "SAVED" })).toBe("to-apply");
    expect(savedTabOf({ status: ["APPLIED", "IN_REVIEW"] })).toBe("applied");
    expect(savedTabOf({ status: "SAVED", archived: "true" })).toBe("not-interested");
  });
});
