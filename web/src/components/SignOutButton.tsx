"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { SignOutIcon } from "@kiwiply/ui";
import { notifyExtension } from "@/lib/extension-signal";
import { clearOnboardingMirror } from "@/lib/onboarding/mirror";

/** `collapsed` renders an icon-only button on `lg` (label still shows in the mobile drawer). */
export default function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      notifyExtension("signedOut"); // the extension drops its own session at once (11.1)
      clearOnboardingMirror(); // a half-built profile on this device is not for the next person to see (Onboarding v2 R1.9)
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      title={collapsed ? "Sign out" : undefined}
      aria-label="Sign out"
      className={cn(
        "flex items-center justify-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-2 disabled:opacity-50",
        collapsed && "lg:px-0",
      )}
    >
      <SignOutIcon className={cn("h-[18px] w-[18px]", collapsed ? "hidden lg:block" : "hidden")} />
      <span className={cn(collapsed && "lg:hidden")}>{busy ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
