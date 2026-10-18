import type { Metadata } from "next";
import { getBuilderConfig } from "@/lib/resume-builder-config";
import TemplateGallery from "@/components/app-v3/resume-builder/templates/TemplateGallery";

export const metadata: Metadata = { title: "Resume templates" };

/**
 * The template gallery (R3.13, DESIGN 10.17): "View all" of the Popular Templates strip. A Server Component reads the
 * builder config (which templates are enabled, the admin's capability overrides); the client island draws the cards.
 * Inside the app shell like the list; "Use this template" returns to My Resumes with the start chooser opened.
 */
export default async function Page() {
  const config = await getBuilderConfig();
  return <TemplateGallery config={config} />;
}
