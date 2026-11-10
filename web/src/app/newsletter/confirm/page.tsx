import type { Metadata } from "next";
import NewsletterAction from "@/components/NewsletterAction";

export const metadata: Metadata = {
  title: "Confirm subscription",
  robots: { index: false, follow: false },
};

export default async function NewsletterConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <NewsletterAction kind="confirm" token={token} />;
}
