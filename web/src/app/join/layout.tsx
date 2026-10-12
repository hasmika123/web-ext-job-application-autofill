import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@kiwiply/ui";

// A join link is a private door, not a page: never indexed, never cached by a shared proxy.
export const metadata: Metadata = { title: "Join an organization", robots: { index: false, follow: false } };

/**
 * Frame of the join pages (`/join/t/<token>`, `/join/<slug>/<code>`; O2.3): the brand, then one narrow column. Designed for a
 * phone first (a link tapped in an email or a chat), and only centred, never stretched, on a wide screen. No app shell:
 * a person following an invite may not have an account yet.
 */
export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-paper-2">
      <main className="mx-auto flex w-full max-w-[460px] flex-1 flex-col px-4 pb-6 pt-5 sm:pt-10">
        <header className="mb-6">
          <Link href="/" aria-label="Kiwiply home" className="inline-flex min-h-[44px] items-center">
            <BrandLockup />
          </Link>
        </header>
        {children}
      </main>
    </div>
  );
}
