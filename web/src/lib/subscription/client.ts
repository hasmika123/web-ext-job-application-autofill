/**
 * Browser-side calls to the billing BFF routes (`/api/billing/**`, `/api/catalog/public`, `/api/entitlements/me`). Each returns a result object instead of
 * throwing, because the interesting cases are the API's error codes (QUOTE_STALE, ALREADY_SUBSCRIBED, ...) and the UI branches on them.
 */
import type {
  ApiProblem,
  ChangeBatch,
  ChangeDTO,
  EntitlementSet,
  Invoice,
  PlanQuote,
  PlanV3,
  PublicCatalog,
  QuoteRequestBody,
} from "./types";

export type CallResult<T> = { ok: true; data: T } | { ok: false; status: number; problem: ApiProblem };

async function call<T>(path: string, init?: RequestInit): Promise<CallResult<T>> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    const body = (await res.json().catch(() => ({}))) as unknown;
    if (res.ok) return { ok: true, data: body as T };
    const problem = (body && typeof body === "object" ? body : {}) as ApiProblem;
    return { ok: false, status: res.status, problem };
  } catch {
    return { ok: false, status: 0, problem: { code: "NETWORK" } };
  }
}

const JSON_HEADERS = { "content-type": "application/json" };

export function createQuote(body: QuoteRequestBody): Promise<CallResult<PlanQuote>> {
  return call<PlanQuote>("/api/billing/quotes", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export function startQuoteCheckout(quoteId: number, returnTo?: string): Promise<CallResult<{ url: string }>> {
  return call<{ url: string }>(`/api/billing/quotes/${quoteId}/checkout`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(returnTo ? { returnTo } : {}) });
}

/** A fresh UUID for an Idempotency-Key header. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

export function confirmQuote(quoteId: number, key: string, confirmedCommercialDeps: string[] = []): Promise<CallResult<ChangeBatch>> {
  return call<ChangeBatch>(`/api/billing/quotes/${quoteId}/confirm`, {
    method: "POST",
    headers: { ...JSON_HEADERS, "idempotency-key": key },
    body: JSON.stringify({ confirmedCommercialDeps }),
  });
}

export function undoChange(changeId: number): Promise<CallResult<ChangeDTO>> {
  return call<ChangeDTO>(`/api/billing/changes/${changeId}`, { method: "DELETE" });
}

export function getMyPlan(): Promise<CallResult<PlanV3>> {
  return call<PlanV3>("/api/billing/me");
}

export function getEntitlements(): Promise<CallResult<EntitlementSet>> {
  return call<EntitlementSet>("/api/entitlements/me");
}

export function getInvoices(): Promise<CallResult<Invoice[]>> {
  return call<Invoice[]>("/api/billing/invoices");
}

export function getPublicCatalog(): Promise<CallResult<PublicCatalog>> {
  return call<PublicCatalog>("/api/catalog/public");
}
