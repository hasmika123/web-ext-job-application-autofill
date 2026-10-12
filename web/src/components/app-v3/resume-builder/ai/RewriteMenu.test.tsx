import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RewriteMenu from "./RewriteMenu";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

afterEach(cleanup);

describe("RewriteMenu - the section pill", () => {
  it("Pro: opens a menu of the five modes and says what gets sent", () => {
    render(<RewriteMenu locked={false} variant="section" subject="Summary" onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rewrite with AI: Summary" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(5);
    for (const label of ["Stronger", "Shorter", "More formal", "Plain language", "Fix grammar"]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(`^${label}`) })).toBeTruthy();
    }
    expect(screen.getByText("Sends your resume text to Kiwiply AI")).toBeTruthy();
  });

  it("picking a mode starts the rewrite with that mode", () => {
    const onPick = vi.fn();
    render(<RewriteMenu locked={false} variant="section" subject="Experience" onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Rewrite with AI: Experience" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Plain language/ }));
    expect(onPick).toHaveBeenCalledWith("plain");
  });

  it("Free: a lock with the Pro chip that opens an upgrade card, never a mode menu", () => {
    const onPick = vi.fn();
    const onLockedClick = vi.fn();
    render(<RewriteMenu locked variant="section" subject="Summary" onPick={onPick} onLockedClick={onLockedClick} />);
    const button = screen.getByRole("button", { name: "Rewrite with AI: Summary (Pro)" });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(within(button).getByText("Pro")).toBeTruthy();
    fireEvent.click(button);
    expect(onLockedClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(screen.getByText("AI rewriting is part of Pro")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/pricing");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("an empty block keeps the pill but turns it off and says why", () => {
    render(<RewriteMenu locked={false} variant="section" subject="Summary" disabledHint="Write a few words first, then AI can rewrite them" onPick={vi.fn()} />);
    const button = screen.getByRole("button", { name: /Rewrite with AI: Summary/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("Write a few words first, then AI can rewrite them");
  });
});

describe("RewriteMenu - the bullet control", () => {
  it("Pro: a menu headed 'Rewrite this bullet' with the same five modes", () => {
    const onPick = vi.fn();
    render(<RewriteMenu locked={false} variant="bullet" subject="bullet 2" onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Rewrite bullet 2 with AI" }));
    expect(screen.getByText("Rewrite this bullet")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /^Fix grammar/ }));
    expect(onPick).toHaveBeenCalledWith("grammar");
  });

  it("Free: a lock button with an upgrade card", () => {
    render(<RewriteMenu locked variant="bullet" subject="bullet 2" onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rewrite bullet 2 with AI (Pro)" }));
    expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/pricing");
  });
});
