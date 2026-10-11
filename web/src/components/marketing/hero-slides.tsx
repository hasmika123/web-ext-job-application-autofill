import type { Family } from "./family";
import type { MascotPose, PhotoId } from "./media";

/**
 * The hero-carousel slides as data (spec 13.1, exact board copy; the boards win over the honest-copy
 * substitutions of spec section 6). The bespoke art of each slide lives in `hero/Art*.tsx`, selected
 * by `HeroArt` from `id`; this file holds the copy plus the small per-slide config the phone layout
 * needs (the phone shows the person + mascot + note only; the cards are desktop / tablet art).
 *
 * Server-only data (no hooks); the client carousel gets the serialisable subset via `page.tsx`.
 */

export interface HeroCta {
  href: string;
  /** Label without the trailing arrow - the carousel adds `ArrowRightIcon`. */
  label: string;
}

export type HeroSlideId = "copilot" | "copilot-alt" | "autopilot" | "students" | "organizations";

export interface HeroSlide {
  id: HeroSlideId;
  /** Short name used by the dots' aria-label and the live announcer. */
  title: string;
  eyebrow: string;
  family: Family;
  /** Three headline lines; the last takes the accent colour. */
  headline: [string, string, string];
  lede: string;
  ticks: string[];
  cta: HeroCta;
  /** Phone art (below md): the person cutout, optional mascot, handwritten note, optional sticky. */
  mobile: {
    photo: PhotoId;
    photoAlt: string;
    /** Person width on the phone (percent of the art box). */
    photoWidth: number;
    /** Mascot overlapping the person's lower right; null when the cutout contains it / the board has none. */
    mascot: MascotPose | null;
    note: string;
    sticky?: string;
    /** Draw the CSS laptop silhouette (+ sticker) in front of the person (slide 1). */
    laptop?: boolean;
  };
}

const SIGN_UP: HeroCta = { href: "/signup", label: "Get Started Free" };

export const HERO_SLIDE_COPILOT: HeroSlide = {
  id: "copilot",
  title: "Copilot",
  eyebrow: "AI Job Application Copilot",
  family: "green",
  headline: ["Find jobs.", "Apply faster.", "Get hired."],
  lede: "Kiwiply helps you find the right jobs, auto-fill applications with AI, track every application, and get smarter updates — so you can spend less time on paperwork and more time on your future.",
  // Desktop board shows no ticks row under slide 1 (the feature strip takes that place); the phone
  // layout does show them, so the carousel hides this row from xl up for this slide only.
  ticks: ["Works on all major job sites", "No credit card required", "Free plan available"],
  cta: SIGN_UP,
  mobile: {
    photo: "hero-headphones",
    photoAlt: "A young man smiling, resting his chin on his hand",
    photoWidth: 80,
    mascot: null,
    note: "Same me. More opportunities.",
    sticky: "Less busy work. More you.",
    laptop: true,
  },
};

/** Alternate slide 1 (woman in a lime hoodie, from the landing-desktop-full board). Not rendered by default. */
export const HERO_SLIDE_COPILOT_ALT: HeroSlide = {
  ...HERO_SLIDE_COPILOT,
  id: "copilot-alt",
  lede: "Kiwiply helps you find the right jobs, autofill applications with AI, track every application, and get smart updates — so you can spend less time on paperwork and more time on your future.",
  ticks: ["Works on all major job sites", "You review before submitting", "Free plan available"],
  mobile: {
    photo: "hero-copilot",
    photoAlt: "A smiling job seeker at her laptop",
    photoWidth: 76,
    mascot: "clap",
    note: "Same me. More opportunities.",
    sticky: "Less busy work. More you.",
  },
};

export const HERO_SLIDES: HeroSlide[] = [
  HERO_SLIDE_COPILOT,
  {
    id: "autopilot",
    title: "Autopilot",
    eyebrow: "From Search to Interview",
    family: "violet",
    headline: ["Your", "job search", "on autopilot."],
    lede: "Kiwiply finds the right opportunities, customizes your applications, tracks every update, and keeps you ready for interviews — automatically.",
    ticks: ["Works at major job sites", "No credit card required", "Free plan available"],
    cta: SIGN_UP,
    mobile: {
      photo: "hero-individual",
      photoAlt: "A smiling man in a green hoodie working on his laptop",
      photoWidth: 78,
      mascot: "laptop",
      note: "Step by step to your next chapter.",
    },
  },
  {
    id: "students",
    title: "Students & early career",
    eyebrow: "For Students & Early Career",
    family: "teal",
    headline: ["Discover", "opportunities", "that fit you."],
    lede: "Explore job roles, get personalized recommendations, and build the skills you need for the career you want.",
    ticks: ["No credit card required", "Free plan available", "For your next step"],
    cta: SIGN_UP,
    mobile: {
      photo: "hero-student",
      photoAlt: "A student in a purple hoodie, thinking, at her laptop with the Kiwiply mascot beside her",
      photoWidth: 92,
      mascot: null,
      note: "Explore. Learn. Grow. Get hired.",
    },
  },
  {
    id: "organizations",
    title: "Organisations",
    eyebrow: "For Organisations",
    family: "blue",
    headline: ["A smarter", "way to grow", "your team."],
    lede: "Manage multiple candidates, track applications, collaborate with your team, and hire top talent faster — all in one place.",
    ticks: ["All your hiring in one place", "Built for growing teams", "Hire smarter, faster"],
    cta: { href: "/organizations", label: "Explore for Organizations" },
    mobile: {
      photo: "hero-team",
      photoAlt: "Three colleagues smiling at their laptops",
      photoWidth: 100,
      mascot: "plane",
      note: "Build great teams together.",
    },
  },
];
