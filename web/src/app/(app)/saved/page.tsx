import type { Metadata } from "next";
import SavedV3Page from "@/components/app-v3/saved/SavedV3Page";

export const metadata: Metadata = { title: "Saved Jobs" };

export default function Page() {
  return <SavedV3Page />;
}
