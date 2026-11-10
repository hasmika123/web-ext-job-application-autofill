"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { samplesEnabled } from "@/lib/samples";
import { samples, type SampleName, type SampleOf } from "./samples";

/**
 * Hands the sample gate (`@/lib/samples`) to every client component of the signed-in app. The `(app)` layout wraps
 * its children once with the account's login; a component that still has sample rows calls
 *
 *   const sample = useSamples();
 *   const rows = sample("ALERTS");     // [] for a real account
 *
 * Outside a provider (a unit test, an unrelated surface) the gate is closed: no sample.
 */
const Ctx = createContext<boolean>(false);

export function SamplesProvider({ login, children }: { login?: string | null; children: ReactNode }) {
  const enabled = useMemo(() => samplesEnabled(login), [login]);
  return <Ctx.Provider value={enabled}>{children}</Ctx.Provider>;
}

/** Is the gate open for this account? Prefer `useSamples()`; this is for the few places that branch on it. */
export function useSamplesEnabled(): boolean {
  return useContext(Ctx);
}

export function useSamples(): <K extends SampleName>(name: K) => SampleOf<K> {
  const enabled = useContext(Ctx);
  return useCallback(<K extends SampleName>(name: K) => samples(name, enabled), [enabled]);
}
