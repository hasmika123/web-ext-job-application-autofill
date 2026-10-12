import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@kiwiply/ui";
import type { OrgBilling } from "@/lib/org-types";

/**
 * O2.1: the three-screen create flow. Screen rules (slug derive/edit, the 16+ attestation for a school or bootcamp only),
 * what the API's refusals do, and the end: dev activation or skip, both landing in /org.
 */

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

import CreateOrgFlow from "./CreateOrgFlow";
import { DRAFT_KEY } from "./create-logic";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let respond: (c: Call) => Response;

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const created = (id = 41) => ok({ org: { id, slug: "acme-bootcamp", name: "Acme Bootcamp", type: "BOOTCAMP", status: "DRAFT" }, me: { memberId: 1, role: "OWNER", permissions: [] }, memberCount: 1, status: "DRAFT" }, 201);
const billing = (over: Partial<OrgBilling> = {}) => ok({ status: "DRAFT", billingEnabled: false, devActivation: true, subscription: null, items: [], invoices: [], ...over });

beforeEach(() => {
  calls = [];
  window.sessionStorage.clear();
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("navigator", { ...window.navigator, language: "en-US" });
  respond = (c) => {
    if (c.url === "/api/orgs" && c.method === "POST") return created();
    if (c.url === "/api/orgs/current") return ok({ ok: true });
    if (c.url.endsWith("/billing")) return billing();
    if (c.url.endsWith("/activate")) return ok({});
    return ok({}, 404);
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      return respond(call);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
  refresh.mockReset();
});

const mount = () =>
  render(
    <ToastProvider>
      <CreateOrgFlow />
    </ToastProvider>,
  );

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
const pick = (name: string | RegExp) => fireEvent.click(screen.getByRole("radio", { name }));

async function throughScreen1(name = "Acme Bootcamp", kind = "Bootcamp") {
  type("Organization name", name);
  pick(kind);
  next();
  await screen.findByRole("heading", { name: "About your people" });
}

describe("screen 1", () => {
  it("derives the address from the name, shows it, and lets the person edit it inline", async () => {
    mount();
    await screen.findByRole("heading", { name: "What's your organization?" });
    type("Organization name", "Acme Bootcamp");
    expect(screen.getByText("acme-bootcamp")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    type("Join link address", "My Own Place");
    expect((screen.getByLabelText("Join link address") as HTMLInputElement).value).toBe("my-own-place");
    type("Organization name", "Acme Academy"); // an edited address stops following the name
    expect((screen.getByLabelText("Join link address") as HTMLInputElement).value).toBe("my-own-place");
  });

  it("does not scold before the first try, then names what is missing, and Continue only moves on when it is valid", async () => {
    mount();
    await screen.findByRole("heading", { name: "What's your organization?" });
    expect(screen.queryByText("Add your organization's name.")).toBeNull();
    next();
    expect(screen.getByText("Add your organization's name.")).toBeTruthy();
    expect(screen.getByText("Pick the closest match.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "About your people" })).toBeNull();
    expect(calls).toHaveLength(0); // nothing is written yet
  });

  it("offers the five types as chips", async () => {
    mount();
    await screen.findByRole("heading", { name: "What's your organization?" });
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Bootcamp", "University", "Company", "Outplacement", "Staffing / consultancy"]);
  });
});

describe("screen 2", () => {
  it("a bootcamp must confirm everyone is 16 or older before anything is created", async () => {
    mount();
    await throughScreen1("Acme Bootcamp", "Bootcamp");
    pick("51–200");
    next();
    expect(screen.getByText("Please confirm this to continue.")).toBeTruthy();
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("Everyone we invite is 16 or older."));
    next();
    await screen.findByRole("heading", { name: "Acme Bootcamp is ready" });
    expect(calls[0]).toMatchObject({ url: "/api/orgs", method: "POST", body: { name: "Acme Bootcamp", type: "BOOTCAMP", slug: "acme-bootcamp", sizeBand: "51_200", country: "US" } });
  });

  it("a company is not asked for the attestation", async () => {
    mount();
    await throughScreen1("Globex", "Company");
    expect(screen.queryByLabelText("Everyone we invite is 16 or older.")).toBeNull();
    pick("1–50");
    next();
    await screen.findByRole("heading", { name: "Acme Bootcamp is ready" });
  });

  it("Back returns to screen 1 with the answers kept", async () => {
    mount();
    await throughScreen1();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect((await screen.findByLabelText("Organization name") as HTMLInputElement).value).toBe("Acme Bootcamp");
  });
});

describe("the create call's refusals", () => {
  async function toCreate(kind = "Company") {
    mount();
    await throughScreen1("Acme Co", kind);
    pick("1–50");
    if (kind === "Bootcamp") fireEvent.click(screen.getByLabelText("Everyone we invite is 16 or older."));
    next();
  }

  it("a taken address sends the person back to screen 1 with the suggestion, one tap to use it", async () => {
    respond = () => ok({ code: "SLUG_TAKEN", suggestion: "acme-co-2" }, 409);
    await toCreate();
    expect(await screen.findByText("That address is taken.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use acme-co-2" }));
    expect(screen.getByText("acme-co-2")).toBeTruthy();
  });

  it("the creation cap stays on screen 2 and says why", async () => {
    respond = () => ok({ code: "ORG_LIMIT_REACHED", max: 3 }, 422);
    await toCreate();
    expect(await screen.findByText(/reached the limit of 3 workspaces/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "About your people" })).toBeTruthy();
  });

  it("a demo account gets the demo line", async () => {
    respond = () => ok({ code: "DEMO_READ_ONLY" }, 403);
    await toCreate();
    expect(await screen.findByText("This is a demo account - changes aren't saved.")).toBeTruthy();
  });
});

describe("screen 3", () => {
  async function toScreen3() {
    mount();
    await throughScreen1("Acme Co", "Company");
    pick("1–50");
    next();
    await screen.findByRole("heading", { name: "Acme Bootcamp is ready" });
  }

  it("where the dev path is open: 'Activate workspace (dev)' calls the API and lands in /org; the org is remembered first", async () => {
    await toScreen3();
    expect(calls.map((c) => c.url)).toEqual(["/api/orgs", "/api/orgs/current", "/api/orgs/41/billing"]);
    expect(calls[1]!.body).toEqual({ orgId: 41 });
    fireEvent.click(screen.getByRole("button", { name: "Activate workspace (dev)" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/org"));
    expect(calls.at(-1)).toMatchObject({ url: "/api/orgs/41/activate", method: "POST" });
  });

  it("'Skip for now' lands in the draft console without activating", async () => {
    await toScreen3();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now, explore my workspace" }));
    expect(push).toHaveBeenCalledWith("/org");
    expect(calls.some((c) => c.url.endsWith("/activate"))).toBe(false);
  });

  it("with Stripe connected there is no dev button: a not-yet 'Pay with card' and Skip", async () => {
    respond = (c) => (c.url.endsWith("/billing") ? billing({ billingEnabled: true, devActivation: false }) : c.url === "/api/orgs" ? created() : ok({}));
    await toScreen3();
    expect(screen.queryByRole("button", { name: /Activate workspace/ })).toBeNull();
    expect((screen.getByRole("button", { name: "Pay with card" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Skip for now, explore my workspace" })).toBeTruthy();
  });

  it("writes no price on the screen", async () => {
    await toScreen3();
    expect(document.body.textContent).not.toMatch(/\$\d/);
  });
});

describe("a reload keeps what was typed", () => {
  it("restores screen and answers from the session, and clears them once the org exists", async () => {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 2, draft: { name: "Acme Co", type: "COMPANY", slug: "acme-co", slugEdited: false, sizeBand: "1_50", country: "US", attest16: false } }));
    mount();
    await screen.findByRole("heading", { name: "About your people" });
    next();
    await screen.findByRole("heading", { name: "Acme Bootcamp is ready" });
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
