import type { Metadata } from "next";
import CreateOrgFlow from "@/components/org-v2/new/CreateOrgFlow";

export const metadata: Metadata = { title: "Create your workspace" };

/** The three-screen create flow (O2.1). Lives outside the console gate: someone with no organization is sent here. */
export default function NewOrgRoute() {
  return <CreateOrgFlow />;
}
