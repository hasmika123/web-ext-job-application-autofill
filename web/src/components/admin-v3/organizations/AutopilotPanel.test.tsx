import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AutopilotPanel from "./AutopilotPanel";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const item = (key: string, value: unknown, extra: Record<string, unknown> = {}) => ({ key, value, source: "db", ...extra });

let enabled: boolean;
let calls: { url: string; method: string; body?: unknown }[];

beforeEach(() => {
  enabled = false;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "PUT") {
        const b = JSON.parse(String(init!.body));
        if (String(b.reason ?? "").length < 10) return json({ error: "A reason (at least 10 characters) is required for this change.", code: "SETTING_REASON_REQUIRED" }, 400);
        enabled = b.value === true;
        return json(item("enterprise.autopilot.prepare.enabled", enabled, { updatedBy: "admin", lastReason: b.reason }));
      }
      if (url.endsWith(".enabled")) return json(item("enterprise.autopilot.prepare.enabled", enabled));
      if (url.endsWith(".daily_cap")) return json(item("enterprise.autopilot.prepare.daily_cap", 30));
      if (url.endsWith(".monthly_cap")) return json(item("enterprise.autopilot.prepare.monthly_cap", 300));
      if (url.endsWith(".max_batch")) return json(item("enterprise.autopilot.prepare.max_batch", 10));
      return json({ error: "Not found." }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const state = () => document.querySelector("[data-admin-autopilot]")!.getAttribute("data-admin-autopilot");

describe("AutopilotPanel: the platform switch of Prepare selected openings (gap D12)", () => {
  it("shows the switch off and the platform maximums", async () => {
    render(<AutopilotPanel />);
    await waitFor(() => expect(state()).toBe("off"));
    expect(screen.getByText("Off for everyone")).toBeTruthy();
    const limits = document.querySelector("[data-autopilot-limits]")!.textContent!;
    expect(limits).toMatch(/30/);
    expect(limits).toMatch(/300/);
    expect(limits).toMatch(/10/);
    expect(calls.map((c) => c.url)).toEqual([
      "/api/admin/settings/enterprise.autopilot.prepare.enabled",
      "/api/admin/settings/enterprise.autopilot.prepare.daily_cap",
      "/api/admin/settings/enterprise.autopilot.prepare.monthly_cap",
      "/api/admin/settings/enterprise.autopilot.prepare.max_batch",
    ]);
  });

  it("turns it on only with a reason, then shows it on with who changed it", async () => {
    render(<AutopilotPanel />);
    await waitFor(() => expect(state()).toBe("off"));
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    const apply = () => document.querySelector("[data-autopilot-apply]") as HTMLButtonElement;
    expect(apply().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "Pilot organizations are ready" } });
    expect(apply().disabled).toBe(false);
    fireEvent.click(apply());
    await waitFor(() => expect(state()).toBe("on"));
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ value: true, reason: "Pilot organizations are ready" });
    expect(screen.getByText("On for the platform")).toBeTruthy();
    expect(document.body.textContent).toMatch(/Last changed by admin: "Pilot organizations are ready"/);
    expect(document.querySelector("[data-autopilot-confirm]")).toBeNull();
  });

  it("turning it off says it stops for everyone, and Cancel changes nothing", async () => {
    enabled = true;
    render(<AutopilotPanel />);
    await waitFor(() => expect(state()).toBe("on"));
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(screen.getByRole("button", { name: "Turn off for everyone" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.querySelector("[data-autopilot-confirm]")).toBeNull();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    expect(state()).toBe("on");
  });

  it("a load failure offers a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Couldn't reach the server." }, 502)));
    render(<AutopilotPanel />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't load the Autopilot settings/);
  });
});
