import { permanentRedirect } from "next/navigation";

/**
 * /pricing is retired: every plan and service now lives on the landing page (#pricing and
 * #services), each with its own details pop-up. This stays as a permanent redirect because the
 * URL is out in the world — Stripe's checkout cancel URL, the extension's upgrade links, emails
 * and bookmarks all point here.
 */
export default function PricingPage(): never {
  permanentRedirect("/#pricing");
}
