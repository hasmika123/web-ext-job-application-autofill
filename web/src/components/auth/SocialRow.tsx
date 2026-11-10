"use client";

import type { ReactNode } from "react";
import { AppleIcon, LinkedInIcon, useToast } from "@kiwiply/ui";
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
 * Apple and LinkedIn render per the board but only toast "Not available yet".
 */
export default function SocialRow({ next }: { next?: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <GoogleSignIn next={next} variant="tile" />
      <SoonButton label="Apple" mark={<AppleIcon size={20} className="text-black" />} />
      <SoonButton label="LinkedIn" mark={<LinkedInIcon size={20} className="text-[#0A66C2]" />} />
    </div>
  );
}
