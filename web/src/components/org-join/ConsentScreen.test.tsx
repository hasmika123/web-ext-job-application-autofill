import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Consent } from "@/lib/org-join";
import ConsentScreen from "./ConsentScreen";

afterEach(cleanup);

/** The matrix exactly as the API sends it (ShareField order, docLabel, minScope). */
const MATRIX: Consent["matrix"] = [
  { field: "SEAT", label: "Seat", minScope: "NONE" },
  { field: "ACTIVATED", label: "Activated", minScope: "NONE" },
  { field: "STAGE_COUNTS", label: "Counts per stage", minScope: "SUMMARY" },
  { field: "LAST_ACTIVITY", label: "Last activity date", minScope: "SUMMARY" },
  { field: "RESUME_READINESS", label: "Resume readiness", minScope: "SUMMARY" },
  { field: "UPCOMING_INTERVIEW_COUNT", label: "Interview count upcoming", minScope: "SUMMARY" },
  { field: "PLACEMENT", label: "Placement", minScope: "SUMMARY" },
  { field: "EMPLOYER_DETAILS", label: "Employer names", minScope: "FULL" },
  { field: "APPLICATION_DETAIL", label: "Application detail", minScope: "FULL" },
  { field: "RESUMES", label: "Resumes", minScope: "FULL" },
  { field: "INTERVIEW_CALENDAR", label: "Interview calendar entries", minScope: "FULL" },
  { field: "JOB_ASSIGNMENTS", label: "Job assignments", minScope: "FULL" },
  { field: "PRIVATE_DATA", label: "Answers cache", minScope: null },
];

function consent(over: Partial<Consent> = {}): Consent {
  return {
    version: "org-share/v1",
    defaultScope: "SUMMARY",
    options: ["SUMMARY", "NONE"],
    matrix: MATRIX,
    text: "# What your organization can see\n\nYou choose.\n\n## Only that I joined\n\nSeat only.\n\n- one\n- two",
    ...over,
  };
}

function preview(over: Partial<React.ComponentProps<typeof ConsentScreen>["preview"]> = {}) {
  return { orgName: "Acme Bootcamp", inviterName: "Priya Nair", groupName: "Cohort 26-B", role: "MEMBER" as const, pays: [], consent: consent(), ...over };
}

const checked = (el: HTMLElement) => el.getAttribute("aria-checked");

describe("ConsentScreen", () => {
  it("offers exactly two choices, the recommended summary first and already picked", () => {
    render(<ConsentScreen preview={preview()} onJoin={vi.fn()} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0].textContent).toContain("Progress summary");
    expect(radios[1].textContent).toContain("Only that I joined");
    expect(checked(radios[0])).toBe("true");
    expect(checked(radios[1])).toBe("false");
    expect(within(radios[0]).getByText("Recommended")).toBeTruthy();
    expect(radios.some((r) => /everything/i.test(r.textContent ?? ""))).toBe(false);
  });

  it("every target is at least 44 px tall", () => {
    render(<ConsentScreen preview={preview()} onJoin={vi.fn()} />);
    for (const r of screen.getAllByRole("radio")) expect(r.className).toContain("min-h-[64px]");
    expect(screen.getByRole("button", { name: "What exactly?" }).className).toContain("min-h-[44px]");
    expect(screen.getByRole("button", { name: "Join Acme Bootcamp" }).className).toContain("h-[52px]");
  });

  it("says who invited you, to what, what you keep and that you can change it later", () => {
    render(<ConsentScreen preview={preview({ pays: ["Pro"] })} onJoin={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Join Acme Bootcamp" })).toBeTruthy();
    expect(screen.getByText("by Priya Nair · Cohort 26-B")).toBeTruthy();
    expect(screen.getByText(/You'll be a member\. You keep your own account, resumes and applications\./)).toBeTruthy();
    expect(screen.getByText("Acme Bootcamp pays for: Pro.")).toBeTruthy();
    expect(screen.getByText("You can change this any time in Settings.")).toBeTruthy();
  });

  it("joins with the summary by default and with the other choice when it is picked", () => {
    const onJoin = vi.fn();
    render(<ConsentScreen preview={preview()} onJoin={onJoin} />);
    fireEvent.click(screen.getByRole("button", { name: "Join Acme Bootcamp" }));
    expect(onJoin).toHaveBeenLastCalledWith("SUMMARY", "org-share/v1");

    fireEvent.click(screen.getByRole("radio", { name: /Only that I joined/ }));
    expect(checked(screen.getByRole("radio", { name: /Only that I joined/ }))).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Join Acme Bootcamp" }));
    expect(onJoin).toHaveBeenLastCalledWith("NONE", "org-share/v1");
  });

  it("starts on the seat-only choice when the org proposes it, and never starts on FULL", () => {
    const { rerender } = render(<ConsentScreen preview={preview({ consent: consent({ defaultScope: "NONE" }) })} onJoin={vi.fn()} />);
    expect(checked(screen.getByRole("radio", { name: /Only that I joined/ }))).toBe("true");
    rerender(<ConsentScreen preview={preview({ consent: consent({ defaultScope: "FULL" }) })} onJoin={vi.fn()} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("arrow keys move the choice like any radio group", () => {
    render(<ConsentScreen preview={preview()} onJoin={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: /Progress summary/ }), { key: "ArrowDown" });
    expect(checked(screen.getByRole("radio", { name: /Only that I joined/ }))).toBe("true");
  });

  it("while joining the button says so and the choices are locked", () => {
    render(<ConsentScreen preview={preview()} busy onJoin={vi.fn()} />);
    expect((screen.getByRole("button", { name: /Joining/ }) as HTMLButtonElement).disabled).toBe(true);
    for (const r of screen.getAllByRole("radio")) expect((r as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a failure in the danger text colour as an alert", () => {
    render(<ConsentScreen preview={preview()} error="This invite has expired." onJoin={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("This invite has expired.");
    expect(alert.className).toContain("text-danger-text");
  });

  it("What exactly? spells out the matrix from the API's own rows", () => {
    render(<ConsentScreen preview={preview()} onJoin={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "What exactly?" }));
    const dialog = screen.getByRole("dialog", { name: "What exactly can they see?" });
    const table = within(dialog).getByRole("table");
    const row = (name: RegExp) => within(table).getByRole("row", { name });

    // the seat is visible in both columns; counts only with the summary; employer names in neither column of this table
    expect(within(row(/you're a member/i)).getAllByText("Yes")).toHaveLength(2);
    const counts = row(/How many applications you have in each stage/);
    expect(within(counts).getAllByText("No")).toHaveLength(1);
    expect(within(counts).getAllByText("Yes")).toHaveLength(1);
    expect(within(table).queryByText(/Company names/)).toBeNull();
    expect(within(dialog).getByText("Neither choice ever shows")).toBeTruthy();
    expect(within(dialog).getByText(/Sharing everything is a separate choice for one named person/)).toBeTruthy();
  });

  it("the full consent text is behind a disclosure", () => {
    render(<ConsentScreen preview={preview()} onJoin={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "What exactly?" }));
    const dialog = screen.getByRole("dialog");
    const toggle = within(dialog).getByRole("button", { name: /Read the full text/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(dialog).getByRole("heading", { name: "What your organization can see" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Only that I joined" })).toBeTruthy();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
  });
});
