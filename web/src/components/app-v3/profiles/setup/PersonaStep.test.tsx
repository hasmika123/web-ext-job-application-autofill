import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Persona } from "@/lib/profile-setup/state";
import PersonaStep from "./PersonaStep";

vi.mock("next/image", () => ({ default: ({ src }: { src: string }) => <span data-mascot={src} /> }));

afterEach(cleanup);

function Harness({ firstName, initial = null, onContinue = vi.fn(), onLater = vi.fn(), mascot = true }: { firstName?: string; initial?: Persona | null; onContinue?: (p: Persona | null) => void; onLater?: () => void; mascot?: boolean }) {
  const [value, setValue] = useState<Persona | null>(initial);
  return <PersonaStep firstName={firstName} value={value} onChange={setValue} onContinue={() => onContinue(value)} onLater={onLater} mascot={mascot} />;
}

describe("PersonaStep", () => {
  it("a radiogroup of four chips named by the one h1; Continue stays off until a pick", () => {
    const onContinue = vi.fn();
    render(<Harness firstName="Priya" onContinue={onContinue} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Hey Priya — let's get you job-ready in 2 minutes.");
    expect(screen.getByText("First, which one's you?")).toBeTruthy();
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-labelledby")).toBe(h1.id);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Student / Internship", "First job", "Switching careers", "Experienced"]);
    const go = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Switching careers" }));
    expect(screen.getByRole("radio", { name: "Switching careers" }).getAttribute("aria-checked")).toBe("true");
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    expect(onContinue).toHaveBeenCalledWith("switching");
  });

  it("no name gives the no-name line, and the note says it only changes which questions we ask", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Let's get you job-ready in 2 minutes.");
    expect(screen.getByText("This just changes which questions we ask. Change it anytime.")).toBeTruthy();
  });

  it("the chips are 56 px tiles, two to a row on a phone and four from sm", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup");
    expect(group.className).toContain("grid-cols-2");
    expect(group.className).toContain("sm:grid-cols-4");
    for (const r of screen.getAllByRole("radio")) expect(r.className).toContain("min-h-14");
  });

  it("'I'll decide later' leaves the persona empty and moves on without a pick", () => {
    const onLater = vi.fn();
    render(<Harness onLater={onLater} />);
    fireEvent.click(screen.getByRole("button", { name: "I'll decide later" }));
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it("the arrow keys move between chips like any radiogroup", () => {
    render(<Harness initial="student" />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Student / Internship" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "First job" }).getAttribute("aria-checked")).toBe("true");
  });

  it("draws the waving mascot only when the admin has mascots on", () => {
    const on = render(<Harness />);
    expect(on.container.querySelector("[data-mascot='/v2/mascot-wave.png']")).not.toBeNull();
    on.unmount();
    const off = render(<Harness mascot={false} />);
    expect(off.container.querySelector("[data-mascot]")).toBeNull();
  });
});
