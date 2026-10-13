/**
 * Kept so the AI routes' imports do not change: the helpers moved to `@/lib/admin-proxy` (E2E-A15.0), where every
 * admin BFF route now gets them. New routes import from there.
 */
export { passthrough, forward, readObject, badBody, onlyFields } from "@/lib/admin-proxy";
