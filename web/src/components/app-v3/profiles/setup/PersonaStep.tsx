"use client";

import { useId } from "react";
import { BriefcaseIcon, Button, ChoiceGroup, GraduationCapIcon, RefreshIcon, RocketIcon, ArrowRightIcon } from "@kiwiply/ui";
import { PERSONA_CHIPS, type Persona } from "@/lib/onboarding/persona";
import { SkipButton, StepFooter, StepHeading, StepMascot } from "./parts";

const ICONS = {
  student: GraduationCapIcon,
  first_job: RocketIcon,
  switching: RefreshIcon,
  experienced: BriefcaseIcon,
} as const;

/**
 * `hello`: who you are (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN 5.2). The persona is a lens that only changes which
 * questions we ask and in what order, so the screen says so. A tap on a chip selects it and the focus stays on the chip;
 * Continue is the one explicit action, which makes a mis-tap free. "I'll decide later" leaves the persona empty.
 */
export default function PersonaStep({
  firstName,
  value,
  onChange,
  onContinue,
  onLater,
  mascot,
  busy,
}: {
  /** The profile's first name when there is one ("Hey Priya"); blank gives the no-name line. */
  firstName?: string;
  value: Persona | null;
  onChange: (persona: Persona) => void;
  onContinue: () => void;
  /** "I'll decide later": persona stays null and the flow moves on. */
  onLater: () => void;
  mascot: boolean;
  busy?: boolean;
}) {
  const titleId = useId();
  const name = firstName?.trim();
  return (
    <div>
      <StepMascot name="wave" enabled={mascot} className="mb-3 h-24 w-auto sm:h-32" />
      <StepHeading
        id={titleId}
        title={name ? `Hey ${name} — let's get you job-ready in 2 minutes.` : "Let's get you job-ready in 2 minutes."}
        sub="First, which one's you?"
      />
      <ChoiceGroup
        aria-labelledby={titleId}
        size="lg"
        columns={4}
        className="mt-5"
        value={value ?? ""}
        onChange={(v) => v && onChange(v as Persona)}
        options={PERSONA_CHIPS.map((c) => {
          const Icon = ICONS[c.id];
          return {
            value: c.id,
            label: (
              <>
                <Icon size={22} className="flex-none" aria-hidden />
                <span className="min-w-0 text-left sm:text-center">{c.label}</span>
              </>
            ),
          };
        })}
      />
      <p className="mt-3 text-[12.5px] text-v2-muted">This just changes which questions we ask. Change it anytime.</p>
      <StepFooter>
        <Button variant="accent" size="lg" disabled={value === null || busy} onClick={onContinue} className="w-full max-sm:min-h-11">
          Continue <ArrowRightIcon size={16} aria-hidden />
        </Button>
        <SkipButton onClick={onLater} disabled={busy}>
          I&apos;ll decide later
        </SkipButton>
      </StepFooter>
    </div>
  );
}
