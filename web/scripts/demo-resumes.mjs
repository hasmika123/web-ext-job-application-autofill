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
      ["Cloud & Infrastructure", "AWS (EKS, EC2, S3, RDS, Lambda, IAM), Kubernetes, Terraform, Helm, Docker, Linux"],
      ["Data Engineering", "Python, SQL, Apache Airflow, Spark, dbt, Kafka, Snowflake, PostgreSQL, data modeling"],
      ["DevOps & Reliability", "CI/CD (GitHub Actions, Jenkins, Argo CD), Prometheus, Grafana, Datadog, incident response, SLOs"],
      ["Languages", "Python, SQL, Go, Bash, Java"],
    ],
    jobs: [
      ["Senior Platform Engineer", "Brightwave Systems", "Austin, TX", "Mar 2022 - Present", [
        "Lead a team of 4 building the company's data platform on AWS EKS: 120+ Airflow pipelines feeding analytics for 6 product teams.",
        "Moved all infrastructure to reusable Terraform modules with review gates; environment setup went from 3 days to 40 minutes.",
        "Introduced SLOs, Prometheus alerting and runbooks; pipeline incidents fell 60% and on-call pages halved within two quarters.",
        "Built a self-service CI/CD template (GitHub Actions + Argo CD) now used by 30 services; deploys went from weekly to daily.",
        "Cut AWS spend 22% ($410K a year) through right-sizing, spot node groups and S3 lifecycle policies.",
      ]],
      ["Data Engineer", "Copperline Analytics", "Dallas, TX", "Jun 2019 - Feb 2022", [
        "Designed Python and SQL ingestion for 40+ sources into Snowflake with automated data-quality checks (Great Expectations).",
        "Migrated legacy cron jobs to Airflow on Kubernetes, improving on-time delivery of daily reports from 85% to 99.5%.",
        "Modeled core finance and marketing datasets in dbt; cut dashboard query times by 70%.",
        "Ran on-call for the data platform and wrote the runbooks the team still uses.",
      ]],
      ["Software Engineer, Infrastructure", "Meridian Logistics Tech", "Hyderabad, India", "Jul 2017 - May 2019", [
        "Containerized 15 Java services with Docker and moved them onto Kubernetes; release rollbacks became one command.",
        "Automated server provisioning with Terraform and Ansible across three data centers.",
        "Built Grafana dashboards and alerts for shipment-tracking services handling 2M events a day.",
      ]],
    ],
    education: [
      ["M.S. Computer Science", "The University of Texas at Dallas", "2017"],
      ["B.Tech. Computer Science and Engineering", "Jawaharlal Nehru Technological University, Hyderabad", "2015"],
    ],
    certifications: [
      "AWS Certified Solutions Architect - Professional",
      "Certified Kubernetes Administrator (CKA)",
      "HashiCorp Certified: Terraform Associate",
      "Databricks Certified Data Engineer Associate",
    ],
    projects: [
      "airflow-k8s-starter (open source): a Helm chart and CI template for running Airflow on EKS; 300+ GitHub stars.",
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
      ["Cloud & Infrastructure", "AWS, Azure, Kubernetes, Terraform, Ansible, Docker, Linux"],
      ["CI/CD & Tooling", "GitHub Actions, Jenkins, Argo CD, Helm, Vault"],
      ["Observability", "Prometheus, Grafana, Datadog, ELK, PagerDuty"],
      ["Languages", "Python, Bash, Go"],
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
    education: [["B.E. Electronics and Communication", "Anna University, Chennai", "2015"]],
    certifications: ["Certified Kubernetes Administrator (CKA)", "AWS Certified DevOps Engineer - Professional"],
    projects: [],
  },
};

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

/** A clean, ATS-friendly layout: name band, contact line, summary, skills table, experience, education, certifications. */
export function resumeHtml(r, name, bio) {
  const where = bio.city ? [bio.city, bio.state].filter(Boolean).join(", ") : r.location;
  const contact = [bio.email, bio.phone, where, ...r.links].filter(Boolean).map(esc).join("  |  ");
  const h = (t) => `<h2>${esc(t)}</h2>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: Letter; margin: 0.55in 0.6in; }
    body { font: 10.3pt/1.42 "Segoe UI", Calibri, Arial, sans-serif; color: #1f2937; margin: 0; }
    h1 { font-size: 23pt; margin: 0; letter-spacing: .3px; color: #0f172a; }
    .role { font-size: 12pt; color: #1d4ed8; font-weight: 600; margin-top: 2px; }
    .contact { color: #475569; font-size: 9.3pt; margin-top: 4px; }
    h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 1.2px; color: #1d4ed8; border-bottom: 1.4px solid #cbd5e1; padding-bottom: 2px; margin: 14px 0 6px; }
    .skills td { padding: 1.5px 0; vertical-align: top; }
    .skills td:first-child { width: 165px; font-weight: 600; color: #0f172a; }
    .job { margin: 0 0 9px; page-break-inside: avoid; }
    .job .top { display: flex; justify-content: space-between; }
    .job .t { font-weight: 700; color: #0f172a; }
    .job .c { color: #334155; }
    .job .d { color: #64748b; font-size: 9.4pt; white-space: nowrap; }
    ul { margin: 3px 0 0 16px; padding: 0; } li { margin: 1.5px 0; }
    .edu div { display: flex; justify-content: space-between; }
  </style></head><body>
    <h1>${esc(name)}</h1>
    <div class="role">${esc(r.title)}</div>
    <div class="contact">${contact}</div>
    ${h("Summary")}<div>${esc(r.summary)}</div>
    ${h("Technical Skills")}<table class="skills">${r.skills.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
    ${h("Professional Experience")}
    ${r.jobs.map(([title, company, where, dates, bullets]) => `<div class="job"><div class="top"><div><span class="t">${esc(title)}</span> <span class="c">| ${esc(company)}, ${esc(where)}</span></div><div class="d">${esc(dates)}</div></div><ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>`).join("")}
    ${h("Education")}<div class="edu">${r.education.map(([d, s, y]) => `<div><span><b>${esc(d)}</b>, ${esc(s)}</span><span class="d">${esc(y)}</span></div>`).join("")}</div>
    ${h("Certifications")}<ul>${r.certifications.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
    ${r.projects.length ? h("Projects & Community") + `<ul>${r.projects.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
  </body></html>`;
}
