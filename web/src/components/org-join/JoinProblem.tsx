import Link from "next/link";
import { buttonVariants, MascotCheer } from "@kiwiply/ui";

export type ProblemKind = "missing" | "expired" | "full" | "busy" | "error" | "demo";

const COPY: Record<ProblemKind, { title: string; body: (org: string | null) => string }> = {
  missing: {
    title: "This link doesn't work",
    body: () => "It may have been used already, replaced by a newer one, or turned off. Ask the person who invited you for a fresh link.",
  },
  expired: {
    title: "This invite has run out",
    body: (org) => `${org ? `The invite to ${org}` : "This invite"} is no longer valid. Ask the person who sent it to send you a new one; it takes them a tap.`,
  },
  full: {
    title: "This link has no places left",
    body: (org) => `${org ? `${org}'s link` : "This link"} has been used by everyone it was meant for. Ask them for a new one.`,
  },
  busy: {
    title: "Easy there",
    body: () => "Too many tries from your connection. Wait a minute and open the link again.",
  },
  error: {
    title: "We couldn't open this link",
    body: () => "Something went wrong on our side, not yours. Try again in a moment.",
  },
  demo: {
    title: "Demo accounts can't join",
    body: () => "The shared demo account is read-only. Sign in with your own account to join.",
  },
};

/**
 * The one screen for every link that can't be used. It never says WHY a link failed beyond what the visitor already
 * holds (a link that never existed and one that was used look the same); expired and full say whose they were.
 */
export default function JoinProblem({ kind, orgName = null }: { kind: ProblemKind; orgName?: string | null }) {
  const c = COPY[kind];
  return (
    <section aria-labelledby="join-problem" className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <MascotCheer className="h-24 w-24" />
      <h1 id="join-problem" className="mt-4 font-display text-[26px] leading-tight text-ink">
        {c.title}
      </h1>
      <p className="mt-2 max-w-sm text-[15px] text-muted">{c.body(orgName)}</p>
      <Link href="/" className={buttonVariants("ghost", "md", "mt-6 min-h-[44px]")}>
        Back to Kiwiply
      </Link>
    </section>
  );
}
