import type { Metadata } from "next";
import InterviewPrepPage from "@/components/app-v3/interview-prep/InterviewPrepPage";

export const metadata: Metadata = { title: "Interview Prep" };

export default function Page() {
  return <InterviewPrepPage />;
}
