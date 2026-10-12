import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BuildProfileCard, { SETUP_PROMPT_BELOW } from "./BuildProfileCard";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

afterEach(cleanup);

describe("BuildProfileCard", () => {
  it("offers the setup below the threshold, with the score", () => {
    render(<BuildProfileCard score={SETUP_PROMPT_BELOW - 1} />);
    expect(screen.getByText(/Your profile is 39% complete/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Start/ }).getAttribute("href")).toBe("/profiles/setup");
  });

  it("is not shown once the profile is past the threshold", () => {
    const { container } = render(<BuildProfileCard score={SETUP_PROMPT_BELOW} />);
    expect(container.innerHTML).toBe("");
  });
});
