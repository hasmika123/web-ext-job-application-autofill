import type { Metadata } from "next";
import ExplorePage from "@/components/app-v3/explore/ExplorePage";

export const metadata: Metadata = { title: "Explore" };

export default function Page() {
  return <ExplorePage />;
}
