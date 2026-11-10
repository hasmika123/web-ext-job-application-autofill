import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@kiwiply/ui";
import AuthTheme from "@/components/auth/AuthTheme";
import { AuthBackdrop, AuthCard } from "@/components/auth/AuthParts";

/**
 * Centered single-column shell for the standalone auth pages (forgot/reset password). Same
 * "Kiwiply Bright" look as the login/signup card: theme wrapper + soft backdrop + 24px white
 * card. The tabbed login/signup screen has its own split layout (AuthScreen).
 */
export default function AuthCardShell({ children }: { children: ReactNode }) {
  return (
    <AuthTheme>
      <div className="relative flex flex-1 items-center justify-center px-3 py-16 sm:px-6">
        <AuthBackdrop />
        <Link
          href="/login"
          className="absolute left-3 top-3 z-10 inline-flex min-h-[44px] items-center gap-1.5 px-2 text-sm font-semibold text-v2-ink-soft transition-colors hover:text-v2-navy sm:left-6 sm:top-5"
        >
          <ChevronLeftIcon strokeWidth={1.6} className="h-4 w-4" />
          Back
        </Link>
        <div className="relative z-10 w-full max-w-[480px]">
          <AuthCard>{children}</AuthCard>
        </div>
      </div>
    </AuthTheme>
  );
}
