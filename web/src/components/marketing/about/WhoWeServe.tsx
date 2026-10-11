import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  GraduationCapIcon,
  RefreshIcon,
  SparkBurst,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import { AboutHeading, AboutSection, FAMILY, IconTile, type Family } from "./shared";

interface Audience {
  title: string;
  body: string;
  family: Family;
  panel: string;
  icon: ReactNode;
  href?: string;
}

const AUDIENCES: Audience[] = [
  {
    title: "Students",
    body: "Explore opportunities, gain experience, and kick-start your career.",
    family: "blue",
    panel: "from-v2-blue-soft via-white to-v2-lime-soft",
    icon: <GraduationCapIcon size={24} />,
  },
  {
    title: "New grads",
    body: "Turn your education into opportunity, with less busywork between you and the next role.",
    family: "green",
    panel: "from-v2-lime-soft via-white to-v2-teal-soft",
    icon: <BriefcaseIcon size={24} />,
  },
  {
    title: "Career switchers",
    body: "Discover new paths and apply with the resume that best fits each role.",
    family: "violet",
    panel: "from-v2-violet-soft via-white to-v2-blue-soft",
    icon: <RefreshIcon size={24} />,
  },
  {
    title: "Organisations",
    body: "Support your people's job search with shared tooling and one clear view of progress.",
    family: "teal",
    panel: "from-v2-teal-soft via-white to-v2-lime-soft",
    icon: <UsersIcon size={24} />,
    href: "/organizations",
  },
];

/** §8.4 — four audience cards. Photos are not supplied yet, so each card carries a tinted panel. */
export default function WhoWeServe() {
  return (
    <AboutSection labelledBy="serve-title">
      <AboutHeading
        id="serve-title"
        eyebrow="Who we serve"
        title="Different journeys."
        accent="A brighter destination."
      />
      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {AUDIENCES.map((a) => {
          const inner = (
            <>
              <div aria-hidden className={cn("relative h-36 bg-gradient-to-br", a.panel)}>
                <SparkBurst className="absolute right-4 top-4 h-8 w-8 text-v2-lime-deep/40" />
              </div>
              <div className="relative flex flex-1 flex-col px-5 pb-5">
                <IconTile family={a.family} className="-mt-6 border-4 border-white">
                  {a.icon}
                </IconTile>
                <h3 className="mt-3 text-lg font-bold tracking-normal text-ink">{a.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-soft">{a.body}</p>
                {a.href ? (
                  <span
                    className={cn(
                      "mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink",
                      "group-hover:underline",
                    )}
                  >
                    Learn more
                    <span className={cn("grid h-7 w-7 place-items-center rounded-full", FAMILY[a.family].soft)}>
                      <ArrowRightIcon size={14} aria-hidden />
                    </span>
                  </span>
                ) : null}
              </div>
            </>
          );
          const card =
            "group flex h-full flex-col overflow-hidden rounded-[var(--radius-v2-card)] bg-white shadow-v2-card";
          return (
            <li key={a.title}>
              {a.href ? (
                <Link
                  href={a.href}
                  className={cn(
                    card,
                    "min-h-11 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  )}
                >
                  {inner}
                </Link>
              ) : (
                <div className={card}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </AboutSection>
  );
}
