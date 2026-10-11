import type { Metadata } from "next";
import type { ComponentType } from "react";
import Image from "next/image";
import Link from "next/link";
import { isTopic, TOPIC_LABELS } from "@/lib/catalog";
import ContactForm from "@/components/pricing/ContactForm";
import {
  BookOpenIcon,
  BuildingIcon,
  ChatIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  HelpCircleIcon,
  LifebuoyIcon,
  UsersIcon,
  cn,
  type IconProps,
} from "@kiwiply/ui";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Talk to Kiwiply about Autopilot, team and consultancy plans, or expert resume and interview services.",
};

const INFO: { icon: ComponentType<IconProps>; title: string; body: string }[] = [
  { icon: ChatIcon, title: "General questions", body: "Have a question about Kiwiply? We’re here to help." },
  { icon: UsersIcon, title: "Enterprise & partnerships", body: "Interested in team plans, partnerships or custom solutions?" },
  { icon: LifebuoyIcon, title: "Help & support", body: "Need help with your account or something not working as expected?" },
  { icon: ClockIcon, title: "Response time", body: "We usually reply by email within two business days." },
];

// There is no /help route yet, so Help Center is a mailto; the FAQ is the landing FAQ section.
const HELP_HREF = "mailto:support@kiwiply.com";
const QUICK: { icon: ComponentType<IconProps>; title: string; body: string; href: string }[] = [
  { icon: BookOpenIcon, title: "Browse our Help Center", body: "Step-by-step guides and answers to common questions.", href: HELP_HREF },
  { icon: HelpCircleIcon, title: "Frequently asked questions", body: "Get quick answers about features, billing, and more.", href: "/v3#faq" },
  { icon: BuildingIcon, title: "For organizations", body: "Learn about team plans, security and partnership opportunities.", href: "/organizations" },
];

function Leaf({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("absolute block bg-gradient-to-br from-v2-lime-soft to-v2-lime/60 [border-radius:0_100%_0_100%]", className)}
    />
  );
}

/**
 * "Contact us" (Phase 15.6; v3 board) — where every plan and service on /pricing that isn't sold by
 * checkout lands. `?topic=` preselects what the visitor clicked; requests go to the admin Inquiries queue.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  const initialTopic = isTopic(topic) ? topic : "other";

  return (
    <div className="relative isolate overflow-x-clip">
      {/* Backdrop: soft green wash + blobs + leaves (decorative; sits behind everything). */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1000px]">
        <div className="absolute -left-[8%] top-[150px] h-[300px] w-[40%] rounded-full bg-v2-lime-soft/70 blur-2xl md:top-[200px]" />
        <div className="absolute -right-[6%] top-[60px] h-[260px] w-[34%] rounded-full bg-v2-lime-soft/80 blur-2xl" />
        <div className="absolute right-[2%] top-[330px] hidden h-[300px] w-[200px] rounded-full bg-v2-lime-soft/70 blur-2xl lg:block" />
        <Leaf className="left-[10%] top-[200px] hidden h-[56px] w-[34px] rotate-[20deg] lg:block" />
        <Leaf className="left-[16%] top-[170px] hidden h-[34px] w-[22px] rotate-[35deg] lg:block" />
        <Leaf className="right-[6%] top-[400px] hidden h-[34px] w-[56px] -rotate-[20deg] lg:block" />
        <Leaf className="left-[6%] top-[90px] h-[24px] w-[38px] rotate-[10deg] md:left-[22%]" />
      </div>

      <div className="mx-auto w-full max-w-[1180px] px-4 pb-14 pt-9 sm:px-6 lg:px-8 lg:pt-12">
        <header className="text-center md:pr-[130px] lg:pr-0">
          <p className="text-[11.5px] font-extrabold uppercase tracking-[.22em] text-accent-deep">We&apos;d love to hear from you</p>
          <h1 className="mt-3 font-display text-[44px] font-extrabold leading-none tracking-tight text-ink md:text-[54px]">
            Talk to us
          </h1>
          <p className="mx-auto mt-4 max-w-[500px] text-[15px] leading-relaxed text-muted md:text-[17px]">
            {initialTopic === "other"
              ? "Tell us what you’re after"
              : `Interested in ${TOPIC_LABELS[initialTopic]}? Tell us a little about it`}{" "}
            and we&apos;ll reply by email, usually within two business days.
          </p>
        </header>

        <div className="mt-[135px] grid items-start gap-6 md:mt-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-5 lg:mt-5 lg:gap-8">
          <div className="order-2 grid gap-4 sm:grid-cols-2 md:order-1 md:grid-cols-1 md:pt-[6px]">
            {INFO.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-center gap-4 rounded-[18px] bg-white p-4 shadow-v2-soft lg:min-h-[126px] lg:gap-5 lg:p-5">
                <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-v2-lime-soft text-v2-navy lg:h-[54px] lg:w-[54px]">
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-[16px] font-extrabold text-ink lg:text-[17px]">{title}</h2>
                  <p className="mt-1 text-[13.5px] leading-snug text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="relative order-1 md:order-2">
            {/* Envelope mascot rests on the card's top edge, in front of it. */}
            <Image
              src="/v2/mascot-envelope-2.png"
              alt=""
              width={213}
              height={250}
              priority
              className="pointer-events-none absolute bottom-[calc(100%-6px)] right-3 z-10 h-auto w-[104px] select-none md:right-4 md:w-[130px] lg:right-10 lg:w-[160px]"
            />
            <ContactForm initialTopic={initialTopic} />
          </div>
        </div>

        <section className="mt-12 border-t border-line pt-8" aria-labelledby="quick-answers">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="quick-answers" className="font-display text-[28px] font-extrabold leading-none text-ink">
                Quick answers
              </h2>
              <p className="mt-2 text-[14.5px] text-muted">You might find what you&apos;re looking for in our help resources.</p>
            </div>
            <a
              href={HELP_HREF}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-v2-lime-deep/50 bg-v2-lime-soft/60 px-4 text-[14px] font-semibold text-accent-deep transition hover:bg-v2-lime-soft"
            >
              Visit Help Center <ExternalLinkIcon className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {QUICK.map(({ icon: Icon, title, body, href }) => (
              <Link
                key={title}
                href={href}
                className="flex min-h-[88px] items-center gap-4 rounded-[18px] bg-white p-4 shadow-v2-soft transition hover:shadow-v2-card"
              >
                <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-v2-lime-soft text-v2-navy">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[15px] font-extrabold text-ink">{title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">{body}</span>
                </span>
                <ChevronRightIcon className="h-5 w-5 flex-none text-ink" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
