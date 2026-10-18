import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import PageHeader, { ClaimsMascot } from "./ShellContext";

/** A menu page that is not built yet: friendly, with the bee, never a 404. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div data-coming-soon className="mx-auto max-w-2xl pt-4">
      <PageHeader title={title} subtitle="This page is on the way." />
      <ClaimsMascot />
      <section className="ent-card ent-state-card flex flex-col items-center px-6 pb-8 pt-6 text-center sm:px-10">
        <EnterpriseMascot pose="thinking" size="lg" className="drop-shadow-md" />
        <h2 className="mt-4 text-[22px] font-extrabold leading-tight text-[var(--ent-title)]">This page is on the way</h2>
        <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-[var(--ent-soft)]">
          {`${title} isn't ready yet. Everything else in your menu works, and we'll let you know when this one opens.`}
        </p>
        <Link href="/" className={`${buttonVariants("primary", "md")} mt-6`}>
          Back to my home
        </Link>
      </section>
    </div>
  );
}
