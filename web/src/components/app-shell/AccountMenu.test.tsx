import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountMenu from "./AccountMenu";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

function open(orgsEnabled?: boolean) {
  render(<AccountMenu initial="P" name="Priya" isPro={false} {...(orgsEnabled === undefined ? {} : { orgsEnabled })} />);
  fireEvent.click(screen.getByRole("button", { name: /account menu for priya/i }));
}

describe("AccountMenu organization entry (E2E-O1.9)", () => {
  it("shows Kiwiply for Organizations while the org flag is on", () => {
    open(true);
    const link = screen.getByRole("menuitem", { name: /kiwiply for organizations/i });
    expect(link.getAttribute("href")).toBe("/org");
  });

  it("hides it while the flag is off", () => {
    open(false);
    expect(screen.queryByRole("menuitem", { name: /kiwiply for organizations/i })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /profile/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeTruthy();
  });

  it("fails closed: with no value at all there is no organization entry", () => {
    open();
    expect(screen.queryByRole("menuitem", { name: /kiwiply for organizations/i })).toBeNull();
  });
});
