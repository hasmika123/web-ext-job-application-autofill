import type { Metadata } from "next";
import NewsletterAction from "@/components/NewsletterAction";

export const metadata: Metadata = {
  title: "Unsubscribe · Kiwiply",
  robots: { index: false, follow: false },
};

export default async function NewsletterUnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <NewsletterAction kind="unsubscribe" token={token} />;
}
