// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./CanonicalMatchesPanel", () => ({
  default: ({ orgId }: { orgId: number }) => (
    <section aria-label="Canonical suggestions" data-canonical-matches>
      Canonical panel for organization {orgId}
    </section>
  ),
}));

import JobMatchesPage from "./JobMatchesPage";

describe("JobMatchesPage", () => {
  it("renders the canonical matches panel as the only active board", () => {
    render(<JobMatchesPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={{}} />);

    expect(screen.getByRole("region", { name: "Canonical suggestions" })).toBeTruthy();
    expect(screen.getByText("Canonical panel for organization 2")).toBeTruthy();
    expect(document.querySelector("[data-legacy-matches]")).toBeNull();
  });
});
