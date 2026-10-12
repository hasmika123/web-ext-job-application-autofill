import { hasSession } from "@/lib/auth";
import { loadJoinPreview } from "@/lib/join-server";
import type { JoinLink } from "@/lib/org-join";
import JoinFlow from "./JoinFlow";
import JoinPreview from "./JoinPreview";
import JoinProblem from "./JoinProblem";

/**
 * The body of both join pages (`/join/t/<token>` and `/join/<slug>/<code>`): look the link up on the server and show the
 * right thing. A visitor without a session sees the preview and a way to sign up or in that brings them back here; a
 * signed-in person goes straight to the consent step. A bad link is one screen whatever was wrong with it.
 */
export default async function JoinPage({ link }: { link: JoinLink }) {
  const lookup = await loadJoinPreview(link);
  if (lookup.state === "missing") return <JoinProblem kind="missing" />;
  if (lookup.state === "expired") return <JoinProblem kind={lookup.reason} orgName={lookup.orgName} />;
  if (lookup.state === "busy") return <JoinProblem kind="busy" />;
  if (lookup.state === "error") return <JoinProblem kind="error" />;
  if (!(await hasSession())) return <JoinPreview link={link} preview={lookup.preview} />;
  if (!lookup.preview.open) return <JoinPreview link={link} preview={lookup.preview} />;
  return <JoinFlow link={link} preview={lookup.preview} />;
}
