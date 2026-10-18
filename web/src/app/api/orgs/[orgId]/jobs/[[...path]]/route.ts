import { handle } from "@/lib/ent/jobs-bff";

/** Every Jobs call: list, summary, one job, create, edit, bulk status, assign / dismiss a match. See `jobs-bff.ts`. */
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
