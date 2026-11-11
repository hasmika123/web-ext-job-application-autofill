import { handleBilling } from "@/lib/ent/billing-bff";

/** Every billing page read: overview, account, invoices, one invoice. See `billing-bff.ts`. */
export const GET = handleBilling;
