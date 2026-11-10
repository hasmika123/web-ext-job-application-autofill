/**
 * Real, live job postings for the demo (development only), one per hiring system, picked on 2026-10-19 for Anika's profile
 * (platform, cloud and data engineering). demo-setup.mjs has Rahul save them for Anika, as the extension's "Save for consultant" does,
 * and checks each still answers. Postings close: re-check the morning of a demo and swap any that are gone.
 *
 * Rehearsed with the extension on 2026-10-19 (demo-real-sites-check.mjs and demo-ext-check.mjs, FILL ONLY, never submitted):
 *   Autopilot fill: Greenhouse (Figma 8 fields + an AI-written answer, Robinhood 6), Ashby (Ramp 4), Lever (Rover 5).
 *   Best resume + Check fit in the drawer: Workday (Adobe) and Ashby (Ramp). Greenhouse, Lever and SmartRecruiters pages do not give the
 *   extension the full job text, so the drawer shows no best-resume line there.
 *
 * Workday (Adobe) and SmartRecruiters (ServiceNow) are LOCAL stand-ins since 2026-10-19 (web/scripts/demo-ats/, served by demo-ats-server.mjs):
 * the real SmartRecruiters form refuses automated browsers and the real Workday form is five steps long, so the demo shows the whole multi-step
 * Autopilot fill on a copy of each site (Adobe's real Workday pages captured, ServiceNow's SmartRecruiters page rebuilt). Their links are plain
 * http on *.localhost and need the development build of the extension built with those hosts (DEMO-PLAN.md section 16).
 * liveSave: left out of the setup so Rahul saves it from the extension on stage (Act 2 of DEMO-WALKTHROUGH.md); DEMO_SAVE_LIVE=1 saves it too.
 * NEVER press Submit on the real employers' pages (Figma, Ramp, Rover, Robinhood). Submitting on a local stand-in sends nothing anywhere.
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
    ats: "workday", fills: true, liveSave: true, standIn: true,
    title: "Senior Backend Engineer - Cloud Platform", company: "Adobe", location: "San Jose, CA", workMode: "ONSITE",
    jobUrl: "http://adobe.wd5.myworkdayjobs.localhost:3399/en-US/external_experienced/job/San-Jose/Senior-Backend-Engineer---Cloud-Platform_R168509", externalJobId: "R168509",
    note: "Adobe's cloud platform group: Java, AWS and Kubernetes at scale. Check the fit, then let Autopilot do the five Workday steps.",
    priority: "MEDIUM", dueInDays: 6,
  },
  {
    ats: "smartrecruiters", fills: true, standIn: true,
    title: "Senior Staff Platform Engineer - Kubernetes", company: "ServiceNow", location: "Santa Clara, CA", workMode: "HYBRID",
    jobUrl: "http://jobs.smartrecruiters.localhost:3399/oneclick-ui/company/ServiceNow/publication/a430bd4c-3faf-4272-a33f-82720f9bc34f?dcr_ci=ServiceNow", externalJobId: "744000156132859",
    note: "Kubernetes platform role on ServiceNow's federal team. Senior staff level; worth a look.",
    priority: "LOW", dueInDays: 7,
  },
];
