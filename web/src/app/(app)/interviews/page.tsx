import type { Metadata } from "next";
import InterviewsPage from "@/components/app-v2/interviews/InterviewsPage";

export const metadata: Metadata = { title: "Interviews" };

export default function Page() {
  return <InterviewsPage />;
}
