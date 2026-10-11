"use client";

import type { ReactNode } from "react";
import { useToast } from "@kiwiply/ui";
import GoogleSignIn from "@/components/auth/GoogleSignIn";

const TILE =
  "flex h-12 w-full items-center justify-center gap-1.5 rounded-[12px] border border-line bg-paper text-[14px] font-semibold " +
  "text-v2-navy shadow-[0_2px_8px_rgba(27,31,94,0.05)] transition-colors hover:bg-paper-2 sm:gap-2 sm:text-[15px] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function SoonButton({ label, mark }: { label: string; mark: ReactNode }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast({ title: "Not available yet" })} className={TILE}>
      {mark}
      {label}
    </button>
  );
}

/**
 * "Google · Apple · LinkedIn" three-up row. Google is the real GIS sign-in (tile variant);
 * Apple and LinkedIn render per the board but only toast "Not available yet". Their marks are
 * lettered tiles (no third-party glyphs in the shared icon set).
 */
export default function SocialRow({ next }: { next?: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <GoogleSignIn next={next} variant="tile" />
      <SoonButton
        label="Apple"
        mark={
          <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-black text-[11px] font-extrabold leading-none text-white">
            A
          </span>
        }
      />
      <SoonButton
        label="LinkedIn"
        mark={
          <span aria-hidden className="grid h-5 w-5 place-items-center rounded-[4px] bg-[#0A66C2] text-[11px] font-extrabold leading-none text-white">
            in
          </span>
        }
      />
    </div>
  );
}
