import Link from "next/link";
import type { ComponentType } from "react";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  GraduationCapIcon,
  RefreshIcon,
  UsersIcon,
  cn,
  type IconProps,
} from "@kiwiply/ui";
import { Photo, type PhotoId } from "../media";
import Section from "../Section";
import { RowHeading, IconTile, type Family } from "./shared";

interface Audience {
  title: string;
  body: string;
  family: Family;
  panel: string;
  icon: ComponentType<IconProps>;
  photo: PhotoId;
  photoAlt: string;
  /** Width of the cutout inside the photo panel. */
  photoWidth: string;
  href: string;
}

const AUDIENCES: Audience[] = [
  {
    title: "Students",
    body: "Explore opportunities, gain experience, and kick start your career.",
    family: "blue",
    panel: "from-v2-blue-soft via-white to-v2-lime-soft",
    icon: GraduationCapIcon,
    photo: "hero-student",
    photoAlt: "A student smiling at her laptop",
    photoWidth: "w-[88%] lg:w-[78%]",
    href: "/signup",
  },
  {
    title: "New Grads",
    body: "Turn your education into opportunity with less busywork and more results.",
    family: "green",
    panel: "from-v2-green-soft via-white to-v2-blue-soft",
    icon: BriefcaseIcon,
    photo: "hero-individual",
    photoAlt: "A new graduate smiling at his laptop",
    photoWidth: "w-[94%] lg:w-[82%]",
    href: "/signup",
  },
  {
    title: "Career Switchers",
    body: "Discover new paths and find roles that match your transferable skills.",
    family: "violet",
    panel: "from-v2-violet-soft via-white to-v2-pink-soft",
    icon: RefreshIcon,
    photo: "hero-copilot",
    photoAlt: "A career switcher smiling at her laptop",
    photoWidth: "w-[84%] lg:w-[66%]",
    href: "/signup",
  },
  {
    title: "Organizations",
    body: "Connect with motivated talent and streamline your hiring process.",
    family: "blue",
    panel: "from-v2-blue-soft via-white to-v2-teal-soft",
    icon: UsersIcon,
    photo: "hero-team",
    photoAlt: "A team collaborating at their laptops",
    photoWidth: "w-[96%] lg:w-[96%]",
    href: "/organizations",
  },
];

/** "Different journeys. A brighter destination." Four photo cards (rows on mobile). */
export default function WhoWeServe() {
  return (
    <Section labelledBy="serve-title" className="py-10 lg:py-14">
      <RowHeading id="serve-title" eyebrow="Who We Serve" title="Different journeys." accent="A brighter destination." />
      <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:mt-10 lg:grid-cols-4 lg:gap-5">
        {AUDIENCES.map((a) => (
          <li key={a.title}>
            <Link
              href={a.href}
              className={cn(
                "group flex h-full min-h-11 overflow-hidden rounded-[var(--radius-v2-card)] bg-white shadow-v2-card",
                "transition-transform hover:-translate-y-0.5",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                "flex-row items-stretch lg:flex-col",
              )}
            >
              {/* photo panel */}
              <div
                className={cn(
                  "relative w-28 flex-none overflow-hidden bg-gradient-to-br sm:w-40 lg:h-48 lg:w-full",
                  a.panel,
                )}
              >
                <div className={cn("absolute bottom-0 left-1/2 -translate-x-1/2", a.photoWidth)}>
                  <Photo id={a.photo} alt={a.photoAlt} className="w-full" sizes="(min-width: 1024px) 280px, 160px" />
                </div>
              </div>

              <div className="relative flex min-w-0 flex-1 items-start gap-3 p-4 lg:px-5 lg:pb-5 lg:pt-0">
                <div className="min-w-0 flex-1">
                  <IconTile
                    family={a.family}
                    className="mb-2 h-10 w-10 lg:absolute lg:-top-7 lg:left-5 lg:mb-0 lg:h-14 lg:w-14 lg:rounded-full lg:border-4 lg:border-white"
                  >
                    <a.icon size={22} />
                  </IconTile>
                  <h3 className="text-[17px] font-bold leading-snug tracking-normal text-v2-navy lg:mt-8">
                    {a.title}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-v2-ink-soft">{a.body}</p>
                </div>
                <span
                  aria-hidden
                  className="grid h-10 w-10 flex-none place-items-center self-center rounded-full bg-v2-blue-soft text-v2-blue transition-transform group-hover:translate-x-0.5 lg:self-end"
                >
                  <ArrowRightIcon size={16} />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
