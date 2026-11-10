// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import PrepareSettingsSection from "./PrepareSettingsSection";

type Limit = { value: number; platformMax: number; min: number; custom: boolean };
let current: { platformEnabled: boolean; enabled: boolean; dailyCap: Limit; monthlyCap: Limit; maxBatch: Limit; licensed: { consultants: number; total: number; featureName: string } };
let calls: { method: string; url: string; body: Record<string, unknown> | undefined }[];
let putStatus = 200;
let putBody: unknown = null;

const lim = (value: number, platformMax: number, custom = false): Limit => ({ value, platformMax, min: 1, custom });
const fresh = () => ({
  platformEnabled: true,
  enabled: false,
  dailyCap: lim(30, 30),
  monthlyCap: lim(300, 300),
  maxBatch: lim(10, 10),
  licensed: { consultants: 2, total: 5, featureName: "Autopilot prepare" },
});

beforeEach(() => {
  calls = [];
  putStatus = 200;
  putBody = null;
  current = fresh();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ method, url, body });
      if (method === "PUT" && putStatus === 200 && putBody === null && body) {
        // the API keeps a number above Kiwiply's maximum at the maximum
        const next = { ...current };
        if (typeof body.enabled === "boolean") next.enabled = body.enabled;
        for (const k of ["dailyCap", "monthlyCap", "maxBatch"] as const) {
          if (!(k in body)) continue;
          const v = body[k];
          next[k] = v === null ? { ...current[k], value: current[k].platformMax, custom: false } : { ...current[k], value: Math.min(Number(v), current[k].platformMax), custom: true };
        }
        current = next;
      }
      const status = method === "PUT" ? putStatus : 200;
      const out = method === "PUT" && putBody !== null ? putBody : current;
      return new Response(JSON.stringify(out), { status, headers: { "content-type": "application/json" } });
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
      <PrepareSettingsSection orgId={7} />
    </ToastProvider>,
  );
  await flush();
}
const toggle = () => screen.getByRole("switch", { name: /prepare selected openings/i });
const field = (k: string) => document.querySelector(`[data-prepare-limit="${k}"]`) as HTMLInputElement;
const puts = () => calls.filter((c) => c.method === "PUT");

describe("Organization Settings: Prepare selected openings", () => {
  it("reads its own organization, explains the feature plainly and starts off", async () => {
    await mount();
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/orgs/7/org-settings/prepare" });
    const text = document.querySelector("[data-prepare-explainer]")!.textContent!;
    expect(text).toContain("opens each job in its own tab");
    expect(text).toContain("always reviews");
    expect(text).toContain("Nothing is ever submitted for them");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  it("autosaves the switch with an inline check and an Undo that turns it back", async () => {
    await mount();
    fireEvent.click(toggle());
    await flush();
    expect(puts()).toEqual([{ method: "PUT", url: "/api/orgs/7/org-settings/prepare", body: { enabled: true } }]);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("[data-saved-tick]")).not.toBeNull();
    expect(screen.getByText("Consultants can now prepare selected openings")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await flush();
    expect(puts().map((c) => c.body)).toEqual([{ enabled: true }, { enabled: false }]);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("puts the switch back and says why when the save fails", async () => {
    await mount();
    putStatus = 500;
    putBody = { error: "boom" };
    fireEvent.click(toggle());
    await flush();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Not saved")).toBeTruthy();
  });

  it("shows each limit with Kiwiply's maximum beside it", async () => {
    await mount();
    expect(field("dailyCap").value).toBe("30");
    expect(screen.getAllByText("Per consultant. Up to 30.").length).toBe(1);
    expect(screen.getByText("Per consultant. Up to 300.")).toBeTruthy();
    expect(screen.getByText("Per consultant. Up to 10.")).toBeTruthy();
    expect(field("monthlyCap").max).toBe("300");
  });

  it("saves a lower limit when the field is left, with an Undo back to following the platform", async () => {
    await mount();
    fireEvent.change(field("dailyCap"), { target: { value: "12" } });
    fireEvent.blur(field("dailyCap"));
    await flush();
    expect(puts().map((c) => c.body)).toEqual([{ dailyCap: 12 }]);
    expect(field("dailyCap").value).toBe("12");
    expect(screen.getByText("Your daily limit is now 12")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await flush();
    expect(puts().map((c) => c.body)).toEqual([{ dailyCap: 12 }, { dailyCap: null }]);
    expect(field("dailyCap").value).toBe("30");
  });

  it("shows a number above the maximum at the maximum, and refuses zero or text without calling the API", async () => {
    await mount();
    fireEvent.change(field("maxBatch"), { target: { value: "99" } });
    fireEvent.blur(field("maxBatch"));
    await flush();
    expect(puts().map((c) => c.body)).toEqual([{ maxBatch: 10 }]);
    expect(field("maxBatch").value).toBe("10");
    fireEvent.change(field("monthlyCap"), { target: { value: "0" } });
    fireEvent.blur(field("monthlyCap"));
    await flush();
    expect(puts().length).toBe(1);
    expect(screen.getByText("Use a whole number from 1 to 300.")).toBeTruthy();
  });

  it("does not call the API when a field is left unchanged", async () => {
    await mount();
    fireEvent.blur(field("dailyCap"));
    await flush();
    expect(puts()).toEqual([]);
  });

  it("is shown disabled with the plain message while Kiwiply has the feature off", async () => {
    current = { ...fresh(), platformEnabled: false };
    await mount();
    expect(document.querySelector("[data-prepare-unavailable]")!.textContent).toBe("Not available on your plan yet. Contact support.");
    expect(toggle().hasAttribute("disabled")).toBe(true);
    expect(field("dailyCap").disabled).toBe(true);
    fireEvent.click(toggle());
    await flush();
    expect(puts()).toEqual([]);
  });

  it("says how many consultants have the add-on and links to Consultants and Licenses", async () => {
    await mount();
    expect(document.querySelector("[data-prepare-licensed]")!.textContent).toContain("2 of 5 active consultants have Autopilot prepare on their licence.");
    expect(document.querySelector("[data-prepare-licenses-link]")!.getAttribute("href")).toBe("/w/admin/licenses");
    expect(document.querySelector("[data-prepare-consultants-link]")!.getAttribute("href")).toBe("/w/admin/consultants");
  });

  it("tells the admin when no licence includes it yet", async () => {
    current = { ...fresh(), licensed: { consultants: 0, total: 3, featureName: "Autopilot prepare" } };
    await mount();
    expect(document.querySelector("[data-prepare-licensed]")!.textContent).toContain("No consultant's licence includes Autopilot prepare yet");
  });

  it("draws nothing for someone without the settings permission", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await mount();
    expect(document.querySelector("[data-org-prepare]")).toBeNull();
  });
});
