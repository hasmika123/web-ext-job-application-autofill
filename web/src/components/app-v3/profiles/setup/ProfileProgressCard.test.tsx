import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Completeness } from "@/lib/profile-items";
import ProfileProgressCard, { profileHref } from "./ProfileProgressCard";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

afterEach(cleanup);

const SETUP_PROMPT_BELOW = DEFAULT_BUILDER_CONFIG.profile.setupPromptBelowPercent;
const c = (score: number, nextAction: Completeness["nextAction"]): Completeness => ({ score, parts: {}, nextAction });

describe("ProfileProgressCard (dashboard hook, R1.6)", () => {
  it('reads "Profile 62% - next: ..." and links to the tab where the next step is done', () => {
    render(<ProfileProgressCard completeness={c(62, { key: "summary", label: "Write a short summary", href: "/profiles?tab=personal" })} promptBelow={SETUP_PROMPT_BELOW} />);
    expect(screen.getByRole("heading").textContent).toBe("Profile 62% — next: Write a short summary");
    expect(screen.getByRole("link", { name: /Continue/ }).getAttribute("href")).toBe("/profiles?tab=personal");
    expect(screen.getByRole("meter", { name: "Profile strength" }).getAttribute("aria-valuenow")).toBe("62");
  });

  it("leaves the low range to the setup card, and says nothing when nothing is missing or nothing is known", () => {
    for (const completeness of [c(SETUP_PROMPT_BELOW - 1, { key: "experience", label: "Add a role", href: "/profiles?tab=work" }), c(100, null), null]) {
      const { container } = render(<ProfileProgressCard completeness={completeness} promptBelow={SETUP_PROMPT_BELOW} />);
      expect(container.innerHTML).toBe("");
      cleanup();
    }
  });

  it("only links into the profile tabs, whatever the API sent", () => {
    expect(profileHref("/profiles?tab=work")).toBe("/profiles?tab=work");
    expect(profileHref("/profiles?tab=nope")).toBe("/profiles");
    expect(profileHref("https://evil.example/x")).toBe("/profiles");
    expect(profileHref(null)).toBe("/profiles");
  });
});
