import { handle } from "@/lib/ent/domains-bff";

/** Every Domains page call: the list, adding a domain, its DNS records, verify / activate / suspend / resume / remove. See `domains-bff.ts`. */
export const GET = handle;
export const POST = handle;
