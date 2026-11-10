import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";

/** The lime pill CTA used by every landing section: full width on mobile, auto from sm. */
export function CtaLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={buttonVariants("accent", "lg", `min-h-11 w-full sm:w-auto ${className ?? ""}`)}>
      {children} <ArrowRightIcon size={16} />
    </Link>
  );
}
