/**
 * SAMPLE: illustrative numbers for the Email board (design/admin-v3/board-15). None of this comes
 * from the API. The only live data on the Email page is the subscriber list, its status counts and
 * the CSV export (/api/admin/subscribers*). There is no campaign / template / automation backend.
 */
import type { Tone } from "@/components/app-v2/common";

/** SAMPLE: tile deltas + sparklines (Total subscribers keeps the real count). */
export const EMAIL_TILE_EXTRAS = {
  subscribers: { delta: { value: "12%", dir: "up" as const }, spark: [3, 4, 4, 5, 6, 5, 7, 8, 9, 10] },
  open: { value: "38.6%", delta: { value: "6%", dir: "up" as const }, spark: [4, 5, 4, 6, 5, 7, 7, 8, 8, 9] },
  click: { value: "6.4%", delta: { value: "18%", dir: "up" as const }, spark: [3, 3, 4, 4, 6, 5, 7, 6, 8, 9] },
  bounce: { value: "0.8%", delta: { value: "20%", dir: "down" as const }, spark: [9, 8, 9, 7, 7, 6, 6, 5, 5, 4] },
};

/** SAMPLE: open/click rate over 30 days (percent; plotted on a 0-60% axis). */
export const OPEN_RATE = [22, 30, 27, 31, 38, 34, 29, 36, 31, 40, 44, 37, 35, 41, 38, 46, 43, 49, 52, 48];
export const CLICK_RATE = [6, 10, 8, 11, 14, 12, 11, 13, 12, 15, 14, 16, 13, 15, 14, 17, 16, 19, 18, 21];
export const PERF_X = ["Sep 10", "Sep 17", "Sep 24", "Oct 1", "Oct 8"];
export const PERF_Y = ["0%", "20%", "40%", "60%"];
export const PERF_MAX = 60;

export type CampaignKind = "Onboarding" | "Newsletter" | "Education" | "Promotional";
export const KIND_TONE: Record<CampaignKind, Tone> = { Onboarding: "blue", Newsletter: "violet", Education: "green", Promotional: "pink" };

/** SAMPLE: recent campaigns table. */
export const RECENT_CAMPAIGNS: { subject: string; blurb: string; kind: CampaignKind; recipients: number; sent: string }[] = [
  { subject: "Welcome to Kiwiply!", blurb: "Get started with AI hiring", kind: "Onboarding", recipients: 3842, sent: "Oct 8, 10:00 AM" },
  { subject: "Kiwiply Product Updates", blurb: "New features and improvements", kind: "Newsletter", recipients: 8291, sent: "Oct 4, 9:00 AM" },
  { subject: "Tips for Better Hiring", blurb: "Expert advice and resources", kind: "Education", recipients: 6174, sent: "Sep 28, 2:00 PM" },
  { subject: "Special Offer: 30% Off", blurb: "Limited time for Pro plans", kind: "Promotional", recipients: 5902, sent: "Sep 21, 11:00 AM" },
  { subject: "Monthly Digest", blurb: "Your September summary", kind: "Newsletter", recipients: 7431, sent: "Sep 14, 9:00 AM" },
];

/** SAMPLE: subscriber segments (the "All subscribers" tile uses the real confirmed count). */
export const SEGMENTS: { label: string; value: number; caption: string; tone: Tone; icon: "users" | "sprout" | "star" | "building" | "user" }[] = [
  { label: "All subscribers", value: 12480, caption: "All active email subscribers", tone: "blue", icon: "users" },
  { label: "New subscribers", value: 2184, caption: "Joined in the last 30 days", tone: "green", icon: "sprout" },
  { label: "Active users", value: 5731, caption: "Used Kiwiply in last 30 days", tone: "violet", icon: "star" },
  { label: "Customers", value: 4902, caption: "Current paid customers", tone: "amber", icon: "building" },
  { label: "Inactive users", value: 3276, caption: "No activity in 60+ days", tone: "pink", icon: "user" },
];

/** SAMPLE: templates tab. */
export const TEMPLATES: { name: string; desc: string; kind: CampaignKind; updated: string }[] = [
  { name: "Welcome series", desc: "First-touch email for new sign-ups.", kind: "Onboarding", updated: "Oct 2" },
  { name: "Monthly digest", desc: "Product news and platform highlights.", kind: "Newsletter", updated: "Sep 30" },
  { name: "Hiring tips", desc: "Long-form advice with a single call to action.", kind: "Education", updated: "Sep 22" },
  { name: "Promo announcement", desc: "Offer headline, price and deadline.", kind: "Promotional", updated: "Sep 18" },
];

/** SAMPLE: automations tab. */
export const AUTOMATIONS: { name: string; trigger: string; status: "Active" | "Paused"; sent: number }[] = [
  { name: "Welcome email", trigger: "When a subscriber confirms", status: "Active", sent: 3842 },
  { name: "Re-engagement nudge", trigger: "60 days without activity", status: "Active", sent: 1204 },
  { name: "Upgrade reminder", trigger: "Free plan, day 14", status: "Paused", sent: 688 },
];
