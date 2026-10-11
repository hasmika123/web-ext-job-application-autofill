import type { Metadata } from "next";
import MessagesPage from "@/components/app-v3/messages/MessagesPage";

export const metadata: Metadata = { title: "Messages" };

export default function Page() {
  return <MessagesPage />;
}
