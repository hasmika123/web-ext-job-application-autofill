/**
 * Real, live job postings for the demo (development only), one per hiring system, picked on 2026-10-19 for Anika's profile
 * (platform, cloud and data engineering). demo-setup.mjs has Rahul save them for Anika, as the extension's "Save for consultant" does,
 * and checks each still answers. Postings close: re-check the morning of a demo and swap any that are gone.
 *
 * Rehearsed with the extension on 2026-10-19 (demo-real-sites-check.mjs and demo-ext-check.mjs, FILL ONLY, never submitted):
 *   Autopilot fill: Greenhouse (Figma 8 fields + an AI-written answer, Robinhood 6), Ashby (Ramp 4), Lever (Rover 5).
 *   Best resume + Check fit in the drawer: Workday (Adobe) and Ashby (Ramp). Greenhouse, Lever and SmartRecruiters pages do not give the
 *   extension the full job text, so the drawer shows no best-resume line there.
 *   Workday and SmartRecruiters: the application sits behind the site's own sign-in, so those show saving the job and the fit check.
 * liveSave: left out of the setup so Rahul saves it from the extension on stage (Act 2 of DEMO-WALKTHROUGH.md).
 * NEVER press Submit on these pages: they are real employers.
 */
export const REAL_JOBS = [
  {
    ats: "greenhouse", fills: true,
    title: "Data Platform Engineer", company: "Figma", location: "San Francisco, CA / New York, NY / Remote (US)", workMode: "HYBRID",
    jobUrl: "https://job-boards.greenhouse.io/figma/jobs/6201407004", externalJobId: "6201407004",
    note: "Closest match to your data platform work at Brightwave: Airflow, Kubernetes and AWS. Apply with Autopilot today if you like it.",
    priority: "HIGH", dueInDays: 2,
  },
  {
    ats: "ashby", fills: true,
    title: "Software Engineer, Data Platform", company: "Ramp", location: "New York, NY", workMode: "HYBRID",
    jobUrl: "https://jobs.ashbyhq.com/ramp/bca0346c-b843-4795-96df-6091f51e421b/application", externalJobId: "bca0346c-b843-4795-96df-6091f51e421b",
    note: "Fintech data platform team; strong overlap with your Snowflake and dbt experience.",
    priority: "HIGH", dueInDays: 3,
  },
  {
    ats: "lever", fills: true,
    title: "Staff Engineer, Commerce Platform", company: "Rover", location: "Seattle, WA", workMode: "HYBRID",
    jobUrl: "https://jobs.lever.co/rover/861c2f1c-6586-40b6-87b8-4140c9379780/apply", externalJobId: "861c2f1c-6586-40b6-87b8-4140c9379780",
    note: "Staff-level platform role; your SLO and CI/CD work is the story to lead with.",
    priority: "MEDIUM", dueInDays: 4,
  },
  {
    ats: "greenhouse", fills: true,
    title: "Staff Software Engineer, Backend Platform", company: "Robinhood", location: "New York, NY", workMode: "ONSITE",
    jobUrl: "https://job-boards.greenhouse.io/robinhood/jobs/8266107", externalJobId: "8266107",
    note: "Backend platform team in New York. On-site, so only if you're open to relocating.",
    priority: "MEDIUM", dueInDays: 5,
  },
  {
    ats: "workday", fills: false, liveSave: true,
    title: "Senior Backend Engineer - Cloud Platform", company: "Adobe", location: "San Jose, CA", workMode: "HYBRID",
    jobUrl: "https://adobe.wd5.myworkdayjobs.com/external_experienced/job/San-Jose/Senior-Backend-Engineer---Cloud-Platform_R168509", externalJobId: "R168509",
    note: "Adobe's cloud platform group. Workday asks you to sign in to their careers site before the form; check the fit first.",
    priority: "MEDIUM", dueInDays: 6,
  },
  {
    ats: "smartrecruiters", fills: false,
    title: "Senior Staff Platform Engineer - Kubernetes", company: "ServiceNow", location: "Santa Clara, CA", workMode: "ONSITE",
    jobUrl: "https://jobs.smartrecruiters.com/ServiceNow/744000156132859", externalJobId: "744000156132859",
    note: "Kubernetes platform role on ServiceNow's federal team. Senior staff level; worth a look.",
    priority: "LOW", dueInDays: 7,
  },
];
