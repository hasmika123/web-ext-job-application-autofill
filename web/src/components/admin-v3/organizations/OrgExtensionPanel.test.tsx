import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrgExtensionPanel from "./OrgExtensionPanel";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const pkg = {
  orgId: 7,
  slug: "acme-staffing",
  name: "Acme Staffing",
  shortName: "Acme",
  primaryColor: "#1d5bd8",
  logo: null,
  web: "https://careers.acme.test",
  origins: ["https://careers.acme.test", "https://jobs.acme.test"],
  api: "https://api.kiwiply.com",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrgExtensionPanel: the organization's own extension", () => {
  it("loads nothing until asked, then downloads the package settings and shows where the build works", async () => {
    const fetchMock = vi.fn(async () => json(pkg));
    vi.stubGlobal("fetch", fetchMock);
    const created: Blob[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => (created.push(b), "blob:x"), revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<OrgExtensionPanel orgId={7} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Download package settings" }));
    await waitFor(() => expect(document.querySelector("[data-extension-package]")).toBeTruthy());
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("/api/admin/orgs/7/extension-package");
    expect(screen.getByText("https://careers.acme.test, https://jobs.acme.test")).toBeTruthy();
    expect(screen.getByText(/No published logo yet/)).toBeTruthy();
    expect(screen.getByText(/--config acme-staffing-extension.json/)).toBeTruthy();
    const text = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(created[0]);
    });
    expect(JSON.parse(text)).toEqual(pkg);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("an organization without a live custom domain gets the reason, not a file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ code: "NO_LIVE_DOMAIN", error: "This organization has no live custom domain yet. Its own extension serves on its own domains only, so add one and wait for its certificate." }, 409),
      ),
    );
    render(<OrgExtensionPanel orgId={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Download package settings" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/no live custom domain/);
    expect(document.querySelector("[data-extension-package]")).toBeNull();
  });
});
