import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { OnboardingStatus } from "@/lib/onboarding/api";

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

import SetupPreferences from "./SetupPreferences";

const status = (over: Partial<OnboardingStatus["card"]> = {}): OnboardingStatus => ({
  status: "FINISHED",
  persona: "student",
  finishedAt: "2026-10-12T10:00:00Z",
  draft: null,
  card: { dismissedAt: null, snoozedUntil: null, resurfaceCount: 0, show: true, state: "NOT_STARTED", resurfaced: false, ...over },
  completeness: { score: 10, promptBelow: 40, resurfaceBelow: 20 },
});

const calls: { method: string; body: unknown }[] = [];
let reply: (body: Record<string, unknown>) => Response = () => new Response(JSON.stringify(status()), { status: 200 });

beforeEach(() => {
  calls.length = 0;
  track.mockReset();
  reply = () => new Response(JSON.stringify(status()), { status: 200 });
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    calls.push({ method: init?.method ?? "GET", body });
    return reply(body);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderIt = (persona: "student" | null = "student") =>
  render(
    <ToastProvider>
      <SetupPreferences persona={persona} />
    </ToastProvider>,
  );

describe("SetupPreferences (the Preferences tab's setup row)", () => {
  it("says who you are with a Change button, and offers the four personas on Change", () => {
    renderIt("student");
    expect(screen.getByTestId("persona-line").textContent).toBe("I'm a Student / Internship");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    const group = screen.getByRole("radiogroup", { name: "Who you are" });
    expect(Array.from(group.querySelectorAll('[role="radio"]')).map((r) => r.textContent)).toEqual(["Student / Internship", "First job", "Switching careers", "Experienced"]);
    expect(screen.getByRole("radio", { name: "Student / Internship" }).getAttribute("aria-checked")).toBe("true");
  });

  it("picking one saves it at once (no Save button), shows the quiet tick, and tells the funnel the persona and that it changed", async () => {
    renderIt("student");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("radio", { name: "Switching careers" }));
    await waitFor(() => expect(screen.getByTestId("persona-line").textContent).toBe("I'm a Switching careers"));
    expect(calls).toEqual([{ method: "PATCH", body: { persona: "switching" } }]);
    await screen.findByRole("img", { name: "Saved" });
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
    expect(track).toHaveBeenCalledWith("onboarding_persona_set", { persona: "switching", changed: true });
  });

  it("with no persona yet it says so and offers Set it; a first pick is not a change", async () => {
    renderIt(null);
    expect(screen.getByTestId("persona-line").textContent).toBe("You haven't said who you are yet");
    fireEvent.click(screen.getByRole("button", { name: "Set it" }));
    fireEvent.click(screen.getByRole("radio", { name: "First job" }));
    await waitFor(() => expect(track).toHaveBeenCalledWith("onboarding_persona_set", { persona: "first_job", changed: false }));
  });

  it("a refused save puts the old persona back and says so", async () => {
    reply = () => new Response(JSON.stringify({ code: "PERSONA_INVALID" }), { status: 422 });
    renderIt("student");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("radio", { name: "Experienced" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't save that. Try again.");
    expect(screen.getByTestId("persona-line").textContent).toBe("I'm a Student / Internship");
    expect(track).not.toHaveBeenCalled();
  });

  it("'Show the setup card again' resets the card on the server and says it is back", async () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Show the setup card again" }));
    await screen.findByText("The setup card is back on your dashboard.");
    expect(calls).toEqual([{ method: "PATCH", body: { card: { action: "RESET" } } }]);
  });

  it("when the profile is already fine the card stays away, and the line is honest about it", async () => {
    reply = () => new Response(JSON.stringify(status({ show: false })), { status: 200 });
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Show the setup card again" }));
    await screen.findByText(/It'll show on your dashboard whenever your profile needs it/);
  });
});
