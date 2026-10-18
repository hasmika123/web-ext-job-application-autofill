import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { Plan, PlanComponent, PlanPreview, PlanVersion, CatalogProduct } from "@/lib/admin-plans";
import { DESKTOP, PHONE, stubViewport } from "../common/kit-test-utils";
import { PREVIEW } from "./previewFixture";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }), usePathname: () => "/admin/pricing/plans/PRO/v/3", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

type Call = { method: string; path: string; body?: Record<string, unknown> };
const calls: Call[] = [];
let handler: (c: Call) => unknown;
vi.mock("@/lib/admin-client", async (orig) => {
  const real = await orig<typeof import("@/lib/admin-client")>();
  return {
    ...real,
    adminFetch: vi.fn(async (method: string, path: string, body?: Record<string, unknown>) => {
      const call = { method, path, body };
      calls.push(call);
      const out = handler(call) as { status?: number; data?: unknown; code?: string; error?: string } | undefined;
      if (out && out.status && out.status >= 400) return { ok: false, status: out.status, code: out.code ?? null, error: out.error ?? "refused", extra: {} };
      return { ok: true, data: out?.data ?? out };
    }),
  };
});

import PlanEditor from "./PlanEditor";

const comp = (over: Partial<PlanComponent>): PlanComponent => ({
  featureKey: "resume.library",
  role: "INCLUDED",
  name: "Resume library",
  category: "RESUME",
  unit: "resumes",
  productId: null,
  productCode: null,
  allowance: 25,
  allowanceOverride: null,
  limitKey: "resumes.max",
  limitOverrides: null,
  defaultQuantity: 1,
  maxQuantity: null,
  componentDiscountBp: null,
  sortOrder: 0,
  marketingLabel: null,
  aiBudgetCents: 0,
  prices: [],
  ...over,
});

const VERSION: PlanVersion = {
  planKey: "PRO",
  version: 3,
  status: "DRAFT",
  audience: "INDIVIDUAL",
  intervals: ["MONTH", "QUARTER"],
  annualDiscountBp: null,
  aiBudgetCapCents: 300,
  aiWindows: null,
  baseProduct: {
    id: 12,
    code: "PRO",
    prices: [
      { priceId: 41, interval: "MONTH", currency: "USD", amountMinor: 1999, source: "ACTIVE", derived: false, stripePriceId: null, marginBp: 8060, ok: true },
      { priceId: 42, interval: "QUARTER", currency: "USD", amountMinor: 4999, source: "ACTIVE", derived: false, stripePriceId: null, marginBp: 8100, ok: true },
    ],
  },
  components: [
    comp({}),
    comp({ featureKey: "ai.credits_extra", role: "OPTIONAL", name: "Extra AI credits", productId: 77, productCode: "FEAT_AI_CREDITS", unit: "credits", allowance: 100, maxQuantity: 4, aiBudgetCents: 150, sortOrder: 1, prices: [{ priceId: 90, interval: "MONTH", currency: "USD", amountMinor: 499, source: "ACTIVE", derived: false, stripePriceId: null, marginBp: 8216, ok: true }] }),
  ],
  presets: [],
  seatRules: null,
  snapshotHash: null,
  effectiveFrom: null,
  effectiveUntil: null,
  catalogVersion: null,
  summary: null,
  publishedAt: null,
  publishedBy: null,
  updatedAt: "2026-10-16T10:00:00Z",
};

const PLAN: Plan = {
  planKey: "PRO",
  name: "Pro",
  audience: "INDIVIDUAL",
  status: "PUBLISHED",
  publicPlan: true,
  description: null,
  badge: null,
  sortOrder: 1,
  eligibility: null,
  successorPlanKey: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  updatedBy: "jk",
  versions: [{ ...VERSION, version: 2, status: "PUBLISHED" }, VERSION],
};

const PRODUCTS: CatalogProduct[] = [
  { id: 12, code: "PRO", name: "Pro", kind: "SUBSCRIPTION", soldTo: "INDIVIDUAL", featureKey: null, quantityBasis: null, active: true },
  { id: 77, code: "FEAT_AI_CREDITS", name: "Extra AI credits", kind: "FEATURE", soldTo: "INDIVIDUAL", featureKey: "ai.credits_extra", quantityBasis: null, active: true },
  { id: 78, code: "FEAT_AUTOPILOT", name: "Autopilot prepare", kind: "FEATURE", soldTo: "INDIVIDUAL", featureKey: "autopilot.prepare", quantityBasis: null, active: true },
];

const SERVICES = [
  { key: "autopilot.prepare", name: "Autopilot prepare", description: null, audience: "INDIVIDUAL", category: "AUTOMATION", usageUnit: "applications", defaultAllowance: 300, allowancePeriod: "MONTH", aiBudgetCents: 100, maxQuantity: null, limitKey: null, active: true },
  { key: "jobs.matching", name: "AI Job Matching", description: null, audience: "INDIVIDUAL", category: "MATCHING", usageUnit: "matches", defaultAllowance: 20, allowancePeriod: "DAY", aiBudgetCents: 50, maxQuantity: null, limitKey: null, active: true },
];

function defaultHandler(c: Call): unknown {
  if (c.method === "GET" && c.path.includes("/preview")) return PREVIEW as PlanPreview;
  if (c.method === "PUT" && c.path.endsWith("/components")) return { ...VERSION, updatedAt: "2026-10-16T10:01:00Z", components: (c.body?.components as Record<string, unknown>[]).map((r) => comp({ ...(r as Partial<PlanComponent>), name: SERVICES.find((s) => s.key === r.featureKey)?.name ?? (r.featureKey === "ai.credits_extra" ? "Extra AI credits" : "Resume library") })) };
  if (c.method === "PATCH") return { ...VERSION, ...c.body, updatedAt: "2026-10-16T10:02:00Z" };
  if (c.method === "GET" && c.path === "/plans/PRO/versions/3") return VERSION;
  if (c.method === "POST" && c.path === "/catalog/prices") return { id: 1 };
  if (c.path.startsWith("/catalog/services?")) return SERVICES;
  if (c.path === "/catalog/services/autopilot.prepare/dependencies") return [{ requiresFeatureKey: "jobs.matching", kind: "TECHNICAL", note: null, active: true }];
  if (c.path.startsWith("/catalog/services/")) return [];
  if (c.path.startsWith("/catalog/margin")) {
    const amount = Number(new URLSearchParams(c.path.split("?")[1]).get("amountMinor"));
    return amount >= 549
      ? { worst: { marginBp: 8010, costMinor: 1, feeMinor: 1, aiMinor: 1 }, floorBp: 8000, ok: true, headroomBp: 10, levers: null, code: null, overridable: false }
      : { worst: { marginBp: 7600, costMinor: 1, feeMinor: 1, aiMinor: 1 }, floorBp: 8000, ok: false, headroomBp: -400, levers: { minPriceMinor: 549, maxAiBudgetCents: null, maxDiscountBp: null }, code: "MARGIN_BELOW_FLOOR", overridable: true };
  }
  return {};
}

function mount(version: PlanVersion = VERSION) {
  return render(
    <ToastProvider>
      <PlanEditor plan={PLAN} version={version} products={PRODUCTS} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  push.mockReset();
  replace.mockReset();
  handler = defaultHandler;
  stubViewport(DESKTOP);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlanEditor: prices and margin ticks", () => {
  it("typing a price below the floor shows a red tick with the lever from the guard; the lever amount turns it green", async () => {
    mount();
    const box = screen.getByRole("textbox", { name: "Extra AI credits monthly price" });
    fireEvent.change(box, { target: { value: "3.99" } });
    const tickOf = () => document.getElementById(box.getAttribute("aria-describedby") as string) as HTMLElement;
    await waitFor(() => expect(tickOf().textContent).toContain("76.0 %"));
    const tick = tickOf();
    expect(tick.textContent).toContain("76.0 %");
    expect(tick.textContent).toContain("$5.49");
    expect(tick.className).toContain("danger");
    fireEvent.change(box, { target: { value: "5.49" } });
    await waitFor(() => expect((document.getElementById(box.getAttribute("aria-describedby") as string) as HTMLElement).textContent).toContain("80.1 %"));
    expect((document.getElementById(box.getAttribute("aria-describedby") as string) as HTMLElement).className).toContain("accent");
    expect(calls.some((c) => c.path.startsWith("/catalog/margin") && c.path.includes("kind=OPTIONAL") && c.path.includes("amountMinor=549"))).toBe(true);
  });

  it("leaving the box writes a DRAFT price row for the product and re-reads the version (no Stripe call)", async () => {
    mount();
    const box = screen.getByRole("textbox", { name: "Extra AI credits monthly price" });
    fireEvent.change(box, { target: { value: "5.49" } });
    fireEvent.blur(box);
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/catalog/prices")).toBe(true));
    const post = calls.find((c) => c.path === "/catalog/prices")!;
    expect(post.body).toMatchObject({ productId: 77, interval: "MONTH", amountMinor: 549, currency: "USD", audience: "INDIVIDUAL" });
    expect(calls.some((c) => c.method === "GET" && c.path === "/plans/PRO/versions/3")).toBe(true);
    expect(calls.every((c) => !/stripe/i.test(c.path))).toBe(true);
  });

  it("refuses text that is not an amount without calling the API", async () => {
    mount();
    const box = screen.getByRole("textbox", { name: "Extra AI credits monthly price" });
    fireEvent.change(box, { target: { value: "abc" } });
    fireEvent.blur(box);
    expect((await screen.findAllByRole("alert")).some((a) => /Type an amount/.test(a.textContent ?? ""))).toBe(true);
    expect(calls.some((c) => c.path === "/catalog/prices")).toBe(false);
  });
});

describe("PlanEditor: autosave", () => {
  it("an allowance change autosaves the whole component list with expectedUpdatedAt", async () => {
    mount();
    const box = screen.getByRole("textbox", { name: "Resume library allowance" });
    fireEvent.change(box, { target: { value: "30" } });
    fireEvent.blur(box);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.path).toBe("/plans/PRO/versions/3/components");
    expect(put.body?.expectedUpdatedAt).toBe("2026-10-16T10:00:00Z");
    const rows = put.body?.components as { featureKey: string; allowanceOverride: number | null }[];
    expect(rows.find((r) => r.featureKey === "resume.library")?.allowanceOverride).toBe(30);
    expect(rows.find((r) => r.featureKey === "ai.credits_extra")?.allowanceOverride).toBeNull();
    await waitFor(() => expect(screen.getByText(/Saved/)).toBeTruthy());
  });

  it("the AI budget cap and the intervals autosave through PATCH", async () => {
    mount();
    const cap = screen.getByRole("textbox", { name: "AI budget cap per month" });
    fireEvent.change(cap, { target: { value: "4.00" } });
    fireEvent.blur(cap);
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.body?.aiBudgetCapCents === 400)).toBe(true));
    fireEvent.click(screen.getByRole("checkbox", { name: /Annual/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && Array.isArray(c.body?.intervals) && (c.body?.intervals as string[]).includes("YEAR"))).toBe(true));
  });

  it("a stale draft (409 VERSION_CONFLICT) asks for a reload instead of overwriting", async () => {
    handler = (c) => (c.method === "PUT" ? { status: 409, code: "VERSION_CONFLICT", error: "Version 3 of PRO changed since you opened it." } : defaultHandler(c));
    mount();
    const box = screen.getByRole("textbox", { name: "Resume library allowance" });
    fireEvent.change(box, { target: { value: "30" } });
    fireEvent.blur(box);
    expect(await screen.findByText(/Somebody else changed this draft/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("a refused write shows the API's message", async () => {
    handler = (c) => (c.method === "PUT" ? { status: 422, code: "ALLOWANCE_REQUIRED", error: "Resume library needs an allowance." } : defaultHandler(c));
    mount();
    const box = screen.getByRole("textbox", { name: "Resume library allowance" });
    fireEvent.change(box, { target: { value: "30" } });
    fireEvent.blur(box);
    expect((await screen.findAllByText("Resume library needs an allowance.")).length).toBeGreaterThan(0);
  });
});

describe("PlanEditor: adding services", () => {
  it("adding Autopilot prepare pre-adds AI Job Matching visibly and saves both", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Add service/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Autopilot prepare" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const keys = (calls.find((c) => c.method === "PUT")!.body?.components as { featureKey: string; role: string }[]).map((r) => `${r.featureKey}:${r.role}`);
    expect(keys).toContain("autopilot.prepare:OPTIONAL");
    expect(keys).toContain("jobs.matching:INCLUDED");
    expect((await screen.findAllByText(/Autopilot prepare needs AI Job Matching - added/)).length).toBeGreaterThan(0);
  });
});

describe("PlanEditor: a published version", () => {
  it("opens read-only with a New version button", () => {
    mount({ ...VERSION, version: 2, status: "PUBLISHED" });
    expect(screen.getByText(/v2 is published and read-only/)).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Resume library allowance" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "New version" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Discard draft" })).toBeNull();
  });
});

describe("PlanEditor on a phone", () => {
  it("walks the five steps, keeps the worst case in the bottom bar and opens the preview in a sheet", async () => {
    stubViewport(PHONE);
    mount();
    expect(screen.getByRole("navigation", { name: "Plan editor steps" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Plan name" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Resume library allowance" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("textbox", { name: "AI budget cap per month" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("textbox", { name: "Resume library allowance" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Worst case 79\.6 % ✗/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const sheet = await screen.findByRole("dialog", { name: "Preview" });
    expect(within(sheet).getByText("Run all checks")).toBeTruthy();
  });
});
