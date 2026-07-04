import Link from "next/link";
import type { ReactNode } from "react";
import { Logo, BetaBadge } from "@/components/ui";
import { ChevronLeftIcon } from "@kiwiply/ui";

/**
 * Centered single-column shell for the standalone auth pages (forgot/reset password).
 * The tabbed sign-in/up screen has its own split layout (AuthScreen); these simpler
 * flows just need a branded, centered card.
 */
export default function AuthCardShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-1 items-center justify-center bg-app-bg p-6 sm:p-10">
      <Link
        href="/login"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink sm:left-6 sm:top-6"
      >
        <ChevronLeftIcon strokeWidth={1.6} className="h-4 w-4" />
        Back
      </Link>
      <div className="w-full max-w-[380px]">
        <Link href="/" aria-label="Kiwiply" className="mb-8 flex items-center gap-2">
          <Logo height={26} />
          <BetaBadge />
        </Link>
        {children}
      </div>
    </div>
  );
}
