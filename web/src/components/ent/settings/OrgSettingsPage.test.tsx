// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import OrgSettingsPage from "./OrgSettingsPage";

let current: { consultantShareLinks: boolean; overridden: boolean };
let calls: { method: string; url: string; body: unknown }[];
let writeStatus = 200;

beforeEach(() => {
  calls = [];
  current = { consultantShareLinks: false, overridden: false };
  writeStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (method === "PUT" && writeStatus === 200) current = { consultantShareLinks: body.consultantShareLinks, overridden: true };
      const status = method === "PUT" ? writeStatus : 200;
      return new Response(JSON.stringify(status === 200 ? current : { error: "Nope." }), { status, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 20))));
async function mount() {
  render(
    <ToastProvider>
      <OrgSettingsPage orgId={7} />
    </ToastProvider>,
  );
  await flush();
}
const toggle = () => screen.getByRole("switch", { name: /Share links/ });

describe("the org admin's consultant share-link switch", () => {
  it("reads the policy of its own organization and explains the switch in one line, off by default", async () => {
    await mount();
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/orgs/7/resume-policy" });
    expect(screen.getByText("Let consultants create share links for their organization resumes")).toBeTruthy();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("autosaves on a click (no Save button), shows an inline check, and offers Undo", async () => {
    await mount();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
    fireEvent.click(toggle());
    await flush();
    expect(calls.filter((c) => c.method === "PUT")).toEqual([{ method: "PUT", url: "/api/orgs/7/resume-policy", body: { consultantShareLinks: true } }]);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("[data-saved-tick]")).not.toBeNull();
    expect(screen.getByText("Consultants can now create share links")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await flush();
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.body)).toEqual([{ consultantShareLinks: true }, { consultantShareLinks: false }]);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("puts the switch back and says why when the save is refused", async () => {
    await mount();
    writeStatus = 422;
    fireEvent.click(toggle());
    await flush();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Not saved")).toBeTruthy();
    expect(screen.getByText("Nope.")).toBeTruthy();
    expect(document.querySelector("[data-saved-tick]")).toBeNull();
  });

  it("shows a quiet denied state when the API answers 404 (not the org's admin)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await mount();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(/don't have access/i)).toBeTruthy();
  });
});
