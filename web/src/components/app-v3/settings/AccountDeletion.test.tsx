import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { DeletionView } from "@/lib/account-privacy";

const push = vi.fn();
const refresh = vi.fn();
const router = { push, refresh }; // one object, like Next's stable router (a fresh one per render would re-run the loaders)
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import AccountDeletion from "./AccountDeletion";

const HOUR = 3_600_000;
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const none: DeletionView = { status: "NONE", requestedAt: null, purgeAfter: null, graceHours: 24, canUndo: false };
const pendingIn = (ms: number, over: Partial<DeletionView> = {}): DeletionView => ({
  status: "PENDING",
  requestedAt: new Date(Date.now() - 60_000).toISOString(),
  purgeAfter: new Date(Date.now() + ms).toISOString(),
  graceHours: 24,
  canUndo: true,
  ...over,
});

type Handler = (method: string) => Response | Promise<Response>;
function stubFetch(handler: Handler) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => handler(init?.method ?? "GET"));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const calls = (fn: ReturnType<typeof stubFetch>, method: string) => fn.mock.calls.filter((c) => (c[1]?.method ?? "GET") === method);

const setup = () =>
  render(
    <ToastProvider>
      <AccountDeletion />
    </ToastProvider>,
  );

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AccountDeletion (scheduled deletion with an undo window)", () => {
  it("shows a plain note, not controls, when the API says 404 (an employer-managed account)", async () => {
    stubFetch(() => jsonRes({ title: "Not found" }, 404));
    setup();
    expect(await screen.findByText(/managed by your organization/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
  });

  it("asks once, inline, and says how long the undo window is", async () => {
    stubFetch(() => jsonRes(none));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    expect(screen.getByText(/delete your account in 24 hours/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schedule deletion" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep my account" }));
    expect(screen.getByRole("button", { name: "Delete account" })).toBeTruthy();
  });

  it("schedules the deletion, shows the countdown with Cancel, and offers Undo in a toast", async () => {
    let state: DeletionView = none;
    const fn = stubFetch((method) => {
      if (method === "POST") {
        state = pendingIn(23 * HOUR + 40 * 60_000 + 30_000);
        return jsonRes(state, 202);
      }
      if (method === "DELETE") {
        state = none;
        return jsonRes(state);
      }
      return jsonRes(state);
    });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule deletion" }));

    await waitFor(() => expect(screen.getByText(/Your account will be deleted in/)).toBeTruthy());
    expect(document.querySelector("[data-countdown]")?.textContent).toBe("23 h 41 min");
    expect(screen.getByRole("button", { name: "Cancel deletion" })).toBeTruthy();
    expect(calls(fn, "POST")).toHaveLength(1);
    expect(calls(fn, "POST")[0][0]).toBe("/api/account/deletion-request");
    expect(push).not.toHaveBeenCalled();

    // the toast's Undo withdraws the request
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls(fn, "DELETE")).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete account" })).toBeTruthy());
    expect(screen.queryByText(/Your account will be deleted in/)).toBeNull();
  });

  it("a request already pending when the page opens shows its countdown, and Cancel withdraws it", async () => {
    let state: DeletionView = pendingIn(5 * HOUR + 20_000);
    const fn = stubFetch((method) => {
      if (method === "DELETE") {
        state = none;
        return jsonRes(state);
      }
      return jsonRes(state);
    });
    setup();
    expect(await screen.findByText(/Your account will be deleted in/)).toBeTruthy();
    expect(document.querySelector("[data-countdown]")?.textContent).toBe("5 h 1 min");
    fireEvent.click(screen.getByRole("button", { name: "Cancel deletion" }));
    await waitFor(() => expect(calls(fn, "DELETE")).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete account" })).toBeTruthy());
  });

  it("the countdown ticks down by itself", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    stubFetch(() => jsonRes(pendingIn(2 * HOUR + 30_000)));
    setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(document.querySelector("[data-countdown]")?.textContent).toBe("2 h 1 min");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60_000);
    });
    expect(document.querySelector("[data-countdown]")?.textContent).toBe("1 h 31 min");
  });

  it("once the erasure has started there is no Cancel, only the status", async () => {
    stubFetch(() => jsonRes(pendingIn(-1000, { status: "RUNNING", canUndo: false })));
    setup();
    expect(await screen.findByText(/Deleting your account now/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel deletion" })).toBeNull();
  });

  it("a zero-hour window erases at once: straight home", async () => {
    stubFetch((method) => (method === "POST" ? jsonRes({ status: "DELETED", graceHours: 0, canUndo: false }) : jsonRes({ ...none, graceHours: 0 })));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule deletion" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("says why when scheduling fails, and keeps the choice on screen", async () => {
    stubFetch((method) => (method === "POST" ? jsonRes({ error: "This is a demo account — changes aren't saved" }, 403) : jsonRes(none)));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule deletion" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/demo account/);
    expect(screen.getByRole("button", { name: "Schedule deletion" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("offers a retry when the status can't be loaded", async () => {
    let up = false;
    stubFetch(() => (up ? jsonRes(none) : jsonRes({}, 500)));
    setup();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't load/);
    up = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Delete account" })).toBeTruthy();
  });

  it("goes home when the session has ended because the erasure finished", async () => {
    stubFetch(() => jsonRes({}, 401));
    setup();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
