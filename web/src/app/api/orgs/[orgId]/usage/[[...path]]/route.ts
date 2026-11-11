import { handleUsage } from "@/lib/ent/billing-bff";

/** Feature Usage reads: one month, and the months before it. See `billing-bff.ts`. */
export const GET = handleUsage;
