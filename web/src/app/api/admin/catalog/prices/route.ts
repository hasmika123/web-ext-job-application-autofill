import { forwardObject } from "@/lib/admin-plans-bff";

/** POST - a new DRAFT price row (nothing is live until the plan version is published). */
export async function POST(request: Request) {
  return forwardObject(request, "/api/admin/catalog/prices", "POST", [
    "productId",
    "audience",
    "interval",
    "amountMinor",
    "currency",
    "payoutMinor",
    "subscriberDiscountBp",
    "acceptsPromos",
    "countrySet",
    "annualSource",
    "derivedFromPriceId",
    "derivedDiscountBp",
    "effectiveFrom",
    "reason",
  ]);
}
