import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Uppercase eyebrow tag (ported from the mockup `.tag`) — used for section labels / hero eyebrow. */
export default function Tag({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[.1em] " +
          "text-accent-deep bg-accent-soft rounded-full px-3 py-[5px]",
        className,
      )}
      {...props}
    />
  );
}
