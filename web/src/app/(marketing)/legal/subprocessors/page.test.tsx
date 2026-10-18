import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSubprocessors = vi.fn();
vi.mock("@/lib/subprocessors", () => ({ getSubprocessors: () => getSubprocessors() }));

import SubprocessorsPage from "./page";

afterEach(() => {
  cleanup();
  getSubprocessors.mockReset();
});

const entry = { name: "Stripe", purpose: "Takes payments.", data: "E-mail address.", location: "United States", link: "https://stripe.com/privacy" };

describe("/legal/subprocessors", () => {
  it("lists each subprocessor with purpose, data, location and a link to its terms", async () => {
    getSubprocessors.mockResolvedValue([entry, { ...entry, name: "Brevo", link: "" }]);
    render(await SubprocessorsPage());
    const list = screen.getByTestId("subprocessor-list");
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Stripe" })).toBeTruthy();
    expect(screen.getAllByText("Takes payments.")).toHaveLength(2);
    const links = screen.getAllByRole("link", { name: "Privacy information" });
    expect(links).toHaveLength(1); // the entry without a link has none
    expect(links[0].getAttribute("href")).toBe("https://stripe.com/privacy");
    expect(links[0].getAttribute("rel")).toBe("noreferrer");
  });

  it("says plainly that the list could not be loaded instead of showing it empty", async () => {
    getSubprocessors.mockResolvedValue(null);
    render(await SubprocessorsPage());
    expect(screen.getByRole("status").textContent).toContain("could not be loaded");
    expect(screen.queryByTestId("subprocessor-list")).toBeNull();
  });

  it("says so when nothing is listed", async () => {
    getSubprocessors.mockResolvedValue([]);
    render(await SubprocessorsPage());
    expect(screen.getByText(/No subprocessors are listed/)).toBeTruthy();
  });

  it("links to the privacy policy and offers a DPA contact", async () => {
    getSubprocessors.mockResolvedValue([entry]);
    render(await SubprocessorsPage());
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
    expect(document.body.textContent).toContain("support@kiwiply.com");
  });
});
