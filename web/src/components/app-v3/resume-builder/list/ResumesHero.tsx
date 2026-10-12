import type { ReactNode } from "react";
import { PlusIcon, Spinner } from "@kiwiply/ui";
import { AppArt } from "@/components/app-v2/common";
import { HERO_NOTE, HERO_SUBTITLE, HERO_TITLE } from "./constants";

/**
 * The board's hero: "My Resumes" + subtitle on the left, the mascot with a handwritten note in the
 * middle (from `md`), and the lime "+ New Resume" button at the right edge (on phones it drops under
 * the subtitle). Same wash as `HeroBand`; the button sits after the art, which `HeroBand`'s slots
 * can't express.
 */
export default function ResumesHero({ onNew, busy }: { onNew: () => void; busy: boolean }) {
  const button: ReactNode = (
    <button
      type="button"
      onClick={onNew}
      disabled={busy}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-v2-lime px-6 text-[15px] font-bold text-v2-navy shadow-[0_8px_18px_rgba(95,191,31,.28)] transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue disabled:pointer-events-none disabled:opacity-60"
    >
      {busy ? <Spinner role="presentation" aria-hidden className="h-4 w-4" /> : <PlusIcon size={18} aria-hidden />}
      New Resume
    </button>
  );
  return (
    <section className="relative overflow-hidden rounded-[20px] border border-white/70 bg-[linear-gradient(105deg,#F1FBE4_0%,#E6F6EE_50%,#E1EEFF_100%)]">
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-14 h-48 w-48 rounded-full bg-v2-lime/30 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 right-1/3 h-52 w-52 rounded-full bg-v2-blue/15 blur-3xl" />
      <div className="relative z-[1] flex min-h-[124px] items-stretch justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col justify-center px-5 py-5 sm:px-7 sm:py-6">
          <h1 className="font-display text-[28px] font-extrabold leading-[1.08] text-ink sm:text-[34px]">{HERO_TITLE}</h1>
          <p className="mt-2 max-w-[34rem] text-[14.5px] leading-relaxed text-ink-soft">{HERO_SUBTITLE}</p>
          <div className="mt-4 md:hidden">{button}</div>
        </div>
        <div className="relative hidden flex-none items-end justify-end self-stretch md:flex">
          <p
            aria-hidden
            className="absolute left-0 top-5 z-[2] w-[170px] -rotate-6 font-[family-name:var(--font-hand)] text-[22px] leading-[1.05] text-v2-green-ink lg:-left-[70px]"
          >
            {HERO_NOTE}
          </p>
          <AppArt name="mascot-resume" height={124} className="relative ml-[120px] lg:ml-[110px]" />
        </div>
        <div className="hidden flex-none items-center pr-6 md:flex lg:pr-8">{button}</div>
      </div>
    </section>
  );
}
