import Link from "next/link";
import { EmptyState } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import type { EnterprisePose } from "@kiwiply/ui";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { SignOutButton } from "./AccountMenu";
import PageHeader from "./ShellContext";

/**
 * The states a tenant page can be in around the shell (16 s2.5, 12 s3). Server-safe (no hooks); the few interactive bits are the
 * client `SignOutButton` and the shell's own `PageHeader` / `ClaimsMascot` markers.
 */

function Centered({ pose, children, ...rest }: { pose: EnterprisePose; children: React.ReactNode } & React.HTMLAttributes<HTMLElement> & Record<`data-${string}`, boolean | string>) {
  return (
    <div className="ent-state-page flex min-h-dvh items-center justify-center px-4 py-12">
      <main className="ent-card ent-state-card flex w-full max-w-xl flex-col items-center px-6 py-10 text-center sm:px-10" {...rest}>
        <EnterpriseMascot pose={pose} size="lg" className="mb-4 drop-shadow-md" />
        {children}
      </main>
    </div>
  );
}

/** MEMBER_SUSPENDED: sign-out only. Carries no organization data (not even its name) in the DOM. */
export function PausedPanel() {
  return (
    <Centered pose="sad" data-tenant-paused>
      <h1 className="text-2xl font-semibold text-ink">Your access is paused</h1>
      <p className="mt-2 text-muted">Ask your organization&apos;s administrator to restore it.</p>
      <SignOutButton className="mt-6" />
    </Centered>
  );
}

export function NotMemberPanel({ orgName }: { orgName: string }) {
  return (
    <Centered pose="peek" data-tenant-not-a-member>
      <h1 className="text-2xl font-semibold text-ink">You&apos;re not a member of this workspace</h1>
      <p className="mt-2 text-muted">Sign in with the account {orgName} invited, or ask them for an invitation.</p>
      <SignOutButton className="mt-6" />
    </Centered>
  );
}

/** The session API is slow, down or throttling: never an empty menu, never "you have no access". */
export function UnavailablePanel() {
  return (
    <Centered pose="error" data-tenant-unavailable>
      <h1 className="text-2xl font-semibold text-ink">We couldn&apos;t load your workspace</h1>
      <p className="mt-2 text-muted">This is on our side. Please try again in a moment.</p>
      <a href="?retry=1" className={`${buttonVariants("primary", "md")} mt-6`}>
        Try again
      </a>
    </Centered>
  );
}

/** A member who can open no workspace at all. */
export function NoWorkspacePanel() {
  return (
    <Centered pose="peek" data-tenant-no-workspace>
      <h1 className="text-2xl font-semibold text-ink">There is nothing for your role here yet</h1>
      <p className="mt-2 text-muted">Ask your organization&apos;s administrator which workspace you should have.</p>
      <SignOutButton className="mt-6" />
    </Centered>
  );
}

/** 16 s2.5 "Not allowed": the URL names a workspace or page this member's roles do not grant. No redirect, no data. */
export function NotYourRole({ switchTo }: { switchTo?: { label: string; href: string } | null }) {
  return (
    <div data-not-your-role className="mx-auto max-w-xl pt-6">
      <PageHeader title="This isn't part of your role" subtitle="You can't open this page with the access you have." />
      <EmptyState
        icon="🔒"
        title="This isn't part of your role"
        description="Your menu only lists what you can use. If you think you should have this, ask an administrator."
        action={
          switchTo ? (
            <Link href={switchTo.href} className={buttonVariants("primary", "md")}>
              Open {switchTo.label}
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}

export { ComingSoon } from "./ComingSoon";
