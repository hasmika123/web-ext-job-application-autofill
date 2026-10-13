import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXT_STORE_URL } from "@/lib/extension-signal";

vi.mock("next/image", () => ({ default: ({ src }: { src: string }) => <span data-mascot={src} /> }));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));
const detect = vi.fn();
vi.mock("@/lib/extension-signal", async (orig) => ({ ...(await orig<typeof import("@/lib/extension-signal")>()), detectExtension: (...a: unknown[]) => detect(...a) }));

import PayoffStep, { BUILD_RESUME_HREF, EXTENSION_PING_MS, payoffLine } from "./PayoffStep";

const ALL = ["build_resume", "install_extension", "find_jobs"];
const base: React.ComponentProps<typeof PayoffStep> = { firstName: "Priya", fields: 31, score: 72, actions: ALL, returnTo: null, jobsCount: null, mascot: true, confetti: true, onAction: vi.fn() };

beforeEach(() => {
  detect.mockReset();
  detect.mockResolvedValue(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = async (over: Partial<React.ComponentProps<typeof PayoffStep>> = {}) => {
  const view = render(<PayoffStep {...base} {...over} />);
  await act(async () => undefined);
  return view;
};
const media = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));

describe("PayoffStep: the line", () => {
  it("shows the computed count with the tilde", async () => {
    await show();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("You're set, Priya.");
    expect(screen.getByTestId("payoff-line").textContent).toBe("Kiwiply can now autofill ~31 fields for you.");
    expect(payoffLine(1)).toBe("Kiwiply can now autofill ~1 fields for you.");
  });

  it("zero fields: no number is better than a fake one", async () => {
    await show({ fields: 0 });
    expect(screen.getByTestId("payoff-line").textContent).toBe("Kiwiply is ready to learn as you apply.");
  });

  it("no name gives 'You're set.'", async () => {
    await show({ firstName: " " });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("You're set.");
  });

  it("the profile strength is a meter; none when it could not be read", async () => {
    const { unmount } = await show();
    expect(screen.getByRole("meter", { name: "Profile strength" }).getAttribute("aria-valuenow")).toBe("72");
    unmount();
    await show({ score: null });
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("moves focus to its heading", async () => {
    await show();
    expect(document.activeElement?.tagName).toBe("H1");
  });
});

describe("PayoffStep: what's next", () => {
  it("the three actions in the admin's order, the first one accented", async () => {
    await show({ jobsCount: 3 });
    const titles = screen.getAllByRole("link").map((l) => l.textContent);
    expect(titles[0]).toContain("Build a resume");
    expect(titles[1]).toContain("Install the extension");
    expect(titles[2]).toContain("Find jobs");
    expect(titles[2]).toContain("3 picked for you today");
    expect(screen.getByRole("link", { name: /Build a resume/ }).className).toContain("border-accent");
    expect(screen.getByRole("link", { name: /Find jobs/ }).className).not.toContain("bg-accent-soft/70");
    expect(screen.getByRole("link", { name: "Go to dashboard" }).getAttribute("href")).toBe("/dashboard");
  });

  it("the admin can reorder, shorten and (silently) mistype the list", async () => {
    await show({ actions: ["find_jobs", "nonsense", "build_resume", "find_jobs"] });
    const titles = screen.getAllByRole("link").map((l) => l.textContent ?? "");
    expect(titles.filter((t) => t.includes("Find jobs"))).toHaveLength(1);
    expect(titles[0]).toContain("Find jobs");
    expect(titles[1]).toContain("Build a resume");
    expect(screen.queryByText("What's next")).not.toBeNull();
  });

  it("Build a resume goes to the profile chooser, or to `return` when the person came from the chooser", async () => {
    const { unmount } = await show();
    expect(screen.getByRole("link", { name: /Build a resume/ }).getAttribute("href")).toBe(BUILD_RESUME_HREF);
    expect(BUILD_RESUME_HREF).toBe("/resume-builder?new=profile");
    unmount();
    await show({ returnTo: "/resume-builder?new=profile&x=1" });
    expect(screen.getByRole("link", { name: /Build a resume/ }).getAttribute("href")).toBe("/resume-builder?new=profile&x=1");
  });

  it("Find jobs shows a count only for real matches (>= 1)", async () => {
    const { unmount } = await show({ jobsCount: null });
    expect(screen.queryByText(/picked for you today/)).toBeNull();
    unmount();
    await show({ jobsCount: 0 });
    expect(screen.queryByText(/picked for you today/)).toBeNull();
  });

  it("asks the extension within 300 ms; when it is there the install card is not", async () => {
    detect.mockResolvedValue(true);
    await show();
    expect(detect).toHaveBeenCalledWith(EXTENSION_PING_MS);
    expect(EXTENSION_PING_MS).toBe(300);
    expect(screen.queryByRole("link", { name: /Install the extension/ })).toBeNull();
  });

  it("when it is not there, the install card opens the store in a new tab", async () => {
    await show();
    const link = screen.getByRole("link", { name: /Install the extension/ });
    expect(link.getAttribute("href")).toBe(EXT_STORE_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("no install card flashes in before the answer is known", async () => {
    detect.mockReturnValue(new Promise(() => undefined));
    await show();
    expect(screen.queryByRole("link", { name: /Install the extension/ })).toBeNull();
  });

  it("a phone shows the laptop line instead, and never asks", async () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148" });
    await show();
    expect(screen.getByTestId("laptop-note").textContent).toBe("Autofill works on your laptop — we'll show you there");
    expect(screen.queryByRole("link", { name: /Install the extension/ })).toBeNull();
    expect(detect).not.toHaveBeenCalled();
  });

  it("each tap is reported (the action name only)", async () => {
    const onAction = vi.fn();
    await show({ onAction });
    screen.getByRole("link", { name: /Build a resume/ }).click();
    screen.getByRole("link", { name: "Go to dashboard" }).click();
    expect(onAction).toHaveBeenNthCalledWith(1, "build_resume");
    expect(onAction).toHaveBeenNthCalledWith(2, "dashboard");
  });
});

describe("PayoffStep: the celebration", () => {
  it("plays one confetti burst, and the mascot claps", async () => {
    media(false);
    const { container } = await show();
    expect(container.querySelector("[data-confetti]")).not.toBeNull();
    expect(container.querySelector("[data-mascot='/v2/mascot-clap.png']")).not.toBeNull();
    expect(container.querySelector(".ob-pop-in")).not.toBeNull();
  });

  it("no confetti under reduced motion", async () => {
    media(true);
    const { container } = await show();
    expect(container.querySelector("[data-confetti]")).toBeNull();
  });

  it("no confetti when the admin switched it off, and no mascot when they are off", async () => {
    media(false);
    const { container } = await show({ confetti: false, mascot: false });
    expect(container.querySelector("[data-confetti]")).toBeNull();
    expect(container.querySelector("[data-mascot]")).toBeNull();
  });
});
