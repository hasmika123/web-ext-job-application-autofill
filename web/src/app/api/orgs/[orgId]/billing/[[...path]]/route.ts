import { handleBilling } from "@/lib/ent/billing-bff";

/** Every billing page read (overview, account, invoices, one invoice) and opening the billing portal. See `billing-bff.ts`. */
export const GET = handleBilling;
export const POST = handleBilling;
