"use client";

import { useId, useState } from "react";
import { ChoiceGroup, SavedTick, useSavedFlash, useToast } from "@kiwiply/ui";
import { ONBOARDING_EVENTS as EV, trackOnboarding } from "@/lib/onboarding/events";
import { patchOnboarding } from "@/lib/onboarding/api";
import { PERSONA_CHIPS, personaLabel, type Persona } from "@/lib/onboarding/persona";

/**
 * The setup flow's two settings on `/profiles?tab=preferences` (Onboarding v2 R1.12, ONBOARDING-V2-DESIGN 3.2 / 9):
 * "I'm a ... · Change" (the persona that shapes which application questions we ask, saved the moment it is picked, with the
 * quiet inline tick and no Save button) and "Show the setup card again" (`PATCH card RESET`: clears a snooze or a "don't show
 * this again" so the dashboard card can return). Neither writes anything the autofill reads; the persona is a lens, not a field.
 */
export default function SetupPreferences({ persona: initial }: { persona: Persona | null }) {
  const toast = useToast();
  const saved = useSavedFlash();
  const titleId = useId();
  const [persona, setPersona] = useState<Persona | null>(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (next: string) => {
    if (!next || next === persona || busy) return;
    const was = persona;
    setPersona(next as Persona);
    setBusy(true);
    setError(null);
    try {
      await patchOnboarding({ persona: next as Persona });
      trackOnboarding(EV.personaSet, { persona: next as Persona, changed: was !== null });
      saved.flash("persona");
      setEditing(false);
    } catch {
      setPersona(was);
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const showAgain = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const status = await patchOnboarding({ card: { action: "RESET" } });
      toast({
        title: status.card.show ? "The setup card is back on your dashboard." : "Done. It'll show on your dashboard whenever your profile needs it.",
      });
    } catch {
      toast({ title: "Couldn't do that. Try again in a moment.", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:p-5" data-testid="setup-preferences">
      <h2 id={titleId} className="text-[14px] font-bold text-v2-navy">
        Profile setup
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[14px] text-v2-ink-soft" data-testid="persona-line">
          {persona ? (
            <>
              I&apos;m a <strong className="font-semibold text-v2-navy">{personaLabel(persona)}</strong>
            </>
          ) : (
            "You haven't said who you are yet"
          )}
        </p>
        <button
          type="button"
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
          className="inline-flex min-h-11 items-center rounded-full px-1 text-[13.5px] font-semibold text-v2-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-8"
        >
          {persona ? "Change" : "Set it"}
        </button>
        <SavedTick flash={saved} id="persona" />
      </div>
      {editing && (
        <div className="mt-2">
          <ChoiceGroup aria-label="Who you are" value={persona ?? ""} onChange={(v) => void choose(v)} disabled={busy} options={PERSONA_CHIPS.map((c) => ({ value: c.id, label: c.label }))} />
          <p className="mt-2 text-[12.5px] text-v2-muted">This just changes which questions we ask. It never changes what&apos;s on your profile.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-danger-text">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void showAgain()}
        disabled={busy}
        className="mt-1 inline-flex min-h-11 items-center rounded-full text-[13.5px] font-semibold text-v2-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 sm:min-h-8"
      >
        Show the setup card again
      </button>
    </section>
  );
}
