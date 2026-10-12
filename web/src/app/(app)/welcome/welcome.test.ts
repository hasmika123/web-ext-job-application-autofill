import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn((to: string): never => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

import WelcomePage from "./page";

describe("/welcome", () => {
  it("redirects to /profiles/setup?step=prefs", () => {
    expect(() => WelcomePage()).toThrow("NEXT_REDIRECT:/profiles/setup?step=prefs&from=welcome");
    expect(redirect).toHaveBeenCalledWith("/profiles/setup?step=prefs&from=welcome");
  });
});
