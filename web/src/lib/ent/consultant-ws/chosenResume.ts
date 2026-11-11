import { approveResume, fetchResumes } from "./resumes";
import type { OppRow } from "./opportunities";

/**
 * The resumes a marketer chose for jobs (docs/enterprise-v2/PINNED-RESUME-BUILD.md), as the Prepare dialog needs them. Nothing a marketer made is used
 * until the consultant approves it: the dialog names each waiting resume, and the consultant's own Prepare click approves exactly the version
 * shown on their My Resumes page (its version number and content hash), through the same call as the Approve button there.
 */

/** The chosen jobs whose resume still waits for the consultant's approval. */
export function waitingChoices(rows: readonly OppRow[]): OppRow[] {
  return rows.filter((r) => r.resume?.state === "NEEDS_APPROVAL");
}

export type ApproveOutcome = { ok: true } | { ok: false; message: string };

/** Approve every waiting resume of {@code rows} (each once), or say which one could not be approved. */
export async function approveWaitingChoices(orgId: number, rows: readonly OppRow[]): Promise<ApproveOutcome> {
  const ids = [...new Set(waitingChoices(rows).map((r) => r.resume!.orgResumeId))];
  if (ids.length === 0) return { ok: true };
  const mine = await fetchResumes(orgId);
  if (mine.kind !== "OK" || !("view" in mine) || !mine.view) return { ok: false, message: "We couldn't load your resumes to approve the one your marketer chose. Nothing has been opened." };
  for (const id of ids) {
    const row = mine.view.resumes.find((r) => r.id === id);
    if (!row) return { ok: false, message: "A resume your marketer chose is no longer in your list. Nothing has been opened." };
    if (!row.awaitingMyApproval) continue; // approved meanwhile (on My Resumes, or another tab)
    const r = await approveResume(orgId, row);
    if (!r.ok) return { ok: false, message: `"${row.title}" couldn't be approved: ${r.message} Nothing has been opened.` };
  }
  return { ok: true };
}
