import Link from "next/link";
import { buttonVariants, BuildingIcon, LockIcon } from "@kiwiply/ui";
import { ROLE_PHRASE, joinPath, type JoinLink, type JoinPreview as Preview } from "@/lib/org-join";
import { orgInitials } from "./ConsentScreen";

/**
 * What a join link shows a person who is not signed in (onboarding-invites.md section 3.1): whose workspace, who invited
 * them, as what, and the honest promise of the next step ("you choose what they see"). Two ways forward, both of which come
 * straight back to this page: create an account, or sign in. A server component: no state, the links are plain anchors.
 */
export default function JoinPreview({ link, preview }: { link: JoinLink; preview: Preview }) {
  const next = encodeURIComponent(joinPath(link));
  const by = preview.inviterName ? `${preview.inviterName} invited you` : "You're invited";
  const meta = [`As ${ROLE_PHRASE[preview.role]}`, preview.groupName].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby="join-title" className="flex flex-1 flex-col">
      <div className="flex-1">
        <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft font-display text-[22px] text-accent-deep">
          {orgInitials(preview.orgName)}
        </span>
        <p className="mt-4 text-[14px] text-muted">{by}</p>
        <h1 id="join-title" className="mt-0.5 font-display text-[30px] leading-tight text-ink">
          Join {preview.orgName}
        </h1>
        <p className="mt-1 text-[14px] text-muted">{meta}</p>

        {preview.open ? (
          <ul className="mt-6 space-y-3 text-[15px] text-ink">
            <li className="flex items-start gap-3">
              <LockIcon size={20} className="mt-0.5 flex-none text-accent-deep" />
              <span>You keep your own account, resumes and applications.</span>
            </li>
            <li className="flex items-start gap-3">
              <BuildingIcon size={20} className="mt-0.5 flex-none text-accent-deep" />
              <span>Next you choose what {preview.orgName} can see: a progress summary, or only that you joined.</span>
            </li>
          </ul>
        ) : (
          <p className="mt-6 rounded-[var(--radius-lg)] border border-line bg-paper-2 p-4 text-[14.5px] text-ink">
            {preview.orgName} isn't open for members yet. {preview.inviterName ?? "The person who invited you"} needs to finish setting it up, then this link will work.
          </p>
        )}
        {preview.pays.length > 0 && <p className="mt-3 text-[14px] text-muted">{preview.orgName} pays for: {preview.pays.join(", ")}.</p>}
      </div>

      {preview.open && (
        <div className="mt-8 space-y-2.5">
          <Link href={`/signup?next=${next}`} className={buttonVariants("accent", "lg", "h-[52px] w-full text-[16px]")}>
            Create an account to join
          </Link>
          <Link href={`/login?next=${next}`} className={buttonVariants("ghost", "lg", "h-[52px] w-full text-[16px]")}>
            I already have an account
          </Link>
        </div>
      )}
    </section>
  );
}
