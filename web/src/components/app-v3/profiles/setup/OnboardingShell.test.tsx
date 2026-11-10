import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OnboardingShell, { EXIT_LABEL, RESTART_BODY, RESTART_TITLE, type OnboardingShellProps } from "./OnboardingShell";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault(); // jsdom cannot navigate
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

const base: OnboardingShellProps = {
  screenKey: "skills",
  direction: "forward",
  progress: 0.43,
  label: "about 1 min left",
  valueText: "Step 4 of 7, about 1 minute left",
  announce: "Step 4 of 7",
  onBack: vi.fn(),
  sync: { status: "saved", reason: "network", onRetry: vi.fn() },
  onChangePersona: vi.fn(),
  onStartOver: vi.fn(),
  children: <h1>Your skills — tap to add.</h1>,
};
const shell = (over: Partial<OnboardingShellProps> = {}) => <OnboardingShell {...base} {...over} />;

describe("OnboardingShell: the bar", () => {
  it("one 4 px progressbar with its value, the words a person hears, and the estimate beside it", () => {
    render(shell());
    const bar = screen.getByRole("progressbar", { name: "Profile setup" });
    expect(bar.getAttribute("aria-valuenow")).toBe("43");
    expect(bar.getAttribute("aria-valuetext")).toBe("Step 4 of 7, about 1 minute left");
    expect(bar.className).toContain("h-1");
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.getByTestId("bar-label").textContent).toBe("about 1 min left");
  });

  it("no label when there is none (the payoff)", () => {
    render(shell({ label: null }));
    expect(screen.queryByTestId("bar-label")).toBeNull();
  });

  it("has no step labels, numbered dots or Stepper", () => {
    const { container } = render(shell());
    expect(container.querySelector("[aria-current='step']")).toBeNull();
    expect(screen.queryByText("Your resume")).toBeNull();
    expect(screen.queryByText(/Nothing is saved until you finish/)).toBeNull();
  });
});

describe("OnboardingShell: the top bar", () => {
  it("Back is a real button when there is a screen to go back to, and absent otherwise (hello)", () => {
    const onBack = vi.fn();
    const { rerender } = render(shell({ onBack }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    rerender(shell({ onBack: null }));
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("Exit links to the dashboard with the words that say the progress is kept", () => {
    const onExit = vi.fn();
    render(shell({ onExit }));
    const exit = screen.getByRole("link", { name: EXIT_LABEL });
    expect(EXIT_LABEL).toBe("Exit setup — your progress is saved");
    expect(exit.getAttribute("href")).toBe("/dashboard");
    fireEvent.click(exit);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("every icon-only control has a name and a tooltip", () => {
    render(shell());
    const iconOnly = [...document.querySelectorAll<HTMLElement>("button, a[href]")].filter((el) => el.querySelector("svg") && (el.textContent ?? "").trim() === "");
    expect(iconOnly.length).toBeGreaterThanOrEqual(2);
    for (const el of iconOnly) {
      expect((el.getAttribute("aria-label") ?? "").length).toBeGreaterThan(0);
      expect(el.closest("[data-tooltip-trigger]"), `${el.getAttribute("aria-label")} has no tooltip`).not.toBeNull();
    }
  });

  it("the save pill lives in the bar and the conflict / picked-up lines sit under it", () => {
    render(shell({ sync: { status: "saved", reason: "network", onRetry: vi.fn() }, banners: <p>Picked up where you left off</p> }));
    expect(screen.getByTestId("save-status")).toBeTruthy();
    expect(screen.getByText("Picked up where you left off")).toBeTruthy();
  });

  it("a long offline message gets its own line on a phone instead of squeezing the bar", () => {
    render(shell({ sync: { status: "offline", reason: "network", onRetry: vi.fn() } }));
    expect(screen.getByTestId("save-status").className).toContain("max-sm:basis-full");
    cleanup();
    render(shell());
    expect(screen.getByTestId("save-status").className).not.toContain("max-sm:basis-full");
  });
});

describe("OnboardingShell: the ⋯ menu", () => {
  const open = () => fireEvent.click(screen.getByRole("button", { name: "More options" }));

  it("Change who I am, Start over and Exit", () => {
    const onChangePersona = vi.fn();
    render(shell({ onChangePersona }));
    open();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Change who I am", "Start over", "Exit"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Change who I am" }));
    expect(onChangePersona).toHaveBeenCalledTimes(1);
  });

  it("without the persona step there is no 'Change who I am'", () => {
    render(shell({ onChangePersona: undefined }));
    open();
    expect(screen.queryByRole("menuitem", { name: "Change who I am" })).toBeNull();
  });

  it("Exit leaves for the dashboard", () => {
    const onExit = vi.fn();
    render(shell({ onExit }));
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Exit" }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("Start over asks first, in the §5.14 words; 'Keep going' does nothing, 'Start over' resets", () => {
    const onStartOver = vi.fn();
    render(shell({ onStartOver }));
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Start over" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(RESTART_TITLE);
    expect(RESTART_BODY).toBe("Your confirmed profile stays; only the unfinished steps reset.");
    expect(dialog.textContent).toContain(RESTART_BODY);
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    expect(onStartOver).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});

describe("OnboardingShell: a new screen", () => {
  function Host() {
    const [key, setKey] = useState("skills");
    return (
      <>
        <button type="button" onClick={() => setKey("you")}>
          go
        </button>
        <OnboardingShell {...base} screenKey={key} announce={key === "you" ? "Step 5 of 7" : "Step 4 of 7"}>
          <h1>{key === "you" ? "Last check — is this you?" : "Your skills — tap to add."}</h1>
          <button type="button">a button</button>
        </OnboardingShell>
      </>
    );
  }

  it("moves focus to the new screen's h1 and announces the step (not on the first paint)", () => {
    render(<Host />);
    expect(document.activeElement?.tagName).toBe("BODY");
    expect(screen.getByTestId("step-announce").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(document.activeElement?.tagName).toBe("H1");
    expect(document.activeElement?.textContent).toBe("Last check — is this you?");
    expect(screen.getByTestId("step-announce").textContent).toBe("Step 5 of 7");
    expect(screen.getByTestId("step-announce").getAttribute("aria-live")).toBe("polite");
  });

  it("the screen carries the direction of travel for the slide", () => {
    const { container, rerender } = render(shell({ direction: "forward" }));
    expect(container.querySelector(".ob-screen")?.getAttribute("data-dir")).toBe("forward");
    rerender(shell({ direction: "back" }));
    expect(container.querySelector(".ob-screen")?.getAttribute("data-dir")).toBe("back");
  });
});
