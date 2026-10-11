import type { ComponentType } from "react";
import { ClipboardIcon, EyeIcon, ShieldCheckIcon, UsersIcon, cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";
import OrgTableMock from "./OrgTableMock";
import { Container, Eyebrow } from "./parts";

/** Block 4: full visibility. Copy and four benefit tiles on the left, the team table mock on the right. */
const BENEFITS: { title: string; body: string; Icon: ComponentType<IconProps>; family: Family }[] = [
  { title: "Every consultant at a glance", body: "Stage, support owner and last activity in one list.", Icon: UsersIcon, family: "green" },
  { title: "Notes in one place", body: "Keep updates and conversations in a shared timeline.", Icon: ClipboardIcon, family: "blue" },
  { title: "Access by role", body: "Admins and consultants see only what their role allows.", Icon: ShieldCheckIcon, family: "violet" },
  { title: "Progress, with consent", body: "Consultants decide what their team can see.", Icon: EyeIcon, family: "amber" },
];

export default function OrgVisibility() {
  return (
    <section id="visibility" aria-labelledby="org-visibility-title" className="scroll-mt-24 py-16 md:py-24">
      <Container className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
        <div className="flex flex-col items-start gap-5">
          <Eyebrow family="teal">Collaboration &amp; oversight</Eyebrow>
          <h2 id="org-visibility-title" className="text-[28px] leading-[1.1] text-v2-navy md:text-[36px] md:leading-[1.1]">
            Full visibility.
            <br />
            <span className="text-accent-deep">Stronger outcomes.</span>
          </h2>
          <p className="max-w-lg text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
            See where each consultant stands without chasing updates. Everyone keeps their own account, and the people
            supporting them see progress they have chosen to share.
          </p>
          <ul className="mt-2 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            {BENEFITS.map(({ title, body, Icon, family }) => {
              const f = FAMILY[family];
              return (
                <li
                  key={title}
                  className="flex gap-3 rounded-2xl border border-v2-line/70 bg-white p-4 shadow-v2-card"
                >
                  <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", f.soft)}>
                    <Icon size={20} className={f.icon} />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-[14.5px] leading-snug text-v2-navy">{title}</h3>
                    <p className="text-[13px] leading-relaxed text-v2-ink-soft">{body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <OrgTableMock className="min-w-0" />
      </Container>
    </section>
  );
}
