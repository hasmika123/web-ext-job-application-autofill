"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@kiwiply/ui";
import { acceptJoin, joinPath, type JoinLink, type JoinPreview, type JoinResult } from "@/lib/org-join";
import ConsentScreen from "./ConsentScreen";
import JoinDone from "./JoinDone";
import JoinProblem, { type ProblemKind } from "./JoinProblem";

type Phase = { kind: "consent" } | { kind: "done"; result: JoinResult; already: boolean } | { kind: "problem"; problem: ProblemKind; orgName: string | null };

/**
 * A signed-in person on a join link: consent, then done (O2.3). The accept call is the consent step, so there is exactly one
 * button that does anything. Every refusal the server can give has words: a link that ran out and a seat that already
 * exists are screens of their own; a workspace that is not open yet, an expired session and a network failure stay on the
 * consent screen with the reason, so the choice they made is not lost.
 */
export default function JoinFlow({ link, preview }: { link: JoinLink; preview: JoinPreview }) {
  const [phase, setPhase] = useState<Phase>({ kind: "consent" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);

  async function join(scope: "SUMMARY" | "NONE", version: string) {
    setBusy(true);
    setError(null);
    const r = await acceptJoin(link, scope, version);
    setBusy(false);
    if (r.kind === "ok") return setPhase({ kind: "done", result: r.data, already: false });
    if (r.status === 401) {
      setSignIn(true);
      return setError("Your session expired. Sign in again and you'll come straight back here.");
    }
    if (r.code === "ALREADY_MEMBER") {
      return setPhase({ kind: "done", already: true, result: { orgId: 0, orgSlug: preview.orgSlug, orgName: preview.orgName, memberId: 0, role: preview.role, shareScope: scope, pays: preview.pays } });
    }
    if (r.code === "INVITE_EXPIRED") return setPhase({ kind: "problem", problem: r.reason === "full" ? "full" : "expired", orgName: preview.orgName });
    if (r.code === "SEAT_STATE") return setError(`${preview.orgName} isn't open for members yet. Ask ${preview.inviterName ?? "the person who invited you"} to finish setting it up.`);
    if (r.status === 404) return setPhase({ kind: "problem", problem: "missing", orgName: null });
    if (r.status === 403) return setPhase({ kind: "problem", problem: "demo", orgName: null });
    if (r.status === 429) return setPhase({ kind: "problem", problem: "busy", orgName: null });
    setError(r.message || "We couldn't add you. Try again.");
  }

  if (phase.kind === "done") return <JoinDone result={phase.result} already={phase.already} />;
  if (phase.kind === "problem") return <JoinProblem kind={phase.problem} orgName={phase.orgName} />;
  return (
    <>
      <ConsentScreen preview={preview} busy={busy} error={error} onJoin={join} />
      {signIn && (
        <Link href={`/login?next=${encodeURIComponent(joinPath(link))}`} className={buttonVariants("ghost", "md", "mt-3 min-h-[44px] w-full")}>
          Sign in again
        </Link>
      )}
    </>
  );
}
