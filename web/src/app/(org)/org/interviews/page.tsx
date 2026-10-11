import type { Metadata } from "next";
import InterviewsPage from "@/components/org-v2/interviews/InterviewsPage";

export const metadata: Metadata = { title: "Interviews · Organization" };

export default function OrgInterviewsRoute() {
  return <InterviewsPage />;
}
