import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfInfo } from "@/lib/resume-doc";

const getPdfStatus = vi.fn<(id: number) => Promise<PdfInfo | null>>();
const requestPdfNow = vi.fn<(id: number) => Promise<boolean>>();
vi.mock("@/lib/resume-doc", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-doc")>()),
  getPdfStatus: (id: number) => getPdfStatus(id),
  requestPdfNow: (id: number) => requestPdfNow(id),
}));

import { usePdfStatus } from "./usePdfStatus";

// The cadence and window are whatever the server says; the test picks its own numbers.
const POLL = 5_000;
const WINDOW = 20_000;
const info = (status: PdfInfo["status"], over: Partial<PdfInfo> = {}): PdfInfo => ({ status, pollMs: POLL, pollWindowMs: WINDOW, ...over });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
  getPdfStatus.mockReset();
  requestPdfNow.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const settle = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("usePdfStatus", () => {
  it("shows the status the document came with and does not poll a READY PDF", async () => {
    const { result } = renderHook(() => usePdfStatus(42, info("READY"), null));
    expect(result.current.pdf?.status).toBe("READY");
    await settle(WINDOW * 2);
    expect(getPdfStatus).not.toHaveBeenCalled();
  });

  it("a save marks the PDF PENDING and polls at the server's cadence until READY", async () => {
    getPdfStatus.mockResolvedValueOnce(info("RUNNING")).mockResolvedValueOnce(info("READY"));
    const { result, rerender } = renderHook(({ at }) => usePdfStatus(42, info("READY"), at), { initialProps: { at: null as number | null } });

    rerender({ at: Date.now() }); // a successful save
    expect(result.current.pdf?.status).toBe("PENDING");

    await settle(POLL - 1);
    expect(getPdfStatus).not.toHaveBeenCalled();
    await settle(1);
    expect(getPdfStatus).toHaveBeenCalledTimes(1);
    expect(result.current.pdf?.status).toBe("RUNNING");

    await settle(POLL);
    expect(getPdfStatus).toHaveBeenCalledTimes(2);
    expect(result.current.pdf?.status).toBe("READY");

    await settle(WINDOW); // READY: it stops asking
    expect(getPdfStatus).toHaveBeenCalledTimes(2);
  });

  it("stops asking once the window after the last save is over, and a newer save restarts it", async () => {
    getPdfStatus.mockResolvedValue(info("PENDING"));
    const { result, rerender } = renderHook(({ at }) => usePdfStatus(42, info("READY"), at), { initialProps: { at: null as number | null } });
    rerender({ at: Date.now() });

    await settle(WINDOW * 3);
    const calls = getPdfStatus.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(Math.floor(WINDOW / POLL));
    expect(result.current.pdf?.status).toBe("PENDING"); // still shows updating; reopening resumes

    rerender({ at: Date.now() });
    await settle(POLL);
    expect(getPdfStatus.mock.calls.length).toBe(calls + 1);
  });

  it("never invents an interval: an answer with no hints ends the polling", async () => {
    getPdfStatus.mockResolvedValue({ status: "PENDING" });
    const { rerender } = renderHook(({ at }) => usePdfStatus(42, undefined, at), { initialProps: { at: null as number | null } });
    rerender({ at: Date.now() });
    await settle(60_000);
    expect(getPdfStatus).toHaveBeenCalledTimes(1); // asked once to learn the cadence, then stopped
  });

  it("Retry asks the server for the PDF now, shows it as updating and polls", async () => {
    getPdfStatus.mockResolvedValue(info("READY"));
    const { result } = renderHook(() => usePdfStatus(42, info("FAILED", { error: "boom" }), null));
    expect(result.current.pdf?.status).toBe("FAILED");

    await act(async () => result.current.retry());
    expect(requestPdfNow).toHaveBeenCalledWith(42);
    expect(result.current.pdf?.status).toBe("PENDING");
    expect(result.current.pdf?.error).toBeNull();

    await settle(POLL);
    expect(getPdfStatus).toHaveBeenCalledTimes(1);
    expect(result.current.pdf?.status).toBe("READY");
  });

  it("a PDF that opens STALE is queued once", async () => {
    getPdfStatus.mockResolvedValue(info("READY"));
    renderHook(() => usePdfStatus(42, info("STALE"), null));
    await settle(0);
    expect(requestPdfNow).toHaveBeenCalledTimes(1);
    expect(requestPdfNow).toHaveBeenCalledWith(42);
  });
});
