import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PREFERENCE_QUESTIONS, type PreferenceQuestion } from "@/components/onboarding/preferences";
import type { Persona } from "@/lib/profile-setup/state";
import PrefsFlow, { hasAnswer, prefId, valuesToWrite } from "./PrefsFlow";

vi.mock("next/image", () => ({ default: ({ src }: { src: string }) => <span data-mascot={src} /> }));

afterEach(cleanup);

const q = (id: string): PreferenceQuestion => PREFERENCE_QUESTIONS.find((x) => x.keys[0] === id)!;

interface HarnessProps {
  id: string;
  persona?: Persona | null;
  first?: boolean;
  last?: boolean;
  hiddenLeft?: number;
  error?: string | null;
  saving?: boolean;
  retryWrapUp?: boolean;
  initial?: Record<string, string>;
  onContinue?: (answers: Record<string, string>) => void;
  onSkip?: () => void;
  onShowAll?: () => void;
}
function Harness({ id, persona = null, first = false, last = false, hiddenLeft = 0, error = null, saving = false, retryWrapUp = false, initial = {}, onContinue = vi.fn(), onSkip = vi.fn(), onShowAll = vi.fn() }: HarnessProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  return (
    <PrefsFlow
      question={q(id)}
      persona={persona}
      answers={answers}
      first={first}
      last={last}
      hiddenLeft={hiddenLeft}
      saving={saving}
      error={error}
      retryWrapUp={retryWrapUp}
      onChange={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))}
      onContinue={() => onContinue(answers)}
      onSkip={onSkip}
      onShowAll={onShowAll}
    />
  );
}
const cont = () => screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;

describe("PrefsFlow: one question per screen", () => {
  it("the question is the one h1 with its why line; the chips are the answer; Continue waits for a tap", () => {
    const onContinue = vi.fn();
    render(<Harness id="authorizedToWork" onContinue={onContinue} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Are you legally authorized to work in the country you're applying in?");
    expect(screen.getByText("Nearly every application asks. Answer once and Kiwiply fills it everywhere.")).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Yes", "No"]);
    for (const r of screen.getAllByRole("radio")) expect(r.getAttribute("aria-checked")).toBe("false"); // nothing pre-selected
    expect(cont().disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(cont().disabled).toBe(false);
    fireEvent.click(cont());
    expect(onContinue).toHaveBeenCalledWith({ authorizedToWork: "No" });
  });

  it("'Skip this one' is always there, even with nothing answered", () => {
    const onSkip = vi.fn();
    render(<Harness id="requireSponsorship" onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip this one" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("the first screen carries the persona's tip; later ones do not", () => {
    const { rerender } = render(<Harness id="authorizedToWork" persona="student" first />);
    expect(screen.getByText("Internship forms ask this on page one.")).toBeTruthy();
    rerender(<Harness id="authorizedToWork" persona="student" />);
    expect(screen.queryByText("Internship forms ask this on page one.")).toBeNull();
  });

  it("the buttons and chips are made for thumbs: 56 px chips, a full-width Continue", () => {
    render(<Harness id="authorizedToWork" />);
    for (const r of screen.getAllByRole("radio")) expect(r.className).toContain("min-h-14");
    expect(cont().className).toContain("w-full");
  });

  it("saving disables both buttons and says so; an error is an alert", () => {
    const { rerender } = render(<Harness id="authorizedToWork" initial={{ authorizedToWork: "Yes" }} saving />);
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Skip this one" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Harness id="authorizedToWork" initial={{ authorizedToWork: "Yes" }} error="Couldn't save that answer. Try again." />);
    expect(screen.getByRole("alert").textContent).toBe("Couldn't save that answer. Try again.");
  });

  it("when only the wrap-up failed, the primary button reads 'Try again' and is on without an answer", () => {
    render(<Harness id="gender" retryWrapUp />);
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("PrefsFlow: persona rewrites (DESIGN 5.9)", () => {
  it("student: 'When could you start?' with Right away / After I graduate chips", () => {
    render(<Harness id="noticePeriod" persona="student" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("When could you start?");
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Right away", "After I graduate"]);
    expect(screen.queryByText("Which month?")).toBeNull();
  });

  it("'Right away' is stored as the Immediately notice option", () => {
    const onContinue = vi.fn();
    render(<Harness id="noticePeriod" persona="first_job" onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("radio", { name: "Right away" }));
    fireEvent.click(cont());
    expect(onContinue).toHaveBeenCalledWith({ noticePeriod: "Immediately", earliestStartDate: "" });
  });

  it("'After I graduate' asks for a month; Continue waits for a complete one, then stores the nearest notice option and the month", () => {
    const onContinue = vi.fn();
    render(<Harness id="noticePeriod" persona="student" onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("radio", { name: "After I graduate" }));
    expect(screen.getByText("Which month?")).toBeTruthy();
    expect(cont().disabled).toBe(true);
    const picker = screen.getByRole("group", { name: "The month you could start" });
    fireEvent.change(within(picker).getByLabelText("Year"), { target: { value: "2099" } });
    fireEvent.click(within(picker).getByRole("button", { name: /Month/ }));
    fireEvent.click(screen.getByRole("option", { name: "May" }));
    expect(cont().disabled).toBe(false);
    fireEvent.click(cont());
    expect(onContinue).toHaveBeenCalledWith({ earliestStartDate: "2099-05", noticePeriod: "3 months" });
  });

  it("switching and experienced keep the /welcome start question and its notice chips", () => {
    render(<Harness id="noticePeriod" persona="experienced" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("How soon could you start?");
    expect(screen.getAllByRole("radio").length).toBeGreaterThan(5);
  });

  it("first job: the salary hint says a range is fine", () => {
    render(<Harness id="desiredSalary" persona="first_job" />);
    expect(screen.getByText("A range is fine, e.g. $45–55k")).toBeTruthy();
  });

  it("everyone else keeps the /welcome salary hint", () => {
    render(<Harness id="desiredSalary" persona="experienced" />);
    expect(screen.queryByText("A range is fine, e.g. $45–55k")).toBeNull();
    expect(screen.getByText(/Write it the way you'd say it/)).toBeTruthy();
  });

  it("work arrangement and relocation are one screen with two answers", () => {
    const onContinue = vi.fn();
    render(<Harness id="workPreference" persona="switching" onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("radio", { name: "Hybrid" }));
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0]);
    fireEvent.click(cont());
    expect(onContinue).toHaveBeenCalledWith({ workPreference: "Hybrid", willingToRelocate: "Yes" });
  });
});

describe("PrefsFlow: the self-identification screen", () => {
  it("is optional and collapsed, never pre-selected, with the §5.9 sub line", () => {
    const { container } = render(<Harness id="gender" persona="experienced" last />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Voluntary self-identification");
    expect(screen.getByText("Optional. Only filled where a form asks, and you review each one.")).toBeTruthy();
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    // five dropdowns, each showing its placeholder dash (nothing selected)
    expect(container.querySelectorAll("[aria-haspopup=listbox]")).toHaveLength(5);
    expect(cont().disabled).toBe(true);
  });

  it("answering one of the five turns Continue on", () => {
    const onContinue = vi.fn();
    render(<Harness id="gender" onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("button", { name: /Gender/ }));
    fireEvent.click(screen.getByRole("option", { name: "Prefer not to say" }));
    expect(cont().disabled).toBe(false);
    fireEvent.click(cont());
    expect(onContinue).toHaveBeenCalledWith({ gender: "Prefer not to say" });
  });
});

describe("PrefsFlow: Show all questions", () => {
  it("is offered on the last screen only, and only when the persona hid something", () => {
    const onShowAll = vi.fn();
    const { rerender } = render(<Harness id="gender" persona="student" last hiddenLeft={1} onShowAll={onShowAll} />);
    fireEvent.click(screen.getByRole("button", { name: "Show all questions" }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
    rerender(<Harness id="gender" persona="student" last hiddenLeft={0} />);
    expect(screen.queryByRole("button", { name: "Show all questions" })).toBeNull();
    rerender(<Harness id="authorizedToWork" persona="student" hiddenLeft={1} />);
    expect(screen.queryByRole("button", { name: "Show all questions" })).toBeNull();
  });
});

describe("hasAnswer / valuesToWrite", () => {
  it("a question has an answer when any of its keys is filled", () => {
    expect(hasAnswer(q("workPreference"), {})).toBe(false);
    expect(hasAnswer(q("workPreference"), { willingToRelocate: "Yes" })).toBe(true);
    expect(hasAnswer(q("authorizedToWork"), { authorizedToWork: "  " })).toBe(false);
    expect(prefId(q("gender"))).toBe("gender");
  });

  it("writes only this question's filled keys, trimmed", () => {
    expect(valuesToWrite(q("workPreference"), { workPreference: "Remote", willingToRelocate: "", desiredSalary: "1" }, null)).toEqual({ workPreference: "Remote" });
    expect(valuesToWrite(q("authorizedToWork"), {}, null)).toEqual({});
  });

  it("the start question of a student also writes the month", () => {
    expect(valuesToWrite(q("noticePeriod"), { noticePeriod: "2 months", earliestStartDate: "2027-01" }, "student")).toEqual({ noticePeriod: "2 months", earliestStartDate: "2027-01" });
    expect(valuesToWrite(q("noticePeriod"), { noticePeriod: "2 months", earliestStartDate: "2027-01" }, "experienced")).toEqual({ noticePeriod: "2 months" });
  });
});
