import type { Metadata } from "next";
import SavedJobsPage from "@/components/app-v2/saved/SavedJobsPage";

export const metadata: Metadata = { title: "Saved Jobs" };

export default function Page() {
  return <SavedJobsPage />;
}
