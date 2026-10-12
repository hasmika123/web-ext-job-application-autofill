import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConflictBanner from "./ConflictBanner";
import ResumeBanner from "./ResumeBanner";
import SaveStatusPill, { ANNOUNCE_EVERY_MS, CONFLICT_LABEL, DEMO_LABEL, OFFLINE_LABEL, REFUSED_LABEL, SERVER_LABEL, SAVING_DELAY_MS, pillLabel } from "./SaveStatusPill";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** What the eyes see (the aria-hidden text) and what the live region says. */
const seen = () => screen.getByTestId("save-status").querySelector("[data-save-tone]")?.textContent ?? null;
const heard = () => screen.getByRole("status").textContent;
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("pillLabel", () => {
  it("has the design's words and tones", () => {
    expect(pillLabel("idle", "network")).toBeNull();
    expect(pillLabel("saving", "network")).toEqual({ text: "Saving…", tone: "calm" });
    expect(pillLabel("saved", "network")).toEqual({ text: "Saved", tone: "calm" });
    expect(pillLabel("offline", "network")).toEqual({ text: "Offline — saved on this device", tone: "warn" });
    expect(pillLabel("offline", "server")).toEqual({ text: "Couldn't save — kept on this device", tone: "warn" });
    expect(pillLabel("offline", "demo")?.text).toBe("Demo accounts can't save — sign up to keep this.");
    expect(pillLabel("offline", "refused")?.text).toBe(REFUSED_LABEL);
    expect(pillLabel("conflict", "network")).toEqual({ text: CONFLICT_LABEL, tone: "error" });
  });
});

describe("SaveStatusPill", () => {
  it("shows nothing until something has been saved", () => {
    render(<SaveStatusPill status="idle" reason="network" />);
    expect(seen()).toBeNull();
    expect(heard()).toBe("");
  });

  it("'Saving…' only appears after 300 ms; a fast save never flickers in", () => {
    const { rerender } = render(<SaveStatusPill status="saved" reason="network" />);
    expect(seen()).toBe("Saved");
    rerender(<SaveStatusPill status="saving" reason="network" />);
    expect(seen()).toBe("Saved"); // still the old word
    tick(SAVING_DELAY_MS - 50);
    expect(seen()).toBe("Saved");
    rerender(<SaveStatusPill status="saved" reason="network" />);
    tick(SAVING_DELAY_MS);
    expect(seen()).toBe("Saved"); // it finished in time: "Saving…" never showed

    rerender(<SaveStatusPill status="saving" reason="network" />);
    tick(SAVING_DELAY_MS + 1);
    expect(seen()).toBe("Saving…");
    rerender(<SaveStatusPill status="saved" reason="network" />);
    expect(seen()).toBe("Saved");
  });

  it("the first save of a visit shows nothing, then 'Saving…' if slow, then 'Saved'", () => {
    const { rerender } = render(<SaveStatusPill status="idle" reason="network" />);
    rerender(<SaveStatusPill status="saving" reason="network" />);
    expect(seen()).toBeNull();
    tick(SAVING_DELAY_MS + 1);
    expect(seen()).toBe("Saving…");
  });

  it("offline is amber with the words, announced at once, and offers Retry for a network failure only", () => {
    const retry = vi.fn();
    const { rerender } = render(<SaveStatusPill status="offline" reason="network" onRetry={retry} />);
    expect(seen()).toBe(OFFLINE_LABEL);
    expect(heard()).toBe(OFFLINE_LABEL);
    expect(screen.getByTestId("save-status").querySelector("[data-save-tone='warn']")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);

    rerender(<SaveStatusPill status="offline" reason="demo" onRetry={retry} />);
    expect(seen()).toBe(DEMO_LABEL);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("a server error says \"Couldn't save\" (not Offline) and also offers Retry", () => {
    const retry = vi.fn();
    render(<SaveStatusPill status="offline" reason="server" onRetry={retry} />);
    expect(seen()).toBe(SERVER_LABEL);
    expect(seen()).not.toContain("Offline");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("never wraps per word: the pill and Retry are nowrap and never shrink", () => {
    render(<SaveStatusPill status="offline" reason="network" onRetry={vi.fn()} />);
    const pill = screen.getByTestId("save-status").querySelector("[data-save-tone]") as HTMLElement;
    expect(pill.className).toMatch(/\bshrink-0\b/);
    expect(pill.className).toMatch(/\bwhitespace-nowrap\b/);
    expect(screen.getByRole("button", { name: "Retry" }).className).toMatch(/\bwhitespace-nowrap\b/);
  });

  it("a conflict reads as not saved, in the error tone", () => {
    render(<SaveStatusPill status="conflict" reason="network" />);
    expect(seen()).toBe(CONFLICT_LABEL);
    expect(screen.getByTestId("save-status").querySelector("[data-save-tone='error']")).not.toBeNull();
  });

  it("announces 'Saved' to a screen reader at most once per 10 s, but a problem at once", () => {
    const { rerender } = render(<SaveStatusPill status="idle" reason="network" />);
    rerender(<SaveStatusPill status="saved" reason="network" />);
    expect(heard()).toBe("Saved");
    // a burst of saves inside the window says nothing new
    for (let i = 0; i < 4; i++) {
      rerender(<SaveStatusPill status="saving" reason="network" />);
      tick(1000);
      rerender(<SaveStatusPill status="saved" reason="network" />);
      tick(1000);
    }
    expect(heard()).toBe("Saved");
    // an offline moment is announced the moment it starts, inside the window
    rerender(<SaveStatusPill status="offline" reason="network" />);
    expect(heard()).toBe(OFFLINE_LABEL);
    // and "Saved" again once the throttle has run out
    rerender(<SaveStatusPill status="saved" reason="network" />);
    tick(ANNOUNCE_EVERY_MS);
    expect(heard()).toBe("Saved");
  });

  it("'Saving…' is never read out", () => {
    const { rerender } = render(<SaveStatusPill status="saved" reason="network" />);
    rerender(<SaveStatusPill status="saving" reason="network" />);
    tick(SAVING_DELAY_MS + 1);
    expect(seen()).toBe("Saving…");
    expect(heard()).toBe("Saved");
  });
});

describe("ResumeBanner", () => {
  it("same device: where you left off, with the count, and a way to start over", () => {
    const onStartOver = vi.fn();
    render(<ResumeBanner resumed={{ device: "same", stepsDone: 3, stepsTotal: 7 }} onStartOver={onStartOver} />);
    expect(screen.getByTestId("resume-banner").textContent).toContain("Picked up where you left off — 3 of 7 done.");
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it("another device says so", () => {
    render(<ResumeBanner resumed={{ device: "other", stepsDone: 3, stepsTotal: 7 }} onStartOver={vi.fn()} />);
    expect(screen.getByTestId("resume-banner").textContent).toContain("Picked up from your other device.");
  });
});

describe("ConflictBanner", () => {
  it("asks the question and offers both ways out", () => {
    const useThat = vi.fn();
    const keepMine = vi.fn();
    render(<ConflictBanner onUseThat={useThat} onKeepMine={keepMine} />);
    expect(screen.getByRole("alert").textContent).toContain("This was updated on another device. Use that version?");
    fireEvent.click(screen.getByRole("button", { name: "Use that" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    expect(useThat).toHaveBeenCalledTimes(1);
    expect(keepMine).toHaveBeenCalledTimes(1);
  });

  it("is disabled while a choice is being applied", () => {
    render(<ConflictBanner onUseThat={vi.fn()} onKeepMine={vi.fn()} busy />);
    expect((screen.getByRole("button", { name: "Use that" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Keep mine" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
