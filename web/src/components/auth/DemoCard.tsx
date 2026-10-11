import Link from "next/link";
import type { DemoInfo } from "@/lib/demo";

/** One quiet line under the signup form: "or try the demo first" -> the login page, where the Demo accounts tab is. */
export function DemoSignupLink({ demo }: { demo: DemoInfo }) {
  if (!demo.enabled || demo.accounts.length === 0) return null;
  return (
    <p className="mt-3 text-center text-[14px] text-v2-ink-soft">
      or{" "}
      <Link href="/login" className="inline-flex min-h-[44px] items-center font-semibold text-accent-deep hover:underline">
        try the demo first
      </Link>
    </p>
  );
}
