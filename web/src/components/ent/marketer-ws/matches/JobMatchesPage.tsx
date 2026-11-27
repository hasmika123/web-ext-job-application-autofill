"use client";

import type { MktPageProps } from "../parts";
import CanonicalMatchesPanel from "./CanonicalMatchesPanel";

/**
 * The Matches tab uses the canonical opportunity-match records as its only active board.
 * The legacy matches API remains available for compatibility, but it is no longer rendered beside this panel.
 */
export default function JobMatchesPage({ orgId }: MktPageProps) {
  return (
    <div data-job-matches data-status="canonical">
      <CanonicalMatchesPanel orgId={orgId} />
    </div>
  );
}
