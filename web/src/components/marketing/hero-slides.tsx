import {
  ChartIcon,
  ClipboardIcon,
  FileTextIcon,
  HeartIcon,
  MailIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
  ZapIcon,
  type IconProps,
} from "@kiwiply/ui";
import type { ComponentType } from "react";
import type { Family } from "./family";
import type { MascotPose, PhotoId } from "./media";

/**
 * The four hero-carousel slides as data (spec section 6). Copy is the spec's, which is the
 * honest version of the mockups: Kiwiply autofills and prepares, you review and submit.
 * Sample rows in the floating cards are fictional (no real company names) and numbers are
 * captioned "Example" by HeroArt.
 *
 * This file holds icon components, so it is only ever imported by SERVER code (page.tsx,
 * HeroArt). The client carousel receives the serialisable `HeroSlideView` subset + a rendered
 * `art` node instead.
 */

export interface HeroCta {
  href: string;
  /** Label without the trailing arrow - the carousel adds `ArrowRightIcon`. */
  label: string;
}

export type CardBody =
  | { kind: "rows"; rows: { mark: string; primary: string; secondary: string; badge: string; tone: Family }[] }
  | { kind: "chips"; chips: string[] }
  | { kind: "bars"; bars: number[] }
  | { kind: "table"; rows: { name: string; role: string; stage: string; tone: Family }[] };

export interface HeroCardSpec {
  id: string;
  icon?: ComponentType<IconProps>;
  family: Family;
  title: string;
  subtitle?: string;
  tilt: "left" | "right" | "none";
  /** md+ absolute placement (already `md:`-prefixed; percent widths / px tops inside the 600px-tall art box). */
  pos: string;
  body?: CardBody;
  /** Rows / bars carry sample numbers - HeroArt adds the tiny "Example" caption. */
  example?: boolean;
}

export type DoodleKind = "spark" | "arrow-dr" | "arrow-dl" | "arrow-ur" | "star" | "plane" | "confetti" | "squiggle";

export interface HeroDoodleSpec {
  kind: DoodleKind;
  /** Position, size and colour (`left-[4%] top-2 h-10 w-10 text-v2-green`). md+ only. */
  className: string;
}

export interface HeroSlide {
  id: string;
  /** Short name used by the dots' aria-label and the live announcer. */
  title: string;
  eyebrow: string;
  family: Family;
  /** Three headline lines; the last takes the accent colour. */
  headline: [string, string, string];
  lede: string;
  ticks: string[];
  cta: HeroCta;
  photo: PhotoId;
  photoAlt: string;
  /** Person cutout width below md (the person is centred; the mascot overlaps its lower right). */
  photoMobile: string;
  /** md+ placement of the person inside the 600px stage (`md:left-[24%] md:w-[56%]`; bottom-anchored by HeroArt). */
  photoMd: string;
  /** Fade the cutout's left / right edges (percent of width) to hide hard crop edges from the extraction. */
  photoFade?: [number, number];
  /** Mascot next to the person, or null when the cutout already contains it (students). */
  mascot: MascotPose | null;
  /** md+ placement + size of the mascot (`md:right-[1%] md:h-[168px] md:w-[160px]`; bottom-anchored). */
  mascotMd: string;
  /** `mobile`: also show the note, small, at the top-left of the person below md (off where it would cover a face). */
  handwritten: { text: string; className: string; mobile?: boolean };
  doodles: HeroDoodleSpec[];
  /** First two show in the stacked mobile art; all show on md+. */
  cards: HeroCardSpec[];
}

const MASCOT_MD = "md:right-[1%] md:h-[168px] md:w-[160px]";

const SIGN_UP: HeroCta = { href: "/signup", label: "Get Started Free" };

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "copilot",
    title: "Copilot",
    eyebrow: "AI job application copilot",
    family: "green",
    headline: ["Find jobs.", "Apply faster.", "Get hired."],
    lede: "Kiwiply finds roles that fit, autofills applications with AI, tracks every reply in your inbox, and keeps your search in one place — you review and submit.",
    ticks: ["Works on major ATS", "No credit card", "Free plan"],
    cta: SIGN_UP,
    photo: "hero-copilot",
    photoAlt: "A job seeker smiling at her laptop",
    photoMobile: "w-[66%]",
    photoMd: "md:left-[22%] md:w-[56%]",
    mascot: "headphones",
    mascotMd: MASCOT_MD,
    handwritten: { text: "Same me. More opportunities.", className: "left-[1%] top-[250px] w-[26%] -rotate-6", mobile: true },
    doodles: [
      { kind: "spark", className: "-left-1 -top-3 h-10 w-10 text-v2-green" },
      { kind: "arrow-dr", className: "left-[53%] top-[10px] h-9 w-9 text-v2-green" },
      { kind: "plane", className: "right-[6%] -top-5 h-10 w-[76px] text-v2-blue" },
      { kind: "star", className: "right-[2%] top-[330px] h-6 w-6 text-v2-amber" },
      { kind: "confetti", className: "right-[22%] bottom-[150px] h-9 w-9 text-v2-green" },
    ],
    cards: [
      {
        id: "matches",
        icon: SearchIcon,
        family: "blue",
        title: "Top job matches for you",
        tilt: "left",
        pos: "md:left-0 md:top-3 md:w-[54%]",
        example: true,
        body: {
          kind: "rows",
          rows: [
            { mark: "N", primary: "Product Designer", secondary: "Northwind · Remote", badge: "96% match", tone: "green" },
            { mark: "A", primary: "UX Researcher", secondary: "Acme Robotics · Hybrid", badge: "92% match", tone: "blue" },
            { mark: "L", primary: "Product Manager", secondary: "Lumen Labs · Remote", badge: "88% match", tone: "amber" },
          ],
        },
      },
      {
        id: "autofill",
        icon: FileTextIcon,
        family: "blue",
        title: "Autofill with AI",
        subtitle: "You review every field",
        tilt: "right",
        pos: "md:right-0 md:top-8 md:w-[39%]",
      },
      {
        id: "replies",
        icon: MailIcon,
        family: "amber",
        title: "Track replies in real time",
        subtitle: "Read from your Gmail",
        tilt: "right",
        pos: "md:right-[3%] md:top-[148px] md:w-[41%]",
      },
      {
        id: "hired",
        icon: HeartIcon,
        family: "coral",
        title: "Get hired",
        tilt: "left",
        pos: "md:right-[4%] md:top-[246px] md:w-[28%]",
      },
    ],
  },
  {
    id: "autopilot",
    title: "Autopilot",
    eyebrow: "From search to submit",
    family: "violet",
    headline: ["Your", "job search", "on autopilot."],
    lede: "Pick the jobs. Kiwiply prepares each application in your browser — right resume, drafted answers, every field filled. You press submit.",
    ticks: ["Prepares up to 30 a day", "You submit", "Never ticks attestations for you"],
    cta: SIGN_UP,
    photo: "hero-individual",
    photoAlt: "A job seeker in a green hoodie working on a laptop",
    photoMobile: "w-[72%]",
    photoMd: "md:left-[8%] md:w-[62%]",
    photoFade: [5, 3],
    mascot: "laptop",
    mascotMd: "md:right-[8%] md:h-[176px] md:w-[168px]",
    handwritten: { text: "Step by step to your next chapter.", className: "right-[3%] top-[338px] w-[28%] rotate-6", mobile: true },
    doodles: [
      { kind: "spark", className: "left-[24%] -top-3 h-10 w-10 text-v2-green" },
      { kind: "arrow-dr", className: "left-[47%] top-[52px] h-9 w-9 text-v2-green" },
      { kind: "arrow-dl", className: "right-[24%] top-[146px] h-9 w-9 text-v2-green" },
      { kind: "arrow-dr", className: "right-[30%] top-[236px] h-9 w-9 text-v2-green" },
      { kind: "plane", className: "right-[4%] top-[96px] h-9 w-[68px] text-v2-blue" },
      { kind: "star", className: "left-[8%] top-[232px] h-6 w-6 text-v2-amber" },
    ],
    cards: [
      {
        id: "find",
        icon: SearchIcon,
        family: "blue",
        title: "Find jobs that match you",
        tilt: "left",
        pos: "md:left-0 md:top-6 md:w-[44%]",
      },
      {
        id: "prepare",
        icon: ZapIcon,
        family: "violet",
        title: "Prepare with AI",
        subtitle: "You press submit",
        tilt: "right",
        pos: "md:right-0 md:top-2 md:w-[40%]",
      },
      {
        id: "track",
        icon: MailIcon,
        family: "amber",
        title: "Track updates",
        subtitle: "in your inbox",
        tilt: "right",
        pos: "md:right-[6%] md:top-[166px] md:w-[40%]",
      },
      {
        id: "hired",
        icon: HeartIcon,
        family: "coral",
        title: "Get hired",
        tilt: "left",
        pos: "md:right-[2%] md:top-[262px] md:w-[30%]",
      },
    ],
  },
  {
    id: "students",
    title: "Students",
    eyebrow: "For students & early career",
    family: "teal",
    headline: ["Discover", "opportunities", "that fit you."],
    lede: "Upload one resume, get a profile that builds itself, and apply to the roles that match where you're starting from.",
    ticks: ["No credit card", "Free plan", "Built for first jobs"],
    cta: SIGN_UP,
    photo: "hero-student",
    photoAlt: "A student thinking about her next role at a laptop, with the Kiwiply mascot peeking in",
    photoMobile: "w-[84%]",
    photoMd: "md:left-[16%] md:w-[72%]",
    photoFade: [10, 3],
    mascot: null,
    mascotMd: "",
    handwritten: { text: "Explore. Learn. Grow. Get hired.", className: "left-0 top-[236px] w-[24%] -rotate-6" },
    doodles: [
      { kind: "spark", className: "-left-1 top-0 h-10 w-10 text-v2-green" },
      { kind: "arrow-dr", className: "left-[55%] top-[4px] h-9 w-9 text-v2-green" },
      { kind: "plane", className: "right-[26%] bottom-[190px] h-9 w-[68px] text-v2-blue" },
      { kind: "star", className: "left-[12%] top-[318px] h-6 w-6 text-v2-amber" },
      { kind: "squiggle", className: "right-[6%] bottom-[200px] h-5 w-14 text-v2-violet" },
    ],
    cards: [
      {
        id: "career",
        icon: ChartIcon,
        family: "violet",
        title: "Career matches",
        tilt: "left",
        pos: "md:left-0 md:top-3 md:w-[54%]",
        example: true,
        body: {
          kind: "rows",
          rows: [
            { mark: "P", primary: "Product Designer", secondary: "Entry level", badge: "96% match", tone: "green" },
            { mark: "D", primary: "Data Analyst", secondary: "Entry level", badge: "88% match", tone: "blue" },
            { mark: "S", primary: "Software Engineer", secondary: "Graduate", badge: "82% match", tone: "teal" },
          ],
        },
      },
      {
        id: "skills",
        icon: SparklesIcon,
        family: "blue",
        title: "Skills on your profile",
        tilt: "right",
        pos: "md:right-0 md:top-6 md:w-[42%]",
        body: { kind: "chips", chips: ["Problem solving", "Communication", "Data analysis", "Leadership"] },
      },
      {
        id: "resumes",
        icon: FileTextIcon,
        family: "pink",
        title: "Resumes, parsed for you",
        subtitle: "Upload once, profile ready",
        tilt: "right",
        pos: "md:right-[4%] md:top-[228px] md:w-[44%]",
      },
    ],
  },
  {
    id: "organizations",
    title: "Organizations",
    eyebrow: "For organisations",
    family: "blue",
    headline: ["A smarter way", "to support", "your people."],
    lede: "Consultancies and teams: prepare resumes, job banks and outreach for every consultant in one place. They approve, fill and submit.",
    ticks: ["One account per consultant", "Marketers never submit", "Setup fee + per person"],
    cta: { href: "/organizations", label: "Explore for Organizations" },
    photo: "hero-team",
    photoAlt: "Three colleagues smiling at their laptops together",
    photoMobile: "w-[92%]",
    photoMd: "md:left-0 md:w-[84%]",
    photoFade: [8, 4],
    mascot: "plane",
    mascotMd: MASCOT_MD,
    handwritten: { text: "Build great careers together.", className: "right-[2%] top-[318px] w-[26%] -rotate-6" },
    doodles: [
      { kind: "spark", className: "-left-1 -top-3 h-10 w-10 text-v2-green" },
      { kind: "arrow-ur", className: "right-[34%] top-[196px] h-9 w-9 text-v2-violet" },
      { kind: "star", className: "left-[2%] top-[372px] h-6 w-6 text-v2-amber" },
      { kind: "confetti", className: "right-[6%] bottom-[140px] h-9 w-9 text-v2-green" },
    ],
    cards: [
      {
        id: "team",
        icon: UsersIcon,
        family: "blue",
        title: "Team applications",
        tilt: "left",
        pos: "md:left-0 md:top-3 md:w-[60%]",
        example: true,
        body: {
          kind: "table",
          rows: [
            { name: "Jordan L.", role: "Data Analyst", stage: "In review", tone: "blue" },
            { name: "Priya S.", role: "Software Engineer", stage: "Interview", tone: "green" },
            { name: "Maya K.", role: "UX Designer", stage: "Offer", tone: "violet" },
          ],
        },
      },
      {
        id: "insights",
        icon: ChartIcon,
        family: "green",
        title: "Team insights",
        tilt: "right",
        pos: "md:right-[2%] md:top-[150px] md:w-[34%]",
        example: true,
        body: { kind: "bars", bars: [30, 45, 38, 60, 52, 78, 90] },
      },
      {
        id: "collaborate",
        icon: UsersIcon,
        family: "violet",
        title: "Collaborate",
        subtitle: "with your team",
        tilt: "right",
        pos: "md:right-0 md:top-[10px] md:w-[34%]",
      },
      {
        id: "progress",
        icon: ClipboardIcon,
        family: "amber",
        title: "Track progress",
        subtitle: "every step",
        tilt: "right",
        pos: "md:right-[1%] md:top-[82px] md:w-[34%]",
      },
    ],
  },
];
