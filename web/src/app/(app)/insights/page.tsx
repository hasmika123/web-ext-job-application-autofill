import type { Metadata } from "next";
import ComingSoonPage from "@/components/app-v2/coming-soon/ComingSoonPage";

export const metadata: Metadata = { title: "Career Insights" };

export default function Page() {
  return <ComingSoonPage slug="insights" />;
}
