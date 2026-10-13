"use client";

import Link from "next/link";
import { ArrowRightIcon, Button, CheckIcon } from "@kiwiply/ui";
import { useSceneLine } from "./delight/useCompanionLines";
import { StepFooter, StepHeading } from "./parts";

/**
 * "Your profile so far" (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN 5.10, DECISIONS #33c): where Back from the application
 * questions lands once the core confirm went through. The cards are not re-opened (that would mean a second import); this
 * says what was saved and links to the profile, where it is edited.
 */
export default function ProfileSoFar({ line, hasContact, onBack }: { line: string | null; hasContact: boolean; onBack: () => void }) {
  useSceneLine("cheer", "sofar.idle");
  return (
    <div>
      <StepHeading title="Your profile so far" />
      <ul className="mt-5 flex flex-col gap-2.5 text-[15px] text-v2-navy">
        {line && (
          <li className="flex items-start gap-2.5">
            <CheckIcon size={18} className="mt-0.5 flex-none rounded-full bg-ok p-0.5 text-white" strokeWidth={3} aria-hidden />
            <span className="min-w-0 break-words" data-testid="so-far-counts">
              {line}
            </span>
          </li>
        )}
        {hasContact && (
          <li className="flex items-start gap-2.5">
            <CheckIcon size={18} className="mt-0.5 flex-none rounded-full bg-ok p-0.5 text-white" strokeWidth={3} aria-hidden />
            <span>Name, contact, headline</span>
          </li>
        )}
      </ul>
      <p className="mt-4 text-[14px] text-v2-ink-soft">
        <Link href="/profiles" className="font-semibold text-v2-blue hover:underline">
          Change any of it on your profile
        </Link>
      </p>
      <StepFooter>
        <Button variant="accent" size="lg" onClick={onBack} className="w-full max-sm:min-h-11">
          Back to questions <ArrowRightIcon size={16} aria-hidden />
        </Button>
      </StepFooter>
    </div>
  );
}
