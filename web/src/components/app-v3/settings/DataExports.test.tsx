import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ExportJob } from "@/lib/account-privacy";

import DataExports from "./DataExports";

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const job = (over: Partial<ExportJob> = {}): ExportJob => ({
  id: 1,
  status: "READY",
  requestedAt: "2026-10-16T10:00:00Z",
  finishedAt: "2026-10-16T10:02:00Z",
  expiresAt: "2026-10-19T10:02:00Z",
  sizeBytes: 13_000_000,
  fileCount: 5,
  skippedCount: 0,
  error: null,
  downloadPath: "/api/account/exports/1/file?exp=1790000000&sig=abc_-D",
  ...over,
});

type Handler = (url: string, method: string) => Response | Promise<Response>;
function stubFetch(handler: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => handler(url, init?.method ?? "GET"));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const calls = (fn: ReturnType<typeof stubFetch>, method: string) => fn.mock.calls.filter((c) => (c[1]?.method ?? "GET") === method);

const setup = () =>
  render(
    <ToastProvider>
      <DataExports />
    </ToastProvider>,
  );

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("DataExports (prepare my data export)", () => {
  it("renders nothing when the API says 404", async () => {
    const fn = stubFetch(() => jsonRes({ title: "Not found" }, 404));
    const { container } = setup();
    await waitFor(() => expect(fn).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[data-data-exports]")).toBeNull());
    expect(screen.queryByRole("button", { name: "Prepare my data export" })).toBeNull();
  });

  it("lists exports with status, size and a Download link on the ready one", async () => {
    stubFetch(() =>
      jsonRes([
        job({ id: 3, skippedCount: 2 }),
        job({ id: 2, status: "FAILED", error: "Ran out of space", downloadPath: null, sizeBytes: null }),
        job({ id: 1, status: "EXPIRED", downloadPath: null }),
      ]),
    );
    setup();
    const ready = (await screen.findByText("Ready")).closest("li") as HTMLElement;
    expect(within(ready).getByText(/12\.4 MB/)).toBeTruthy();
    expect(within(ready).getByText(/5 files/)).toBeTruthy();
    expect(within(ready).getByText(/2 files were left out/)).toBeTruthy();
    expect(within(ready).getByRole("link", { name: /Download/ }).getAttribute("href")).toBe("/api/account/exports/1/file?exp=1790000000&sig=abc_-D");

    const failed = screen.getByText("Failed").closest("li") as HTMLElement;
    expect(within(failed).getByText(/Ran out of space/)).toBeTruthy();
    expect(within(failed).queryByRole("link")).toBeNull();
    const expired = screen.getByText("Expired").closest("li") as HTMLElement;
    expect(within(expired).getByText(/link has expired/)).toBeTruthy();
    expect(within(expired).queryByRole("link")).toBeNull();
  });

  it("never follows a download path that is not our own export route", async () => {
    stubFetch(() => jsonRes([job({ downloadPath: "https://evil.example/steal.zip" })]));
    setup();
    const ready = (await screen.findByText("Ready")).closest("li") as HTMLElement;
    expect(within(ready).queryByRole("link")).toBeNull();
  });

  it("says so when there are none yet", async () => {
    stubFetch(() => jsonRes([]));
    setup();
    expect(await screen.findByText("No exports yet.")).toBeTruthy();
  });

  it("queues an export, then follows it until it is ready and offers the download", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let state: ExportJob | null = null;
    const fn = stubFetch((url, method) => {
      if (method === "POST") {
        state = job({ id: 9, status: "QUEUED", sizeBytes: null, fileCount: null, finishedAt: null, expiresAt: null, downloadPath: null });
        return jsonRes(state, 202);
      }
      if (url.endsWith("/exports/9")) {
        state = job({ id: 9, downloadPath: "/api/account/exports/9/file?exp=1790000000&sig=zz" });
        return jsonRes(state);
      }
      return jsonRes(state ? [state] : []);
    });
    setup();
    const button = await screen.findByRole("button", { name: "Prepare my data export" });
    await act(async () => {
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls(fn, "POST")[0][0]).toBe("/api/account/exports");
    expect(screen.getByText("Waiting to start")).toBeTruthy();
    // one at a time: the button is busy while the job runs
    expect((screen.getByRole("button", { name: /Preparing your export/ }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });
    expect(fn.mock.calls.some((c) => c[0] === "/api/account/exports/9")).toBe(true);
    const row = screen.getByText("Ready").closest("li") as HTMLElement;
    expect(within(row).getByRole("link", { name: /Download/ }).getAttribute("href")).toBe("/api/account/exports/9/file?exp=1790000000&sig=zz");
    expect(screen.getByText("Your data export is ready")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Prepare my data export" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("explains the daily limit instead of failing silently", async () => {
    stubFetch((_url, method) => (method === "POST" ? jsonRes({ detail: "Too many exports requested today" }, 429) : jsonRes([])));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Prepare my data export" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/today's limit/);
  });

  it("offers a retry when the list can't be loaded", async () => {
    let up = false;
    stubFetch(() => (up ? jsonRes([]) : jsonRes({}, 500)));
    setup();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't load your exports/);
    up = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No exports yet.")).toBeTruthy();
  });
});
