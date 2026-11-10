import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlanPreviewPane from "./PlanPreviewPane";
import { PREVIEW } from "./previewFixture";
import type { PlanPreviewState } from "./usePlanPreview";

const NAMES = { "ai.credits_extra": "Extra AI credits", "resume.pack": "Extra resumes (+10)" };

function pane(over: Partial<PlanPreviewState> = {}, props: Partial<React.ComponentProps<typeof PlanPreviewPane>> = {}) {
  const state: PlanPreviewState = { preview: PREVIEW, loading: false, error: null, reload: vi.fn(), ...over };
  const onQuery = vi.fn();
  const utils = render(
    <PlanPreviewPane state={state} query={{ interval: "MONTH", currency: "USD" }} onQuery={onQuery} intervals={["MONTH", "QUARTER"]} currencies={["USD"]} version={3} liveVersion={2} names={NAMES} {...props} />,
  );
  return { ...utils, state, onQuery };
}

afterEach(cleanup);

describe("PlanPreviewPane", () => {
  it("renders the server totals formatted from minor units", () => {
    pane();
    expect(screen.getByText("$19.99")).toBeTruthy();
    expect(screen.getByText("$35.94")).toBeTruthy();
    expect(screen.getByText("Extra AI credits")).toBeTruthy();
  });

  it("shows the failing composition check with its lever text and the failing count", () => {
    pane();
    const margin = document.querySelector('[data-check="margin"]') as HTMLElement;
    expect(margin.getAttribute("data-ok")).toBe("false");
    expect(within(margin).getByText(/raise the price to at least/)).toBeTruthy();
    expect(within(margin).getAllByText("$5.49").length).toBeGreaterThan(0);
    expect(screen.getByText("1 failing check")).toBeTruthy();
  });

  it("lists impact: who stays on which version and the Stripe objects with their keys", () => {
    pane();
    expect(screen.getByText(/on v2 keep v2/)).toBeTruthy();
    expect(screen.getByText(/New sign-ups get v3 from Oct 20, 2026/)).toBeTruthy();
    expect(screen.getByText(/FEAT_AI_CREDITS · quarter · USD · price-77/)).toBeTruthy();
  });

  it("asks for another interval without a reload", () => {
    const { onQuery } = pane();
    fireEvent.click(screen.getByRole("button", { name: /Preview interval/ }));
    fireEvent.click(screen.getByRole("option", { name: "Quarterly" }));
    expect(onQuery).toHaveBeenCalledWith({ interval: "QUARTER" });
  });

  it("re-asks the server on Run all checks", () => {
    const { state } = pane();
    fireEvent.click(screen.getByRole("button", { name: "Run all checks" }));
    expect(state.reload).toHaveBeenCalled();
  });

  it("says all checks pass when they do", () => {
    pane({ preview: { ...PREVIEW, worstCase: { ...PREVIEW.worstCase!, ok: true, marginBp: 8100, levers: null }, checks: PREVIEW.checks.map((c) => ({ ...c, ok: true, failing: null })) } });
    expect(screen.getByText("All checks pass")).toBeTruthy();
  });

  it("keeps the old numbers (dimmed) while a new answer loads, and shows a skeleton only before the first", () => {
    const { container } = pane({ loading: true });
    expect((container.firstChild as HTMLElement).getAttribute("aria-busy")).toBe("true");
    cleanup();
    pane({ preview: null, loading: true });
    expect(screen.getByRole("status", { name: "Loading the preview" })).toBeTruthy();
  });

  it("shows a retry when the first read fails", () => {
    const { state } = pane({ preview: null, error: "Couldn't reach the server." });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(state.reload).toHaveBeenCalled();
  });

  it("an organization plan shows the roster total and setup fee from the DTO, and a preset below individual with the required sum", () => {
    pane({
      preview: {
        ...PREVIEW,
        audience: "ORG",
        seats: {
          seatBaseMinor: 1499,
          presets: [
            { key: "RESUME_AI_SUPPORT", seatTotalMinor: 2896, aboveIndividualOk: true, mirrored: true, individualMonthMinor: 2500, features: [] },
            { key: "CHEAP", seatTotalMinor: 1600, aboveIndividualOk: false, mirrored: false, individualMonthMinor: 1999, features: [] },
          ],
          roster: { lines: [{ token: "BASE", count: 5, seatTotalMinor: 1499, lineTotalMinor: 7495, features: [] }], orgRecurringMinor: 7992, setupFeeMinor: 49900 },
        },
      },
    });
    expect(screen.getByText("$79.92")).toBeTruthy();
    expect(screen.getByText("$499.00")).toBeTruthy();
    const bad = document.querySelector('[data-preset="CHEAP"]') as HTMLElement;
    expect(bad.getAttribute("data-ok")).toBe("false");
    expect(within(bad).getByText("$19.99")).toBeTruthy();
  });
});
