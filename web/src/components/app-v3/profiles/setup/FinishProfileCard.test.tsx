import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import { CARD_KEY, ONBOARDING_DEFAULTS } from "@/lib/onboarding-card";
import type { OnboardingStatus } from "@/lib/onboarding/api";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));
const patchOnboarding = vi.fn();
vi.mock("@/lib/onboarding/api", async (orig) => ({ ...(await orig<typeof import("@/lib/onboarding/api")>()), patchOnboarding: (...a: unknown[]) => patchOnboarding(...a) }));

import FinishProfileCard from "./FinishProfileCard";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  track.mockReset();
  patchOnboarding.mockReset();
  patchOnboarding.mockResolvedValue({});
});
afterEach(cleanup);

const status = (over: Partial<OnboardingStatus> = {}, card: Partial<OnboardingStatus["card"]> = {}): OnboardingStatus => ({
  status: "NONE",
  persona: null,
  finishedAt: null,
  draft: null,
  card: { dismissedAt: null, snoozedUntil: null, resurfaceCount: 0, show: true, state: "NOT_STARTED", resurfaced: false, ...card },
  completeness: { score: 18, promptBelow: 40, resurfaceBelow: 20 },
  ...over,
});
const inProgress = (step = "review", stepsDone = 3, stepsTotal = 7): OnboardingStatus =>
  status({ status: "DRAFT", draft: { step, stepsDone, stepsTotal, updatedAt: "2026-10-12T10:00:00Z" } }, { state: "IN_PROGRESS" });

type Props = Partial<React.ComponentProps<typeof FinishProfileCard>>;
const card = (over: Props = {}) => (
  <ToastProvider>
    <FinishProfileCard login="jo" status={status()} {...over} />
  </ToastProvider>
);
const setup = (over: Props = {}) => render(card(over));

describe("FinishProfileCard (server-evaluated)", () => {
  it("not started: links to setup", () => {
    setup({ mascotWave: <span data-testid="wave" />, mascotLaptop: <span data-testid="laptop" /> });
    expect(screen.getByRole("region", { name: "Set up your profile" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Let's get you job-ready" })).toBeTruthy();
    expect(screen.getByText(`Drop in a resume, confirm a few cards, done. About ${ONBOARDING_DEFAULTS.estimateMinutes} minutes.`)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Start/ }).getAttribute("href")).toBe("/profiles/setup?entry=card");
    expect(screen.getByTestId("wave")).toBeTruthy();
    expect(screen.queryByTestId("laptop")).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("its icon-only ⋯ control has a name and the portal tooltip (the editor's tooltip rule, DECISIONS 32)", () => {
    setup();
    expect(screen.getByRole("button", { name: "Hide this card" }).closest("[data-tooltip-trigger]")).not.toBeNull();
  });

  it("in progress: n of total from the server's draft, from any device", () => {
    setup({ status: inProgress("review", 3, 7), mascotWave: <span data-testid="wave" />, mascotLaptop: <span data-testid="laptop" /> });
    expect(screen.getByRole("heading", { name: "Finish your profile" })).toBeTruthy();
    // review 45 + skills 20 + you 15 + prefs 30 = 110 s -> about 2 min
    expect(screen.getByText("3 of 7 done · about 2 min left")).toBeTruthy();
    const meter = screen.getByRole("meter", { name: "Setup progress" });
    expect(meter.getAttribute("aria-valuenow")).toBe("3");
    expect(meter.getAttribute("aria-valuemax")).toBe("7");
    expect(screen.getByRole("link", { name: /Continue/ }).getAttribute("href")).toBe("/profiles/setup?entry=card");
    expect(screen.getByTestId("laptop")).toBeTruthy();
    expect(screen.queryByTestId("wave")).toBeNull();
  });

  it("says less than a minute when the last steps are all that is left", () => {
    setup({ status: inProgress("you", 4, 6), settings: { ...ONBOARDING_DEFAULTS, stepSeconds: { you: 15, prefs: 20 } } });
    expect(screen.getByText("4 of 6 done · < 1 min left")).toBeTruthy();
  });

  it("is hidden when the server says not to show it (finished and healthy, snoozed, dismissed...)", () => {
    setup({ status: status({}, { show: false }) });
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByText(/job-ready|Finish your profile/)).toBeNull();
  });

  it("is hidden when the status could not be loaded (it never nags on a failure)", () => {
    setup({ status: null });
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByText(/job-ready|Finish your profile/)).toBeNull();
  });

  it("a dismissed card that came back is honest about why", () => {
    setup({ status: status({ completeness: { score: 12, promptBelow: 40, resurfaceBelow: 20 } }, { resurfaced: true, dismissedAt: "2026-09-01T00:00:00Z", resurfaceCount: 1 }) });
    expect(screen.getByText("Your profile is 12% — forms will ask for the rest.")).toBeTruthy();
  });

  async function openMenu() {
    fireEvent.click(screen.getByRole("button", { name: "Hide this card" }));
    return screen.findAllByRole("menuitem");
  }

  it("snooze goes through PATCH, hides the card and toasts", async () => {
    setup();
    const items = await openMenu();
    expect(items.map((i) => i.textContent)).toEqual(["Remind me in a few days", "Don't show this again"]);
    fireEvent.click(items[0]);
    expect(screen.queryByRole("region")).toBeNull();
    expect(patchOnboarding).toHaveBeenCalledWith({ card: { action: "SNOOZE" } });
    await screen.findByText(`Okay — we'll bring it back in ${ONBOARDING_DEFAULTS.snoozeDays} days.`);
    expect(track).toHaveBeenCalledWith("onboarding_dismissed", { action: "snooze" });
    expect(localStorage.getItem(CARD_KEY)).toBeNull(); // nothing is remembered in the browser any more
  });

  it("dismiss goes through PATCH, hides the card and toasts", async () => {
    setup();
    fireEvent.click((await openMenu())[1]);
    expect(screen.queryByRole("region")).toBeNull();
    expect(patchOnboarding).toHaveBeenCalledWith({ card: { action: "DISMISS" } });
    await screen.findByText("Got it. You can set up anytime from My Profiles.");
    expect(track).toHaveBeenCalledWith("onboarding_dismissed", { action: "dismiss" });
  });

  it("when the server refuses, the card comes back with a plain error", async () => {
    patchOnboarding.mockRejectedValue(new Error("down"));
    setup();
    fireEvent.click((await openMenu())[0]);
    await screen.findByText("Couldn't do that. Try again in a moment.");
    expect(screen.getByRole("region", { name: "Set up your profile" })).toBeTruthy();
  });

  it("card_shown fires once per session, with the server's numbers", () => {
    const { rerender } = setup({ status: inProgress("review", 3, 7) });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("onboarding_card_shown", { state: "in_progress", stepsDone: 3, stepsTotal: 7, resurfaced: false });
    act(() => rerender(card({ status: inProgress("review", 3, 7) })));
    cleanup();
    setup();
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("card_shown reports the not-started state and a resurfaced card", () => {
    setup({ status: status({}, { resurfaced: true }) });
    expect(track).toHaveBeenCalledWith("onboarding_card_shown", { state: "not_started", stepsDone: 0, stepsTotal: 0, resurfaced: true });
  });
});

describe("FinishProfileCard: the R1.7 browser memory moves to the server once", () => {
  const remember = (all: Record<string, { snoozedUntil?: string; dismissedAt?: string }>) => localStorage.setItem(CARD_KEY, JSON.stringify(all));
  const inDays = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();

  it("a remembered dismiss is sent as DISMISS (the server has none), hides the card, and the local value is deleted", async () => {
    remember({ jo: { dismissedAt: "2026-10-01T00:00:00Z" } });
    setup();
    await waitFor(() => expect(patchOnboarding).toHaveBeenCalledWith({ card: { action: "DISMISS" } }));
    expect(screen.queryByRole("region")).toBeNull();
    await waitFor(() => expect(localStorage.getItem(CARD_KEY)).toBeNull());
  });

  it("a snooze that is still running is sent as SNOOZE", async () => {
    remember({ jo: { snoozedUntil: inDays(2) } });
    setup();
    await waitFor(() => expect(patchOnboarding).toHaveBeenCalledWith({ card: { action: "SNOOZE" } }));
    expect(screen.queryByRole("region")).toBeNull();
    await waitFor(() => expect(localStorage.getItem(CARD_KEY)).toBeNull());
  });

  it("a snooze that has run out is just dropped: the card shows, nothing is sent", () => {
    remember({ jo: { snoozedUntil: inDays(-1) } });
    setup();
    expect(patchOnboarding).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Set up your profile" })).toBeTruthy();
    expect(localStorage.getItem(CARD_KEY)).toBeNull();
  });

  it("the server's own marker wins: nothing is sent, the local value is deleted", () => {
    remember({ jo: { dismissedAt: "2026-10-01T00:00:00Z" } });
    setup({ status: status({}, { snoozedUntil: inDays(1), show: false }) });
    expect(patchOnboarding).not.toHaveBeenCalled();
    expect(localStorage.getItem(CARD_KEY)).toBeNull();
  });

  it("only this login's memory is touched", async () => {
    remember({ jo: { dismissedAt: "x" }, other: { dismissedAt: "y" } });
    setup({ status: status({}, { show: false }) });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CARD_KEY) ?? "{}")).toEqual({ other: { dismissedAt: "y" } }));
  });

  it("if sending it fails the card comes back and the remembered value stays for the next visit", async () => {
    patchOnboarding.mockRejectedValue(new Error("down"));
    remember({ jo: { dismissedAt: "2026-10-01T00:00:00Z" } });
    setup();
    await waitFor(() => expect(screen.getByRole("region", { name: "Set up your profile" })).toBeTruthy());
    expect(JSON.parse(localStorage.getItem(CARD_KEY) ?? "{}")).toEqual({ jo: { dismissedAt: "2026-10-01T00:00:00Z" } });
  });
});
