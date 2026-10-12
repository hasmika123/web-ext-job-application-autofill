import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelightProvider } from "@/lib/onboarding/delight";
import { DEFAULT_BUILDER_CONFIG, DEFAULT_DELIGHT_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { StepHeading } from "../parts";
import { CompanionProvider, useCompanionReact } from "./Companion";
import { CompanionCaption, CompanionDock, CompanionHead, CompanionMid } from "./CompanionDock";
import { LINE_HOLD_MS, POSE_ART, POSE_HOLD_MS } from "./poses";
import { useSceneLine } from "./useCompanionLines";

vi.mock("next/image", () => ({
  default: ({ src, className }: { src: string; className?: string }) => <span data-mascot={src} className={className} />,
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function config(over: { enabled?: boolean; mascot?: boolean } = {}): ResumeBuilderConfig {
  return {
    ...DEFAULT_BUILDER_CONFIG,
    onboarding: { ...DEFAULT_BUILDER_CONFIG.onboarding, mascot: over.mascot ?? true, delight: { ...DEFAULT_DELIGHT_CONFIG, enabled: over.enabled ?? true } },
  };
}

/** A screen that declares a pose + line and exposes a button per reaction. */
function Screen({ pose = "idle" as const, lineKey = "review.idle" }: { pose?: "idle" | "wave"; lineKey?: string }) {
  useSceneLine(pose, lineKey, { seed: 0 });
  const react = useCompanionReact();
  return (
    <>
      <button type="button" onClick={() => react("cheer", "Nice one.", "Nice.")}>
        cheer
      </button>
      <button type="button" onClick={() => react("shrug", "No worries.")}>
        shrug
      </button>
    </>
  );
}

function Harness({ cfg = config(), children }: { cfg?: ResumeBuilderConfig; children?: React.ReactNode }) {
  return (
    <DelightProvider config={cfg}>
      <CompanionProvider>
        <CompanionDock screenKey="review" />
        <Screen />
        {children}
      </CompanionProvider>
    </DelightProvider>
  );
}

const dock = () => screen.queryByTestId("companion-dock");
const click = (name: string) => act(() => screen.getByRole("button", { name }).click());

describe("CompanionDock", () => {
  it("shows the screen's pose art and idle line on the desktop column", () => {
    render(<Harness />);
    expect(dock()).not.toBeNull();
    expect(dock()?.querySelector("[data-mascot]")?.getAttribute("data-mascot")).toBe("/v2/mascot-wave.png"); // idle uses the wink art
    expect(dock()?.textContent).toBe("Swipe or tap — your call.");
  });

  it("is hidden when delight is off: no dock, no head, no caption, no reserved space", () => {
    const { container } = render(
      <Harness cfg={config({ enabled: false })}>
        <CompanionHead />
        <CompanionCaption />
      </Harness>,
    );
    expect(dock()).toBeNull();
    expect(screen.queryByTestId("companion-head")).toBeNull();
    expect(screen.queryByTestId("companion-caption")).toBeNull();
    expect(container.querySelector("[data-mascot]")).toBeNull();
  });

  it("is hidden when the mascot switch is off, even with delight on", () => {
    render(
      <Harness cfg={config({ mascot: false })}>
        <CompanionHead />
      </Harness>,
    );
    expect(dock()).toBeNull();
    expect(screen.queryByTestId("companion-head")).toBeNull();
  });

  it("is aria-hidden and pointer-events none (the dock, the head and the caption), and never focusable", () => {
    render(
      <Harness>
        <CompanionHead />
        <CompanionMid />
        <CompanionCaption />
      </Harness>,
    );
    for (const id of ["companion-dock", "companion-mid", "companion-head", "companion-caption"]) {
      const el = screen.getByTestId(id);
      expect(el.getAttribute("aria-hidden"), id).toBe("true");
      expect(el.className, id).toContain("pointer-events-none");
      expect(el.querySelector("button, a, input, [tabindex]"), id).toBeNull();
    }
    expect(screen.getByTestId("companion-dock").className).toContain("xl:flex");
    expect(screen.getByTestId("companion-dock").className).toContain("hidden");
    // the phone tier stops at md (768); the mid tier is md to xl; the column is xl and up
    expect(screen.getByTestId("companion-head").className).toContain("md:hidden");
    expect(screen.getByTestId("companion-caption").className).toContain("md:hidden");
  });

  it("is a 200 px column hung off the right of the 560 px one, aligned with the heading row", () => {
    render(<Harness />);
    const cls = dock()!.className;
    for (const c of ["absolute", "left-full", "top-[52px]", "ml-8", "w-[200px]"]) expect(cls).toContain(c);
  });

  it("react sets data-react, plays the reaction's art and line, then returns to the base pose and line", () => {
    render(<Harness />);
    expect(dock()?.getAttribute("data-react")).toBe("");
    click("cheer");
    expect(dock()?.getAttribute("data-react")).toBe("cheer");
    expect(dock()?.querySelector("[data-mascot]")?.getAttribute("data-mascot")).toBe("/v2/mascot-clap.png");
    expect(dock()?.textContent).toBe("Nice one.");
    // the picture goes back first (a beat), the line a little later
    act(() => void vi.advanceTimersByTime(POSE_HOLD_MS + 20));
    expect(dock()?.getAttribute("data-react")).toBe("");
    expect(dock()?.querySelector("[data-mascot]")?.getAttribute("data-mascot")).toBe("/v2/mascot-wave.png");
    expect(dock()?.textContent).toBe("Nice one.");
    act(() => void vi.advanceTimersByTime(LINE_HOLD_MS));
    expect(dock()?.textContent).toBe("Swipe or tap — your call.");
  });

  it("a new reaction replaces the one playing (no queue), and the timers restart", () => {
    render(<Harness />);
    click("cheer");
    act(() => void vi.advanceTimersByTime(300));
    click("shrug");
    expect(dock()?.getAttribute("data-react")).toBe("shrug");
    expect(dock()?.textContent).toBe("No worries.");
    act(() => void vi.advanceTimersByTime(POSE_HOLD_MS - 100)); // 100 ms before the SECOND reaction ends
    expect(dock()?.getAttribute("data-react")).toBe("shrug");
    act(() => void vi.advanceTimersByTime(200));
    expect(dock()?.getAttribute("data-react")).toBe("");
  });

  it("the motion class follows the pose, and a still screen rests on the breath", () => {
    render(<Harness />);
    const art = () => dock()!.querySelector("[data-mascot]") as HTMLElement;
    expect(art().className).toContain("ob-m-idle");
    click("cheer");
    expect(art().className).toContain("ob-m-cheer");
    expect(art().className).not.toContain("ob-m-idle");
  });

  it("the greeting waves on arrival; other screens peek up", () => {
    const { rerender } = render(
      <DelightProvider config={config()}>
        <CompanionProvider>
          <CompanionDock screenKey="hello" />
          <Screen pose="wave" lineKey="hello.idle" />
        </CompanionProvider>
      </DelightProvider>,
    );
    expect(dock()!.querySelector(".ob-m-wave")).not.toBeNull();
    rerender(
      <DelightProvider config={config()}>
        <CompanionProvider>
          <CompanionDock screenKey="hello" />
          <Screen pose="idle" />
        </CompanionProvider>
      </DelightProvider>,
    );
    expect(dock()!.querySelector(".ob-m-peek")).not.toBeNull();
  });

  it("clears its timers on unmount", () => {
    const { unmount } = render(<Harness />);
    click("cheer");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("every pose has art and a motion", () => {
    for (const art of Object.values(POSE_ART)) expect(art).toBeTruthy();
  });
});

describe("the phone head", () => {
  it("sits in the heading row (beside the title, before the caption), a 44 px round crop, below xl only", () => {
    render(
      <DelightProvider config={config()}>
        <CompanionProvider>
          <Screen />
          <StepHeading title="Does this look right?" sub="Pick." />
        </CompanionProvider>
      </DelightProvider>,
    );
    const head = screen.getByTestId("companion-head");
    const h1 = screen.getByRole("heading", { level: 1 });
    const row = head.parentElement!;
    expect(row.contains(h1), "the head shares the heading's row").toBe(true);
    for (const c of ["h-11", "w-11", "rounded-full", "overflow-hidden", "flex-none", "md:hidden"]) expect(head.className).toContain(c);
    const caption = screen.getByTestId("companion-caption");
    expect(caption.className).toContain("min-h-[42px]"); // a one-line bubble, its space always reserved
    expect(caption.textContent).toBe("Your call."); // the phone twin of the idle line
    // a real bubble (tinted, with a tail), not grey text
    expect(caption.querySelector("[data-speech-bubble]")?.getAttribute("data-tone")).toBe("tint");
    expect(caption.querySelector("[data-speech-tail]")).not.toBeNull();
    expect(row.parentElement!.contains(caption)).toBe(true);
    expect(row.contains(caption), "the caption is under the row, not in it").toBe(false);
  });

  it("with the layer off a heading is exactly what it was: the h1 and its line, nothing else", () => {
    const { container } = render(
      <DelightProvider config={config({ enabled: false })}>
        <CompanionProvider>
          <StepHeading title="Does this look right?" sub="Pick." />
        </CompanionProvider>
      </DelightProvider>,
    );
    expect(container.innerHTML).toBe(
      '<div><h1 tabindex="-1" class="font-display text-[24px] font-extrabold leading-tight text-balance text-v2-navy sm:text-[28px]" style="outline: none;">Does this look right?</h1><p class="mt-1.5 text-[14px] leading-snug text-v2-ink-soft">Pick.</p></div>',
    );
  });

  it("reserves its box before any screen has declared a pose, so nothing shifts when the first line arrives", () => {
    render(
      <DelightProvider config={config()}>
        <CompanionProvider>
          <StepHeading title="Hi" />
        </CompanionProvider>
      </DelightProvider>,
    );
    expect(screen.getByTestId("companion-head")).not.toBeNull();
    expect(screen.getByTestId("companion-caption").className).toContain("min-h-[42px]");
  });
});

describe("the mid tier (768-1279)", () => {
  it("is a medium mascot with its own tinted bubble at the end of the heading row, between md and xl only", () => {
    render(
      <DelightProvider config={config()}>
        <CompanionProvider>
          <Screen />
          <StepHeading title="Does this look right?" aside={<p>1 / 4</p>} />
        </CompanionProvider>
      </DelightProvider>,
    );
    const mid = screen.getByTestId("companion-mid");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(mid.parentElement!.contains(h1), "in the heading row").toBe(true);
    for (const c of ["hidden", "md:flex", "xl:hidden", "pointer-events-none", "flex-none"]) expect(mid.className).toContain(c);
    expect(mid.style.height).toBe("104px");
    expect(mid.getAttribute("aria-hidden")).toBe("true");
    expect(mid.querySelector("[data-speech-bubble]")?.getAttribute("data-tone")).toBe("tint");
    expect(mid.textContent).toBe("Swipe or tap — your call."); // the bubble says it; the grey subtitle does not (the caption is phone-only)
    expect(screen.getByTestId("companion-caption").className).toContain("md:hidden");
    expect(mid.querySelector("[data-mascot]")).not.toBeNull();
  });

  it("reacts too: its pose and line follow the same companion", () => {
    render(
      <DelightProvider config={config()}>
        <CompanionProvider>
          <Screen />
          <StepHeading title="Hi" />
        </CompanionProvider>
      </DelightProvider>,
    );
    click("cheer");
    const mid = screen.getByTestId("companion-mid");
    expect(mid.getAttribute("data-react")).toBe("cheer");
    expect(mid.textContent).toBe("Nice one.");
    expect(mid.querySelector("[data-mascot]")?.getAttribute("data-mascot")).toBe("/v2/mascot-clap.png");
  });

  it("is not drawn when the layer is off", () => {
    render(
      <DelightProvider config={config({ enabled: false })}>
        <CompanionProvider>
          <StepHeading title="Hi" />
        </CompanionProvider>
      </DelightProvider>,
    );
    expect(screen.queryByTestId("companion-mid")).toBeNull();
  });
});
