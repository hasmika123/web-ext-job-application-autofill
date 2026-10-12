import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Welcome" };

/**
 * /welcome is retired into the profile setup flow (Onboarding v2 R1.7, DESIGN 4): the six questions are the
 * flow's preferences step now, in the same shell as everything else. Kept as a redirect so old bookmarks and
 * mail links keep working. Nothing sends anyone here any more.
 */
export default function WelcomePage(): never {
  redirect("/profiles/setup?step=prefs&from=welcome");
}
