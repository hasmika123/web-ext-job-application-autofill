import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";

/**
 * Pricing (R2.2). Locked decision: **Free is the only live tier; Pro is "coming
 * soon"** (no Stripe/billing work) and Teams is a contact CTA. Marketing page — header
 * + footer come from the `(marketing)` shell.
 */
export const metadata: Metadata = {
  title: "Pricing",
  description: "Kiwiply is free to start — unlimited autofill, resume parsing, and a self-populating tracker. Pro is coming soon.",
};

type Tier = {
  name: string;
  price: string;
  per?: string;
  blurb: string;
  features: string[];
  cta: { label: string; href?: string; disabled?: boolean };
  highlight?: boolean;
  comingSoon?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    per: "/forever",
    blurb: "Everything you need to apply faster.",
    features: [
      "Unlimited autofill on supported ATS",
      "Resume variants, parsed in-browser",
      "Self-populating application tracker",
      "Bring-your-own AI key (unlimited drafting)",
    ],
    cta: { label: "Get started", href: "/signup" },
    highlight: true,
  },
  {
    name: "Pro",
    price: "—",
    per: " /mo",
    blurb: "For applying at scale.",
    features: [
      "Everything in Free",
      "Kiwiply AI drafts included",
      "Field-answer memory, synced across devices",
      "Priority ATS support",
    ],
    cta: { label: "Notify me at launch", disabled: true },
    comingSoon: true,
  },
  {
    name: "Teams",
    price: "Custom",
    blurb: "For organizations and career services.",
    features: [
      "Everything in Pro",
      "SSO & admin console",
      "Shared templates",
      "Audit & data controls",
    ],
    cta: { label: "Contact us", href: "mailto:hello@kiwiply.com" },
  },
];

const FAQ = [
  {
    q: "Is it really free?",
    a: "Yes — the Free plan is free forever. Unlimited autofill, resume parsing, and the tracker, with no credit card required.",
  },
  {
    q: "What's in Pro?",
    a: "Pro adds Kiwiply AI answer drafting and synced field-answer memory. It's not live yet — we'll let you know when it launches.",
  },
  {
    q: "Can I use my own AI key?",
    a: "Yes. Bring your own provider key on any plan for unlimited answer drafting at no extra cost — including on Free.",
  },
  {
    q: "Does Kiwiply ever submit for me?",
    a: "Never. Kiwiply fills fields and you review every one — it doesn't click Submit, and there's no CAPTCHA bypass.",
  },
];

function PriceCard({ tier }: { tier: Tier }) {
  return (
    <div
      className={`relative flex flex-col rounded-[var(--radius-lg)] bg-paper p-7 shadow-[var(--shadow)] ${
        tier.highlight ? "border-2 border-accent" : "border border-line"
      }`}
    >
      {tier.highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-on-accent">
          Start here
        </span>
      )}
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold text-ink">{tier.name}</h2>
        {tier.comingSoon && (
          <span className="rounded-full bg-brown-soft px-2.5 py-1 text-[11px] font-bold text-brown-deep">
            Coming soon
          </span>
        )}
      </div>
      <div className={`my-2.5 font-display text-[40px] font-bold ${tier.comingSoon ? "text-muted" : "text-ink"}`}>
        {tier.price}
        {tier.per && <span className="text-[15px] font-medium text-muted">{tier.per}</span>}
      </div>
      <p className="mb-4 text-sm text-muted">{tier.blurb}</p>
      <ul className="mb-6 flex flex-col gap-2.5">
        {tier.features.map((f) => (
          <li key={f} className={`flex gap-2.5 text-[13.5px] ${tier.comingSoon ? "text-muted" : "text-ink-soft"}`}>
            <span className={`font-extrabold ${tier.comingSoon ? "text-brown" : "text-accent-deep"}`}>✓</span>
            {f}
          </li>
        ))}
      </ul>
      {tier.cta.disabled ? (
        <span className={buttonVariants("ghost") + " mt-auto cursor-default opacity-60"} aria-disabled>
          {tier.cta.label}
        </span>
      ) : (
        <Link
          href={tier.cta.href ?? "#"}
          className={buttonVariants(tier.highlight ? "accent" : "ghost") + " mt-auto"}
        >
          {tier.cta.label}
        </Link>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
      <header className="mx-auto max-w-2xl text-center">
        <Tag>Pricing</Tag>
        <h1 className="mt-4 text-[33px] font-semibold tracking-tight text-ink sm:text-5xl">
          Start free. Pro is on the way.
        </h1>
        <p className="mx-auto mt-3 max-w-[560px] text-base text-muted">
          Bring your own AI key on any plan for unlimited drafting at no cost. No credit card to get
          started, and Kiwiply never auto-submits.
        </p>
      </header>

      <div className="mt-14 grid items-stretch gap-[18px] md:grid-cols-3">
        {TIERS.map((tier) => (
          <PriceCard key={tier.name} tier={tier} />
        ))}
      </div>

      <section className="mx-auto mt-20 max-w-3xl">
        <h2 className="text-center text-[27px] font-semibold text-ink sm:text-[32px]">
          Questions
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.q} className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
              <h3 className="font-display text-base font-semibold text-ink">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-14 text-center">
        <Link href="/signup" className={buttonVariants("accent")}>
          Create your free profile
        </Link>
      </div>
    </div>
  );
}
