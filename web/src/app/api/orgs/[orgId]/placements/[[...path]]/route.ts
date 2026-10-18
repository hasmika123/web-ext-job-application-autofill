import { handle } from "@/lib/ent/placements-bff";

/** Every Placements call: list, counts, filters, pickers, one placement, add, extend, request / decide an extension, complete, redeploy, note, undo. See `placements-bff.ts`. */
export const GET = handle;
export const POST = handle;
