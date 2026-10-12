/**
 * The sample-data gate (U0.5, APP-E2E-PLAN section 2.3): the one rule for "may this account see a sample row?".
 *
 * A real account NEVER sees one. Sample rows exist only so the board look can still be demoed on pages whose API is
 * not built yet, and only when BOTH hold:
 *
 *   - the account is a demo login (`isDemoLogin`), and
 *   - the build opted in with `NEXT_PUBLIC_BOARD_SAMPLES=1` (`npm run dev:demo` sets it; a production build does not).
 *
 * Pure (no React, no server-only imports) so server pages, client components and tests share it. Components do not
 * call this directly: they read the gate from `useSamples()` (client) or call `samples(name, enabled)` with the flag
 * they computed here (server pages), both in `components/app-v3/samples.tsx`.
 */
import { isDemoLogin } from "./demo";

/** True when this build opted in to the board's sample rows (inlined at build time by Next). */
export function boardSamplesBuilt(): boolean {
  return process.env.NEXT_PUBLIC_BOARD_SAMPLES === "1";
}

/** May `login` see sample rows? Demo logins on an opted-in build only; `built` is injectable for tests. */
export function samplesEnabled(login?: string | null, built: boolean = boardSamplesBuilt()): boolean {
  return built && isDemoLogin(login);
}
