import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { freshReducer, initialFresh, type FreshState } from "@/lib/profile-setup/fresh";
import type { SetupParse } from "@/lib/profile-setup/parse";
import FreshFlow from "./FreshFlow";

afterEach(cleanup);

const BIO = { valueChars: 100, summaryChars: 400 };
const BULLET = 120;

function Harness({ onDone, onBack, start }: { onDone: (r: SetupParse) => void; onBack?: () => void; start?: FreshState }) {
  const [fresh, dispatch] = useReducer(freshReducer, start ?? initialFresh());
  return <FreshFlow fresh={fresh} dispatch={dispatch} bioLimits={BIO} bulletChars={BULLET} onDone={onDone} onBack={onBack ?? (() => undefined)} />;
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pick = (name: string | RegExp) => fireEvent.click(screen.getByRole("radio", { name }));
const heading = () => screen.getByRole("heading", { level: 2 }).textContent;

describe("FreshFlow", () => {
  it("walks the whole conversation and hands the review a draft of the person's own answers", () => {
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);

    expect(heading()).toBe("What are you looking for?");
    pick("My first job");
    next();

    expect(heading()).toBe("How would you describe yourself in one line?");
    fireEvent.click(screen.getByRole("button", { name: "Use Recent graduate seeking an entry-level role" }));
    expect((screen.getByLabelText(/How would you describe yourself/) as HTMLInputElement).value).toBe("Recent graduate seeking an entry-level role");
    next();

    // First job: study comes first in the options.
    expect(heading()).toBe("Let's add your most recent job or school.");
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["School or training", "A job or internship", "Skip, I'll add these later"]);
    pick("School or training");
    next();

    type(/Which school or program/, "State University");
    next();
    type(/What did you study/, "BA Economics");
    next();
    const start = screen.getByRole("group", { name: /When did you start/ });
    fireEvent.change(within(start).getByLabelText("Year"), { target: { value: "2019" } });
    next();
    fireEvent.change(within(screen.getByRole("group", { name: /When did you finish/ })).getByLabelText("Year"), { target: { value: "2023" } });
    next();

    // Add another? -> a job
    expect(heading()).toBe("Add another?");
    pick("Another job or internship");
    next();
    type(/What was your job title/, "Barista");
    next();
    expect(heading()).toBe("Where did you work as a Barista?");
    type(/Where did you work/, "Blue Cafe");
    next();
    next(); // start: skipped (dates are optional)
    fireEvent.click(screen.getByLabelText("I still work here"));
    expect(within(screen.getByRole("group", { name: /When did it end/ })).getByLabelText("Year")).toHaveProperty("disabled", true);
    next();
    type(/What did you do/, "Served 80 customers a shift");
    next();
    next(); // How: skipped
    type(/What was the result/, "Kept waits under three minutes");
    next();

    pick("That's everything for now");
    next();

    // Skills: the roles typed shape the suggestions.
    expect(heading()).toBe("Which skills do you have?");
    fireEvent.click(screen.getByRole("button", { name: "Use Cash handling" }));
    next();

    type("LinkedIn", "linkedin.com/in/me");
    next();

    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0][0] as SetupParse;
    expect(result.source).toBe("fresh");
    expect(result.removed).toBe(0);
    expect(result.draft.candidates.map((c) => [c.section, c.data.title ?? c.data.school])).toEqual([
      ["EDUCATION", "State University"],
      ["EXPERIENCE", "Barista"],
    ]);
    expect(result.draft.candidates[1].data).toMatchObject({ org: "Blue Cafe", current: true });
    expect(result.draft.candidates[1].data.bullets).toEqual([
      { text: "Served 80 customers a shift", src: "user" },
      { text: "Kept waits under three minutes", src: "user" },
    ]);
    expect(result.draft.skills).toEqual(["Cash handling"]);
    expect(result.typed).toEqual({ headline: "Recent graduate seeking an entry-level role", linkedin: "https://linkedin.com/in/me" });
  });

  it("every question has one labelled answer and a visible Next", () => {
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);
    const seen: string[] = [];
    const checkStep = () => {
      const h = heading() as string;
      seen.push(h);
      expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
      const controls = [...document.querySelectorAll("input:not([type=hidden]), textarea, [role=radiogroup], [role=group]")] as HTMLElement[];
      expect(controls.length).toBeGreaterThan(0);
      for (const c of controls) {
        // The chip box and the month picker carry their own inner names; each control has SOME accessible name.
        const named = c.getAttribute("aria-label") || c.getAttribute("aria-labelledby") || (c as HTMLInputElement).labels?.length;
        expect(named, `${h}: ${c.outerHTML.slice(0, 80)}`).toBeTruthy();
      }
    };
    checkStep(); // goal
    next();
    checkStep(); // headline
    next();
    checkStep(); // menu
    pick("A job or internship");
    next();
    checkStep(); // role.title
    type(/job title/, "Barista");
    next();
    checkStep(); // org
    type(/Where did you work/, "Cafe");
    next();
    for (let i = 0; i < 5; i++) {
      checkStep(); // start, end, what, how, result
      next();
    }
    checkStep(); // menu: add another
    pick("Another school or course");
    next();
    type(/Which school/, "State U");
    for (let i = 0; i < 4; i++) {
      checkStep(); // name, degree, start, end
      next();
    }
    pick("That's everything for now");
    next();
    checkStep(); // skills
    next();
    checkStep(); // links
    expect(new Set(seen).size).toBeGreaterThan(10);
  });

  it("will not go on without a job title or company, and says so", () => {
    render(<Harness onDone={vi.fn()} />);
    next();
    next();
    pick("A job or internship");
    next();
    next();
    expect(screen.getByRole("alert").textContent).toBe("Job title is required.");
    expect(heading()).toBe("What was your job title?");
    type(/job title/, "Barista");
    expect(screen.queryByRole("alert")).toBeNull(); // typing clears it
    next();
    next();
    expect(screen.getByRole("alert").textContent).toBe("Company is required.");
  });

  it("refuses a never-collected value and leaves the question where it is", () => {
    render(<Harness onDone={vi.fn()} />);
    next();
    type(/How would you describe yourself/, "SSN 123-45-6789");
    next();
    expect(screen.getByRole("alert").textContent).toMatch(/never store/);
    expect(heading()).toBe("How would you describe yourself in one line?");
  });

  it("Back returns to the previous question with the answer still there, and from the first goes to the path picker", () => {
    const onBack = vi.fn();
    render(<Harness onDone={vi.fn()} onBack={onBack} />);
    pick("An internship");
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(heading()).toBe("What are you looking for?");
    expect(screen.getByRole("radio", { name: "An internship" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("an end before the start is refused with a message", () => {
    render(<Harness onDone={vi.fn()} />);
    next();
    next();
    pick("School or training");
    next();
    type(/Which school/, "State U");
    next();
    next();
    fireEvent.change(within(screen.getByRole("group", { name: /When did you start/ })).getByLabelText("Year"), { target: { value: "2023" } });
    next();
    fireEvent.change(within(screen.getByRole("group", { name: /When did you finish/ })).getByLabelText("Year"), { target: { value: "2019" } });
    next();
    expect(screen.getByRole("alert").textContent).toMatch(/can't be before/);
  });
});
