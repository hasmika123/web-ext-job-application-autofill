import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import { ALL_PREFERENCE_KEYS } from "@/components/onboarding/preferences";
import { CARD_KEY, ONBOARDING_DEFAULTS } from "@/lib/onboarding-card";
import { DRAFT_KEY, INITIAL_STATE } from "@/lib/profile-setup/state";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

import FinishProfileCard from "./FinishProfileCard";

// `config.profile.setupPromptBelowPercent` (admin setting profile.setup.promptBelowPercent).
const PROMPT_BELOW = DEFAULT_BUILDER_CONFIG.profile.setupPromptBelowPercent;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  track.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ANSWERED = Object.fromEntries(ALL_PREFERENCE_KEYS.map((k) => [k, "Yes"]));
type Props = Partial<React.ComponentProps<typeof FinishProfileCard>>;
const card = (over: Props = {}) => (
  <ToastProvider>
    <FinishProfileCard login="jo" onboarded={false} score={0} promptBelow={PROMPT_BELOW} bio={ANSWERED} {...over} />
  </ToastProvider>
);
const setup = (over: Props = {}) => render(card(over));

/** A v1 setup draft in the cards step: path, input done; cards, skills, identity, done to go (6 steps without questions' prefs). */
function putDraft(step: "cards" | "skills" = "cards") {
  sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      ...INITIAL_STATE,
      step,
      path: "paste",
      parsed: {
        candidates: [{ id: "exp0", section: "EXPERIENCE", data: { title: "Engineer", org: "Acme" } }],
        parsedIdentity: {},
        skills: [],
        suggestions: [],
        source: "ai",
        removed: 0,
      },
    }),
  );
}

describe("FinishProfileCard", () => {
  it("not started state links to setup", () => {
    setup({ mascotWave: <span data-testid="wave" />, mascotLaptop: <span data-testid="laptop" /> });
    expect(screen.getByRole("region", { name: "Set up your profile" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Let's get you job-ready" })).toBeTruthy();
    expect(screen.getByText(`Drop in a resume, confirm a few cards, done. About ${ONBOARDING_DEFAULTS.estimateMinutes} minutes.`)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Start/ }).getAttribute("href")).toBe("/profiles/setup");
    expect(screen.getByTestId("wave")).toBeTruthy();
    expect(screen.queryByTestId("laptop")).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("its icon-only ⋯ control has a name and the portal tooltip (the editor's tooltip rule, DECISIONS 32)", () => {
    setup();
    const more = screen.getByRole("button", { name: "Hide this card" });
    expect(more.closest("[data-tooltip-trigger]")).not.toBeNull();
  });

  it("in-progress state shows n of total from the local draft", () => {
    putDraft("cards");
    setup({ mascotWave: <span data-testid="wave" />, mascotLaptop: <span data-testid="laptop" /> });
    expect(screen.getByRole("heading", { name: "Finish your profile" })).toBeTruthy();
    // path + input done of path, input, cards, skills, identity, done; review 45 + skills 20 + you 15 = 80 s -> 2 min
    expect(screen.getByText("2 of 6 done · about 2 min left")).toBeTruthy();
    const meter = screen.getByRole("meter", { name: "Setup progress" });
    expect(meter.getAttribute("aria-valuenow")).toBe("2");
    expect(meter.getAttribute("aria-valuemax")).toBe("6");
    expect(screen.getByRole("link", { name: /Continue/ }).getAttribute("href")).toBe("/profiles/setup");
    expect(screen.getByTestId("laptop")).toBeTruthy();
  });

  it("says less than a minute when the last steps are all that is left", () => {
    putDraft("skills");
    setup({ settings: { ...ONBOARDING_DEFAULTS, stepSeconds: { skills: 20, you: 15 } } });
    expect(screen.getByText("3 of 6 done · < 1 min left")).toBeTruthy();
  });

  it("hidden when onboarded and score at or above threshold", () => {
    const { container } = setup({ onboarded: true, score: PROMPT_BELOW });
    expect(container.innerHTML).not.toContain("job-ready");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("comes back as an invitation when onboarded but the profile is thin", () => {
    setup({ onboarded: true, score: PROMPT_BELOW - 1 });
    expect(screen.getByRole("heading", { name: "Let's get you job-ready" })).toBeTruthy();
  });

  it("is hidden when the score is unknown", () => {
    setup({ score: null });
    expect(screen.queryByRole("region")).toBeNull();
  });

  async function openMenu() {
    fireEvent.click(screen.getByRole("button", { name: "Hide this card" }));
    return screen.findAllByRole("menuitem");
  }

  it("snooze hides for snoozeDays and toasts", async () => {
    setup();
    const items = await openMenu();
    expect(items.map((i) => i.textContent)).toEqual(["Remind me in a few days", "Don't show this again"]);
    const before = Date.now();
    fireEvent.click(items[0]);
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getByText(`Okay — we'll bring it back in ${ONBOARDING_DEFAULTS.snoozeDays} days.`)).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem(CARD_KEY) ?? "{}") as Record<string, { snoozedUntil: string }>;
    const until = Date.parse(stored.jo.snoozedUntil);
    const dayMs = 24 * 60 * 60 * 1000;
    expect(until).toBeGreaterThanOrEqual(before + ONBOARDING_DEFAULTS.snoozeDays * dayMs);
    expect(until).toBeLessThan(before + ONBOARDING_DEFAULTS.snoozeDays * dayMs + 60_000);
    expect(track).toHaveBeenCalledWith("onboarding_dismissed", { action: "snooze" });

    // still snoozed on the next visit, back after the snooze runs out
    cleanup();
    setup();
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(until + 1000);
    setup();
    expect(screen.getByRole("region", { name: "Set up your profile" })).toBeTruthy();
  });

  it("snooze is remembered per login", async () => {
    setup();
    fireEvent.click((await openMenu())[0]);
    cleanup();
    setup({ login: "someone-else" });
    expect(screen.getByRole("region", { name: "Set up your profile" })).toBeTruthy();
  });

  it("dismiss hides and toasts", async () => {
    setup();
    fireEvent.click((await openMenu())[1]);
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getByText("Got it. You can set up anytime from My Profiles.")).toBeTruthy();
    expect(track).toHaveBeenCalledWith("onboarding_dismissed", { action: "dismiss" });
    cleanup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 365 * 24 * 60 * 60 * 1000);
    setup();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("card_shown fires once", () => {
    putDraft("cards");
    const { rerender } = setup();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("onboarding_card_shown", { state: "in_progress", stepsDone: 2, stepsTotal: 6, resurfaced: false });
    act(() => rerender(card()));
    cleanup();
    setup();
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("card_shown reports the not-started state", () => {
    setup();
    expect(track).toHaveBeenCalledWith("onboarding_card_shown", { state: "not_started", stepsDone: 0, stepsTotal: 0, resurfaced: false });
  });
});
