import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { isTopic, TOPIC_LABELS } from "@/lib/catalog";
import ContactForm from "@/components/pricing/ContactForm";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Talk to Kiwiply about Autopilot, team and consultancy plans, or expert resume and interview services.",
};

/**
 * "Contact us" (Phase 15.6) — where every plan and service on /pricing that isn't sold by checkout
 * lands. `?topic=` preselects what the visitor clicked; requests go to the admin Inquiries queue.
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
      {/* Soft wash so the mascots sit in the page instead of on a flat sheet. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_85%_28%,rgba(132,230,60,0.18),transparent_70%),radial-gradient(55%_45%_at_8%_72%,rgba(110,170,255,0.16),transparent_70%)] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
      />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-5 py-14">
        <header className="text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Talk to us
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-muted">
            {initialTopic === "other"
              ? "Tell us what you're after"
              : `Interested in ${TOPIC_LABELS[initialTopic]}? Tell us a little about it`}{" "}
            and we&apos;ll reply by email, usually within two business days.
          </p>
        </header>

        <div className="relative mt-[72px]">
          {/* Peeks over the card's top edge, paws resting on it. */}
          <Image
            src="/v2/mascot-peek.png"
            alt=""
            width={172}
            height={214}
            priority
            className="pointer-events-none absolute -top-[82px] right-6 z-10 h-auto w-[84px] select-none sm:right-10 sm:w-[96px] sm:-top-[94px]"
          />
          {/* Wide screens: the envelope mascot stands beside the form. */}
          <Image
            src="/v2/mascot-envelope-2.png"
            alt=""
            width={213}
            height={250}
            className="pointer-events-none absolute bottom-6 -left-[190px] z-10 hidden h-auto w-[150px] select-none lg:block"
          />
          <ContactForm initialTopic={initialTopic} />
        </div>

        <p className="text-center text-[12.5px] text-muted">
          We only use these details to reply to you. See the{" "}
          <Link
            href="/privacy"
            className="font-medium text-accent-deep hover:underline"
          >
            Privacy Policy
          </Link>
          . Prefer email? Write to{" "}
          <a
            href="mailto:support@kiwiply.com"
            className="font-medium text-accent-deep hover:underline"
          >
            support@kiwiply.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
