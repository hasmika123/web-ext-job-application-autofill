import type { Metadata } from "next";
import ResumesPage from "@/components/org-v2/resumes/ResumesPage";

export const metadata: Metadata = { title: "AI Resume Support · Organization" };

export default function OrgResumesRoute() {
  return <ResumesPage />;
}
