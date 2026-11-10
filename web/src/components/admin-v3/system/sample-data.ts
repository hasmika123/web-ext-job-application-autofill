/**
 * SAMPLE: illustrative numbers for the System board (design/admin-v3 board 11). The live API only
 * exposes actuator health / info / jhimetrics / loggers; everything here fills the rest of the board
 * and every panel using it carries a "Sample data" tag.
 */
import type { Tone } from "@/components/app-v2/common";

/** SAMPLE: tile deltas + sparklines (the uptime tile's value is the real process uptime). */
export const SYSTEM_TILES = {
  uptime: { delta: { value: "0.01%", dir: "up" as const }, spark: [4, 5, 4, 6, 6, 7, 6, 8, 8, 9] },
  latency: { value: "186 ms", delta: { value: "12%", dir: "down" as const, good: true }, spark: [8, 7, 8, 6, 7, 5, 6, 5, 4, 4] },
  jobs: { value: "248 running", delta: { value: "8%", dir: "up" as const }, spark: [3, 4, 3, 5, 5, 6, 5, 7, 7, 8] },
  errors: { value: "0.12%", delta: { value: "28%", dir: "down" as const, good: true }, spark: [8, 7, 8, 6, 6, 5, 5, 4, 4, 3] },
};

/** SAMPLE: shown only when the API returns no health components (response time / last check are never real). */
export const HEALTH_FALLBACK = [
  { name: "Application", ms: "142 ms", last: "2 minutes ago" },
  { name: "Database", ms: "38 ms", last: "2 minutes ago" },
  { name: "Cache (Redis)", ms: "12 ms", last: "2 minutes ago" },
  { name: "AI services", ms: "320 ms", last: "3 minutes ago" },
  { name: "Email delivery", ms: "210 ms", last: "2 minutes ago" },
  { name: "Job imports", ms: "156 ms", last: "4 minutes ago" },
  { name: "Notifications", ms: "98 ms", last: "2 minutes ago" },
];

/** SAMPLE: recent deployments. */
export const DEPLOYMENTS: { version: string; env: "Production" | "Staging"; title: string; meta: string }[] = [
  { version: "v1.24.3", env: "Production", title: "Improve job matching performance", meta: "Deployed 2 hours ago by Maya Chen" },
  { version: "v1.24.2", env: "Production", title: "Fix email delivery retry logic", meta: "Deployed 1 day ago by Liam Chen" },
  { version: "v1.24.1", env: "Production", title: "Add new analytics events", meta: "Deployed 3 days ago by Noah Patel" },
  { version: "v1.24.0", env: "Production", title: "AI matching improvements", meta: "Deployed 5 days ago by Sophie Martin" },
  { version: "v1.23.8", env: "Staging", title: "Test infrastructure updates", meta: "Deployed 6 days ago by Mateo Garcia" },
];

/** SAMPLE: background jobs queue. */
export const JOBS: { name: string; queue: string; status: "Running" | "Pending"; processed: string; duration: string }[] = [
  { name: "Import jobs from LinkedIn", queue: "imports", status: "Running", processed: "1,245 / 1,500", duration: "12m 34s" },
  { name: "Process AI job matching", queue: "ai-matching", status: "Running", processed: "3,892 / 4,000", duration: "8m 12s" },
  { name: "Send email notifications", queue: "notifications", status: "Running", processed: "842 / 1,000", duration: "3m 56s" },
  { name: "Sync customer data", queue: "sync", status: "Pending", processed: "0 / 500", duration: "—" },
  { name: "Generate analytics reports", queue: "reports", status: "Running", processed: "12 / 20", duration: "4m 18s" },
];

/** SAMPLE: recent system events. */
export const EVENTS: { when: string; level: "Info" | "Warning" | "Error"; text: string }[] = [
  { when: "2 hours ago", level: "Info", text: "Deployment v1.24.3 completed successfully" },
  { when: "4 hours ago", level: "Warning", text: "High API latency detected (P95 > 500ms)" },
  { when: "6 hours ago", level: "Info", text: "Background job queue scaled up (4 → 6 workers)" },
  { when: "1 day ago", level: "Info", text: "Database maintenance completed" },
  { when: "2 days ago", level: "Error", text: "External API timeout (LinkedIn) - automatically recovered" },
];
export const LEVEL_TONE: Record<"Info" | "Warning" | "Error", Tone> = { Info: "blue", Warning: "amber", Error: "coral" };

/** SAMPLE: environment rows the actuator does not report (version / profiles are real). */
export const ENV_SAMPLE = {
  region: "aws-ap-southeast-1",
  cache: "Redis 7.0",
  storage: "AWS S3",
  workers: "6 active",
  queue: "BullMQ",
  database: "PostgreSQL 15.4",
  cdn: "CloudFront",
};

/** SAMPLE: resource usage mini-charts (memory % and CPU count are real, shown beside these). */
export const RESOURCES = {
  cpu: { value: "42%", spark: [3, 5, 4, 6, 5, 7, 6, 8, 6, 7], tone: "violet" as Tone },
  memory: { spark: [5, 5, 6, 6, 7, 6, 7, 7, 8, 8], tone: "green" as Tone },
  disk: { value: "58%", sub: "232 GB / 400 GB", spark: [4, 4, 5, 5, 5, 6, 6, 6, 7, 7], tone: "amber" as Tone },
  network: { value: "126 MB/s", sub: "in / out", spark: [6, 4, 7, 5, 8, 4, 6, 7, 5, 8], tone: "blue" as Tone },
};
