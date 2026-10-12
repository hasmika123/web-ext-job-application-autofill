import Link from "next/link";
import { ArrowRightIcon, buttonVariants, ConfettiBurst, FileTextIcon, ZapIcon } from "@kiwiply/ui";
import { ROLE_PHRASE, SCOPE_WORDS, type JoinResult } from "@/lib/org-join";

/**
 * The "you're in" screen (onboarding-invites.md section 4): who covers what, the two things worth doing next, and a way
 * out ("Later"). It says plainly what the org can see and where to change it. Confetti plays once (never under reduced
 * motion). `already` is the double-tap case: the person had joined a moment ago.
 */
export default function JoinDone({ result, already = false }: { result: Pick<JoinResult, "orgName" | "role" | "shareScope" | "pays">; already?: boolean }) {
  const sees = result.shareScope === "NONE" ? "only that you joined" : result.shareScope === "SUMMARY" ? "a progress summary" : "everything you've chosen to share";
  return (
    <section aria-labelledby="done-title" className="relative flex flex-1 flex-col">
      {!already && <ConfettiBurst />}
      <div className="flex-1">
        <h1 id="done-title" className="font-display text-[30px] leading-tight text-ink">
          {already ? `You're already in ${result.orgName}` : `You're in. Welcome to ${result.orgName}.`}
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          You joined as {ROLE_PHRASE[result.role]}. {result.orgName} sees {sees}. You can change that any time in{" "}
          <Link href="/settings" className="font-semibold text-accent-deep hover:underline">
            Settings
          </Link>
          .
        </p>
        {result.pays.length > 0 && <p className="mt-1 text-[14px] text-muted">{result.orgName} pays for: {result.pays.join(", ")}.</p>}

        <p className="mt-7 text-[13px] font-semibold uppercase tracking-wide text-muted">Next</p>
        <div className="mt-2 space-y-2.5">
          <Link href="/connect" className={buttonVariants("accent", "lg", "h-[56px] w-full justify-between text-[16px]")}>
            <span className="inline-flex items-center gap-2.5">
              <ZapIcon size={20} />
              Add the browser extension
            </span>
            <ArrowRightIcon size={18} />
          </Link>
          <Link href="/resumes" className={buttonVariants("ghost", "lg", "h-[56px] w-full justify-between text-[16px]")}>
            <span className="inline-flex items-center gap-2.5">
              <FileTextIcon size={20} />
              Upload or build a resume
            </span>
            <ArrowRightIcon size={18} />
          </Link>
        </div>
      </div>
      <Link href="/dashboard" className="mt-8 inline-flex min-h-[44px] items-center justify-center text-[15px] font-semibold text-accent-deep hover:underline">
        Later, take me to my dashboard
      </Link>
    </section>
  );
}
