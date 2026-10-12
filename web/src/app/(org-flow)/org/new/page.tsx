import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, buttonVariants } from "@kiwiply/ui";

export const metadata: Metadata = { title: "Create your workspace" };

/** Placeholder until O2.1 lands the three-screen create flow here. */
export default function NewOrgRoute() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-1 items-center px-4 py-10">
      <EmptyState
        mascot
        title="Let's set up your workspace"
        description="The create flow is on its way. Until then your own dashboard is one tap away."
        action={
          <Link href="/dashboard" className={buttonVariants("primary", "md")}>
            Back to my dashboard
          </Link>
        }
        className="w-full"
      />
    </main>
  );
}
