// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import LicensesPage from "./LicensesPage";

const catalog = {
  currency: "USD",
  basePriceMinor: null,
  billingConnected: false,
  addOns: [
    { key: "ai.resume_tailoring", name: "AI resume tailoring", description: "Tailor a resume to a posting.", priceMinor: null, usesAi: true },
    { key: "inbox.monitoring", name: "Inbox monitoring", description: "Track applications from Gmail.", priceMinor: null, usesAi: true },
  ],
};
const anika = { consultantId: 21, name: "Anika Rao", email: "anika@aaruna.test", signInLinked: true, status: "NONE", features: [], monthlyMinor: null, priceSet: false, since: null, endsAt: null, suspendReason: null };
const vikram = { ...anika, consultantId: 22, name: "Vikram Iyer", email: "vikram@aaruna.test", status: "ACTIVE", features: ["inbox.monitoring"] };

let calls: { url: string; method: string; body: unknown }[];
let rows: unknown[];
beforeEach(() => {
  calls = [];
  rows = [anika, vikram];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let json: unknown = {};
      if (url.endsWith("/licenses/catalog")) json = catalog;
      else if (url.endsWith("/licenses")) json = rows;
      else if (method === "GET") json = { row: url.endsWith("/21") ? anika : vikram, history: [] };
      else if (method === "POST" && url.endsWith("/licenses/21")) json = { row: { ...anika, status: "ACTIVE", features: ["ai.resume_tailoring"] }, history: [{ kind: "CREATE", featureKey: null, summary: "gave a licence", at: "2026-11-10T12:00:00Z", actorMemberId: 5 }] };
      else json = { row: vikram, history: [] };
      return { ok: true, status: 200, json: async () => json } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => {});
const mount = (canManage = true) =>
  render(
    <ToastProvider>
      <LicensesPage orgId={2} canManage={canManage} />
    </ToastProvider>,
  );

describe("Consultant Licenses (L4)", () => {
  it("lists every consultant with their licence, add-ons and the honest price line", async () => {
    mount();
    await settle();
    const table = screen.getByRole("table", { name: "Consultant licences" });
    expect(within(table).getByText("Anika Rao")).toBeTruthy();
    expect(within(table).getByText("No licence")).toBeTruthy();
    expect(within(table).getByText("Inbox monitoring")).toBeTruthy();
    expect(within(table).getAllByText("Price not set").length).toBe(1); // only the licensed row has a price cell
    expect(screen.getByText(/Nothing is billed yet/)).toBeTruthy();
  });

  it("gives a licence with the chosen add-ons from the sheet", async () => {
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Give licence" }));
    await settle();
    const sheet = document.querySelector("[data-license-sheet='21']") as HTMLElement;
    expect(sheet).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("switch", { name: "AI resume tailoring" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Give licence" }));
    await settle();
    const give = calls.find((c) => c.method === "POST" && c.url === "/api/orgs/2/licenses/21");
    expect(give?.body).toEqual({ features: ["ai.resume_tailoring"] });
    expect(within(screen.getByRole("table", { name: "Consultant licences" })).getByText("AI resume tailoring")).toBeTruthy();
  });

  it("filters to the consultants without a licence", async () => {
    mount();
    await settle();
    fireEvent.change(screen.getByLabelText("Search consultants"), { target: { value: "vikram" } });
    expect(screen.queryByText("Anika Rao")).toBeNull();
    expect(screen.getByText("Vikram Iyer")).toBeTruthy();
  });

  it("a member who may only view sees no way to give a licence", async () => {
    mount(false);
    await settle();
    expect(screen.queryByRole("button", { name: "Give licence" })).toBeNull();
    expect(screen.getByRole("button", { name: "View" })).toBeTruthy();
  });
});
