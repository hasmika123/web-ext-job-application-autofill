import type { ComponentType } from "react";
import { BellIcon, ChatIcon, ChartIcon, UsersIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, HEADLINE_GREEN, type Family } from "./family";
import OrgTableMock from "./OrgTableMock";
import Eyebrow from "../Eyebrow";
import { Container } from "./parts";

/** Block 4: "Collaboration & Oversight". Copy and four tiles left, the Team Management table right. */
interface Tile {
  title: string;
  body: string;
  Icon: ComponentType<IconProps>;
  family: Family;
}

const TILES: Tile[] = [
  { title: "Track every employee", body: "See status, progress, and next steps at a glance.", Icon: ChartIcon, family: "green" },
  { title: "Centralized notes", body: "Keep all communication and updates in one place.", Icon: ChatIcon, family: "blue" },
  { title: "Bulk actions", body: "Save time with bulk messaging, status updates, and more.", Icon: UsersIcon, family: "violet" },
  { title: "Permission-based access", body: "Give the right people the right level of access.", Icon: BellIcon, family: "amber" },
];

export default function OrgVisibility() {
  return (
    <section id="visibility" aria-labelledby="org-visibility-title" className="scroll-mt-20 py-12 md:py-16">
      <Container className="grid items-center gap-10 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)] md:gap-5 lg:gap-8">
        <div className="flex flex-col items-start gap-5">
          <Eyebrow family="green">Collaboration &amp; Oversight</Eyebrow>
          <h2 id="org-visibility-title" className="text-[28px] leading-[1.08] text-v2-navy md:text-[clamp(22px,2.9vw,40px)]">
            Full visibility.
            <br />
            Stronger <span className={HEADLINE_GREEN}>outcomes.</span>
          </h2>
          <p className="max-w-md text-base leading-relaxed text-v2-ink-soft md:text-[clamp(13.5px,1.3vw,17px)]">
            Get a real-time view of your team&apos;s progress, manage support, and keep everyone aligned with powerful
            oversight tools.
          </p>

          <ul className="mt-2 grid w-full gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
            {TILES.map((t) => {
              const f = FAMILY[t.family];
              return (
                <li
                  key={t.title}
                  className="flex items-start gap-3 rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-3.5 shadow-v2-card"
                >
                  <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", f.soft, f.icon)}>
                    <t.Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-bold leading-snug tracking-normal text-v2-navy">{t.title}</h3>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-v2-ink-soft">{t.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="min-w-0">
          {/* Mobile board's caption above the table card. */}
          <p className="mb-3 text-[20px] font-extrabold tracking-tight text-v2-navy md:hidden">Your team, at a glance.</p>
          <OrgTableMock />
        </div>
      </Container>
    </section>
  );
}
