"use client";

import type { ReactNode } from "react";
import { MascotPose, MascotProvider } from "@kiwiply/ui";
import type { MascotPoseProps } from "@kiwiply/ui";
import { ENT_MASCOT_BASE } from "./mascot-base";

/**
 * The web side of the ENTERPRISE bee (X2.8). `@kiwiply/ui` owns the pose map and the component; the web decides where the
 * art is served from: `public/ent/bee` (see its README + manifest.json).
 *
 * ENTERPRISE ONLY: import this from the tenant tree (`src/app/(tenant)`, `src/components/ent`, `src/lib/ent`) and nowhere
 * else. The regular Kiwiply product keeps its own mascot (`public/v2/mascot-*.png`, `MascotCheer`), and `mascot-isolation.test.ts`
 * fails the build if `(marketing)`, `(app)`, `(org)` or `(admin)` code reaches for the bee.
 */
export { ENT_MASCOT_BASE };

/** Mount once per tenant layout so every `EmptyState mascotPose` / `ErrorState mascotPose` below finds the art. */
export function EnterpriseMascotProvider({ children }: { children: ReactNode }) {
  return <MascotProvider base={ENT_MASCOT_BASE}>{children}</MascotProvider>;
}

/** `<MascotPose>` pinned to the enterprise art, for use outside an `EmptyState` (a greeting, a celebration). */
export function EnterpriseMascot(props: Omit<MascotPoseProps, "base">) {
  return <MascotPose {...props} base={ENT_MASCOT_BASE} />;
}
