import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { CatalogProduct, Plan, PlanComponent, PlanPreview, PlanVersion } from "@/lib/admin-plans";
import { DESKTOP, stubViewport } from "../common/kit-test-utils";
import { PREVIEW } from "./previewFixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/x", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

type Call = { method: string; path: string; body?: Record<string, unknown> };
const calls: Call[] = [];
let respond: (c: Call) => unknown;
vi.mock("@/lib/admin-client", async (orig) => {
  const real = await orig<typeof import("@/lib/admin-client")>();
  return {
    ...real,
    adminFetch: vi.fn(async (method: string, path: string, body?: Record<string, unknown>) => {
      const call = { method, path, body };
      calls.push(call);
      return { ok: true, data: respond(call) };
    }),
  };
});

import PlanEditor from "./PlanEditor";

const comp = (over: Partial<PlanComponent>): PlanComponent => ({
  featureKey: "org.seat_base",
  role: "SEAT_BASE",
  name: "Consultant seat",
  category: "BASE",
  unit: "seats",
  productId: 22,
  productCode: "ORG_BASE_LICENSE",
  allowance: 1,
  allowanceOverride: null,
  limitKey: null,
  limitOverrides: null,
  defaultQuantity: 1,
  maxQuantity: null,
  componentDiscountBp: null,
  sortOrder: 0,
  marketingLabel: null,
  aiBudgetCents: 0,
  prices: [{ priceId: 120, interval: "MONTH", currency: "USD", amountMinor: 1499, source: "ACTIVE", derived: false, stripePriceId: null, marginBp: 9470, ok: true }],
  ...over,
});

const ORG_VERSION: PlanVersion = {
  planKey: "ORG_STANDARD",
  version: 2,
  status: "DRAFT",
  audience: "ORG",
  intervals: ["MONTH"],
  annualDiscountBp: null,
  aiBudgetCapCents: 0,
  aiWindows: null,
  baseProduct: null,
  components: [
    comp({}),
    comp({ featureKey: "org.resume_ai", role: "SEAT_OPTIONAL", name: "Resume and AI", productId: 23, productCode: "ORG_FEAT_RESUME_AI", sortOrder: 1, prices: [{ priceId: 121, interval: "MONTH", currency: "USD", amountMinor: 1397, source: "ACTIVE", derived: false, stripePriceId: null, marginBp: 8500, ok: true }] }),
    comp({ featureKey: "org.setup_fee", role: "FEE", name: "Organization setup fee", productId: 20, productCode: "ORG_SETUP_FEE", sortOrder: 2, prices: [{ priceId: 122, interval: "ONE_TIME", currency: "USD", amountMinor: 49900, source: "ACTIVE", derived: false, stripePriceId: null, marginBp: null, ok: null }] }),
  ],
  presets: [{ key: "RESUME_AI_SUPPORT", name: "Resume and AI", addons: [{ featureKey: "org.resume_ai", quantity: 1 }] }],
  seatRules: { seatBaseProductId: 22, minSeats: 1, maxSeatsSetting: "enterprise.license.max_seats", setupFeeProductId: 20, platformFeeProductId: null },
  snapshotHash: null,
  effectiveFrom: null,
  effectiveUntil: null,
  catalogVersion: null,
  summary: null,
  publishedAt: null,
  publishedBy: null,
  updatedAt: "2026-10-16T10:00:00Z",
};
const PLAN = { planKey: "ORG_STANDARD", name: "Org Standard", audience: "ORG", status: "PUBLISHED", publicPlan: true, description: null, badge: null, sortOrder: 5, eligibility: null, successorPlanKey: null, createdAt: "", updatedAt: "2026-10-01T00:00:00Z", updatedBy: "jk", versions: [ORG_VERSION] } as Plan;
const PRODUCTS: CatalogProduct[] = [
  { id: 20, code: "ORG_SETUP_FEE", name: "Organization setup fee", kind: "FEE", soldTo: "ORG", featureKey: null, quantityBasis: null, active: true },
  { id: 21, code: "ORG_PLATFORM_FEE", name: "Organization platform fee", kind: "FEE", soldTo: "ORG", featureKey: null, quantityBasis: null, active: true },
  { id: 22, code: "ORG_BASE_LICENSE", name: "Consultant base license", kind: "BASE_LICENSE", soldTo: "ORG", featureKey: null, quantityBasis: "SEAT", active: true },
  { id: 23, code: "ORG_FEAT_RESUME_AI", name: "Resume and AI", kind: "FEATURE", soldTo: "ORG", featureKey: "org.resume_ai", quantityBasis: "SEAT", active: true },
];
const ORG_PREVIEW: PlanPreview = {
  ...PREVIEW,
  planKey: "ORG_STANDARD",
  version: 2,
  audience: "ORG",
  baseMinor: 1499,
  optional: [],
  worstCase: null,
  checks: [
    { id: "deps", ok: true, failing: null },
    { id: "prices", ok: true, failing: null },
    { id: "margin", ok: true, failing: null },
    { id: "presets", ok: false, failing: [{ featureKey: "CHEAP", requires: 1999 }] },
  ],
  seats: {
    seatBaseMinor: 1499,
    presets: [
      { key: "RESUME_AI_SUPPORT", seatTotalMinor: 2896, aboveIndividualOk: true, mirrored: true, individualMonthMinor: 1999, features: [] },
      { key: "CHEAP", seatTotalMinor: 1600, aboveIndividualOk: false, mirrored: false, individualMonthMinor: 1999, features: [] },
    ],
    roster: { lines: [{ token: "BASE", count: 5, seatTotalMinor: 1499, lineTotalMinor: 7495, features: [] }, { token: "RESUME_AI_SUPPORT", count: 1, seatTotalMinor: 2896, lineTotalMinor: 2896, features: [] }], orgRecurringMinor: 7992, setupFeeMinor: 49900 },
  },
  impact: { ...PREVIEW.impact!, subscribersByVersion: { "1": 14 } },
};

const mount = (version: PlanVersion = ORG_VERSION) =>
  render(
    <ToastProvider>
      <PlanEditor plan={PLAN} version={version} products={PRODUCTS} />
    </ToastProvider>,
  );

beforeEach(() => {
  calls.length = 0;
  respond = (c) => {
    if (c.path.includes("/preview")) return ORG_PREVIEW;
    if (c.method === "PATCH") return { ...ORG_VERSION, ...c.body, updatedAt: "2026-10-16T10:05:00Z" };
    return {};
  };
  stubViewport(DESKTOP);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("organization plan editor", () => {
  it("shows the seat rules, the seat base and fee rows with the roles of an organization (no Quarterly)", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Seat rules and fees" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Minimum seats" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Seat base product" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Setup fee product" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Quarterly/ })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Consultant seat monthly price" })).toBeTruthy();
    const setup = screen.getByRole("textbox", { name: "Organization setup fee one time price" }) as HTMLInputElement;
    expect(setup.value).toBe("499.00");
    expect(screen.queryByRole("textbox", { name: "Plan base product" })).toBeNull();
  });

  it("autosaves seat rules through PATCH seatRules, keeping the rest of the rules", async () => {
    mount();
    const min = screen.getByRole("textbox", { name: "Minimum seats" });
    fireEvent.change(min, { target: { value: "3" } });
    fireEvent.blur(min);
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")!.body?.seatRules).toMatchObject({ minSeats: 3, setupFeeProductId: 20, seatBaseProductId: 22, maxSeatsSetting: "enterprise.license.max_seats" });
  });

  it("warns, without blocking, when no setup fee is chosen", () => {
    mount({ ...ORG_VERSION, seatRules: { ...ORG_VERSION.seatRules!, setupFeeProductId: null } });
    expect(screen.getByText(/No setup fee is chosen/)).toBeTruthy();
  });

  it("previews the roster total, the setup fee and a preset below individual with the required sum", async () => {
    mount();
    expect(await screen.findByText("$79.92")).toBeTruthy();
    expect(screen.getAllByText("$499.00").length).toBeGreaterThan(0);
    const bad = document.querySelector('[data-preset="CHEAP"]') as HTMLElement;
    expect(bad.getAttribute("data-ok")).toBe("false");
    expect(within(bad).getByText(/must reach/)).toBeTruthy();
    expect(within(bad).getByText("$19.99")).toBeTruthy();
    const presetsRow = document.querySelector('[data-check="presets"]') as HTMLElement;
    expect(presetsRow.getAttribute("data-ok")).toBe("false");
  });

  it("asks the server for a typed roster", async () => {
    mount();
    const roster = await screen.findByLabelText("Sample roster");
    fireEvent.change(roster, { target: { value: "[2]BASE,[1]RESUME_AI_SUPPORT" } });
    await waitFor(() => expect(calls.some((c) => c.path.includes("/preview") && c.path.includes("roster=%5B2%5DBASE%2C%5B1%5DRESUME_AI_SUPPORT"))).toBe(true));
  });
});
