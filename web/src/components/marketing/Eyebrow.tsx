import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";

/** Mixed-case pill above a headline (not uppercase like the app's `Tag`). Spec section 4. */
export default function Eyebrow({
  family = "lime",
  className,
  children,
}: {
  family?: Family;
  className?: string;
  children: ReactNode;
}) {
  const f = FAMILY[family];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-semibold leading-none",
        f.soft,
        f.deep,
        className,
      )}
    >
      {children}
    </span>
  );
}
