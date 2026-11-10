/**
 * The demo consultants' resumes (development only), used by demo-setup.mjs: realistic content and a professional one-to-two page layout,
 * rendered to PDF in a headless browser. Invented people and employers; no date of birth, no ID, visa or account numbers.
 */

export const RESUMES = {
  anika: {
    title: "Senior Platform & Data Engineer",
    location: "Austin, TX",
    links: ["linkedin.com/in/anika-rao-example", "github.com/anikarao-dev"],
    summary:
      "Platform and data engineer with 8 years building the infrastructure that product and analytics teams depend on. I design reliable data pipelines in Python and SQL, " +
      "run them on AWS with Kubernetes and Terraform, and own their monitoring and on-call. I like turning fragile, manual systems into well-tested platforms other " +
      "engineers enjoy using, and I work closely with product, analytics and security teams to ship them.",
    skills: [
      ["Cloud", "AWS, Amazon EKS, Amazon EC2, Amazon S3, Amazon RDS, AWS Lambda, AWS IAM"],
      ["Infrastructure", "Kubernetes, Terraform, Helm, Docker, Linux"],
      ["Data Engineering", "Apache Airflow, Spark, dbt, Kafka, Snowflake, PostgreSQL, Data Modeling"],
      ["CI/CD", "GitHub Actions, Jenkins, Argo CD"],
      ["Reliability", "Prometheus, Grafana, Datadog, Incident Response, SLOs"],
      ["Programming", "Python, SQL, Go, Bash, Java"],
    ],
    jobs: [
      ["Senior Platform Engineer", "Brightwave Systems", "Austin, TX", "Mar 2022 - Present", [
        "Lead a team of 4 running the AWS EKS data platform: 120+ Airflow pipelines serving 6 product teams.",
        "Moved all infrastructure to reviewed Terraform modules; new environments take 40 minutes, not 3 days.",
        "Introduced SLOs, Prometheus alerting and runbooks; pipeline incidents fell 60% in two quarters.",
        "Built a self-service CI/CD template on GitHub Actions and Argo CD, used by 30 services.",
        "Cut AWS spend 22% ($410K a year) through right-sizing, spot node groups and S3 lifecycle policies.",
      ]],
      ["Data Engineer", "Copperline Analytics", "Dallas, TX", "Jun 2019 - Feb 2022", [
        "Built Python and SQL ingestion for 40+ sources into Snowflake with automated data-quality checks.",
        "Moved legacy cron jobs to Airflow on Kubernetes; on-time daily reports rose from 85% to 99.5%.",
        "Modeled core finance and marketing datasets in dbt; cut dashboard query times by 70%.",
        "Ran on-call for the data platform and wrote the runbooks the team still uses.",
      ]],
      ["Infrastructure Software Engineer", "Meridian Logistics Tech", "Hyderabad, IN", "Jul 2017 - May 2019", [
        "Containerized 15 Java services and moved them onto Kubernetes; a rollback is now one command.",
        "Automated server provisioning with Terraform and Ansible across three data centers.",
        "Built Grafana dashboards and alerts for shipment-tracking services handling 2M events a day.",
      ]],
    ],
    education: [
      ["M.S. in Computer Science", "The University of Texas at Dallas", "2017"],
      ["B.Tech. in Computer Science and Engineering", "Jawaharlal Nehru Technological University, Hyderabad", "2015"],
    ],
    certifications: [
      "AWS Certified Solutions Architect - Professional",
      "Certified Kubernetes Administrator (CKA)",
      "HashiCorp Certified: Terraform Associate",
      "Databricks Certified Data Engineer Associate",
    ],
    projects: [
      "airflow-k8s-starter (open source): Helm chart and CI template for Airflow on EKS, 300+ stars.",
      "Speaker, Austin Data Engineering Meetup 2024: \"SLOs for data pipelines\".",
    ],
  },
  ben: {
    title: "Senior DevOps Engineer",
    location: "Charlotte, NC",
    links: ["linkedin.com/in/vikram-iyer-example"],
    summary:
      "DevOps engineer with 9 years running cloud infrastructure for customer-facing systems. Kubernetes on AWS, Terraform, CI/CD and observability; " +
      "calm in incidents and focused on making releases boring.",
    skills: [
      ["Cloud", "AWS, Azure, Kubernetes, Terraform, Ansible, Docker, Linux"],
      ["CI/CD", "GitHub Actions, Jenkins, Argo CD, Helm, Vault"],
      ["Observability", "Prometheus, Grafana, Datadog, ELK, PagerDuty"],
      ["Programming", "Python, Bash, Go"],
    ],
    jobs: [
      ["DevOps Engineer", "Harborline Freight", "Charlotte, NC", "Apr 2021 - Present", [
        "Run Kubernetes on AWS for 30 services with zero-downtime blue/green deploys.",
        "Cut build times in half with cached GitHub Actions pipelines and shared runners.",
        "Led the move from hand-built servers to Terraform; audit findings dropped to zero.",
      ]],
      ["Systems Engineer", "Tidewater Software", "Raleigh, NC", "Jan 2016 - Mar 2021", [
        "Automated server builds with Terraform and Ansible across 2 regions.",
        "Owned monitoring and incident response for customer-facing systems (99.95% uptime).",
      ]],
    ],
    education: [["B.Tech. in Electronics and Communication", "Anna University, Chennai", "2015"]],
    certifications: ["Certified Kubernetes Administrator (CKA)", "AWS Certified DevOps Engineer - Professional"],
    projects: [],
  },
};

/**
 * The resume after the marketer's tailoring (DEMO-PLAN section 16): `r` with the preset's changes applied (web/src/lib/ent/demo/tailor-preset.json, the same
 * text the web's "Tailor resume" sheet shows) and the confirmed skills added. Every preset "before" must match `r` exactly, or this throws, so the sheet and
 * the PDF can never drift apart.
 */
export function tailoredResume(r, preset) {
  const out = { ...r, jobs: r.jobs.map(([t, c, w, d, b]) => [t, c, w, d, [...b]]) };
  for (const ch of preset.changes) {
    if (ch.id === "skills") continue;
    if (ch.id === "headline") {
      if (out.title !== ch.before) throw new Error(`tailor preset: headline "${ch.before}" is not the resume's title`);
      out.title = preset.resume.title;
    } else if (ch.id === "summary") {
      if (out.summary !== ch.before) throw new Error("tailor preset: the summary's before text is not the resume's summary");
      out.summary = ch.after;
    } else {
      const job = out.jobs.find((j) => j[4].includes(ch.before));
      if (!job) throw new Error(`tailor preset: bullet "${ch.before.slice(0, 40)}..." is not on the resume`);
      job[4][job[4].indexOf(ch.before)] = ch.after;
    }
  }
  out.skills = preset.tailoredSkills;
  return out;
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** The structured copy the server keeps (parsedJson): what job fit and best-resume read. */
export function parsedResume(r, name, bio) {
  return {
    fullName: name,
    email: bio.email || "",
    phone: bio.phone || "",
    city: bio.city || "",
    state: bio.state || "",
    headline: r.title,
    summary: r.summary,
    skills: r.skills.flatMap(([, list]) => list.split(",").map((s) => s.replace(/\(.*?\)/g, "").trim()).filter(Boolean)),
    experience: r.jobs.map(([title, company, where, dates, bullets]) => ({ title, company, location: where, dates, bullets })),
    education: r.education.map(([degree, school, year]) => ({ degree, school, year })),
    certifications: r.certifications,
  };
}

/**
 * A clean, ATS-friendly layout: name band, contact line, summary, skills, experience, education, certifications, projects.
 * Kept readable by the extension's own local parser (web/scripts/demo-resume-parse-check.mjs): plain headings (no letter-spacing), one header
 * line per job ("Title | Company, City | dates", one font size), bullets as a text "•", one "Group: a, b, c" line per skill group (no brackets,
 * no wrapping), and the school above the degree.
 */
export function resumeHtml(r, name, bio) {
  const where = bio.city ? [bio.city, bio.state].filter(Boolean).join(", ") : r.location;
  const contact = [bio.email, bio.phone, where, ...r.links].filter(Boolean).map(esc).join("  |  ");
  const h = (t) => `<h2>${esc(t)}</h2>`;
  const list = (items) => `<ul>${items.map((b) => `<li><span class="dot">•</span> ${esc(b)}</li>`).join("")}</ul>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: Letter; margin: 0.55in 0.6in; }
    body { font: 10.3pt/1.42 "Segoe UI", Calibri, Arial, sans-serif; color: #1f2937; margin: 0; }
    h1 { font-size: 23pt; margin: 0; color: #0f172a; }
    .role { font-size: 12pt; color: #1d4ed8; font-weight: 600; margin-top: 2px; }
    .contact { color: #475569; font-size: 9.3pt; margin-top: 4px; }
    h2 { font-size: 11pt; text-transform: uppercase; color: #1d4ed8; border-bottom: 1.4px solid #cbd5e1; padding-bottom: 2px; margin: 14px 0 6px; }
    .skill { margin: 1.5px 0; } .skill b { color: #0f172a; }
    .job { margin: 0 0 9px; page-break-inside: avoid; }
    .job .top { display: flex; justify-content: space-between; align-items: baseline; }
    .job .t { font-weight: 700; color: #0f172a; }
    .job .c { color: #334155; }
    .d { color: #64748b; white-space: nowrap; }
    ul { list-style: none; margin: 3px 0 0; padding: 0; }
    li { margin: 1.5px 0; padding-left: 14px; text-indent: -14px; }
    li .dot { display: inline-block; width: 14px; text-indent: 0; color: #1d4ed8; }
    .edu { margin: 0 0 5px; } .edu .top { display: flex; justify-content: space-between; align-items: baseline; }
  </style></head><body>
    <h1>${esc(name)}</h1>
    <div class="role">${esc(r.title)}</div>
    <div class="contact">${contact}</div>
    ${h("Summary")}<div>${esc(r.summary)}</div>
    ${h("Technical Skills")}${r.skills.map(([k, v]) => `<div class="skill"><b>${esc(k)}:</b> ${esc(v)}</div>`).join("")}
    ${h("Professional Experience")}
    ${r.jobs.map(([title, company, where, dates, bullets]) => `<div class="job"><div class="top"><div><span class="t">${esc(title)}</span> <span class="c">| ${esc(company)}, ${esc(where)}</span></div><div class="d">${esc(dates)}</div></div>${list(bullets)}</div>`).join("")}
    ${h("Education")}${r.education.map(([d, s, y]) => `<div class="edu"><div class="top"><b>${esc(s)}</b><span class="d">${esc(y)}</span></div><div>${esc(d)}</div></div>`).join("")}
    ${h("Licenses & Certifications")}${list(r.certifications)}
    ${r.projects.length ? h("Projects") + list(r.projects) : ""}
  </body></html>`;
}
