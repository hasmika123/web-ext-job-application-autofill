# KIWIPLY ENTERPRISE V2 — FINAL MASTER IMPLEMENTATION PROMPT (from the user, 2026-10-12, verbatim content)
Architecture Debate · Multi-Tenant SaaS · Enterprise Roles · Dashboards · Consultant Marketing · Flexible Subscriptions · White-Label Portals · Agile Implementation

User instruction added with it: "design only with fable and any coding will be with sonnet"

## 1. YOUR RESPONSIBILITY
Act as a collaborative team of senior architects and implementation specialists: Principal SaaS / Multi-Tenant Architect; Enterprise Product Architect; Billing & Subscription Systems Architect; Security & Identity Architect; Database Architect; Principal Full-Stack Engineer; Senior UX/UI Design Director; Technical Product Owner; Agile Delivery Lead; QA & Automation Architect; DevOps / Cloud Infrastructure Architect.
You have access to the existing Kiwiply codebase. Your mission is to architect, document, and implement Kiwiply Enterprise V2.
This is not simply a dashboard redesign or an enterprise menu extension. We are building a comprehensive enterprise talent management, consultant marketing, job application, client placement, and workforce coordination platform.
Critical instructions:
- Inspect the existing implementation first.
- Reuse existing Kiwiply features wherever possible.
- Debate architecture decisions instead of blindly accepting suggestions.
- Identify risks and better design alternatives.
- Produce detailed product and technical documentation.
- Create implementation-ready Agile stories.
- Implement the system incrementally.
- Maintain a progress tracker.
- Preserve existing personal-user functionality.
- Preserve existing subscription functionality.
- Use secure tenant isolation.
- Do not create separate application deployments per organization.
- Do not implement disconnected dashboards without underlying business workflows.
Where a critical decision remains unresolved, choose a justified default if it is safe and reversible. Escalate decisions that materially affect security, financial correctness, destructive migrations, or contractual behavior.

## 2. PRODUCT VISION
Kiwiply currently supports personal career-management capabilities, potentially including: user profiles; resume creation and management; resume versions; job discovery; job matching; AI resume assistance; job applications; application tracking; email monitoring; interview preparation; AI career assistance; notifications; personal subscriptions. Verify actual functionality in the repository before planning reuse.
Enterprise V2 — Organizations such as staffing agencies, IT consulting firms, and professional services companies should be able to: create organization accounts; manage employees and consultants; assign roles and permissions; manage departments and teams; assign consultants to marketing specialists; manage consultant resumes and profiles; discover jobs and match consultants; coordinate applications and submissions; track interviews and outcomes; manage client relationships; track placements; manage HR and Finance functions; purchase consultant licenses; configure paid features individually for every consultant; monitor operations and subscription costs; give employees a company-branded experience.
The product must be flexible enough to serve other organization types in the future.

## 3. CONFIRMED ENTERPRISE ARCHITECTURE (business decisions confirmed)
### 3.1 One Shared Deployment
One shared frontend deployment. One shared backend application architecture. Secure tenant-aware data access. Shared platform services. Shared resume, job, application, and AI functionality. Organization-specific settings, permissions, and entitlements. Runtime-loaded branding and configuration. Do not build a separate React application, backend instance, or database deployment for each customer by default. Debate the physical data-isolation model based on the existing repository, but maintain one shared application deployment.
### 3.2 Organization Domains
Support `acme.kiwiply.com`, `careers.acme.com`, `jobs.beta.com`. Customer-owned custom domains and Kiwiply-provided subdomains must resolve to the correct organization. Design: domain registration; hostname uniqueness; DNS instructions; domain ownership verification; HTTPS certificates; activation; primary domain selection; redirect behavior; domain suspension; domain removal; monitoring and troubleshooting. Evaluate Cloudflare for SaaS, CloudFront, or other suitable infrastructure based on the existing deployment.
### 3.3 Login-First Experience
Organizations do not require separate public landing pages. When someone visits `careers.acme.com`: 1) Kiwiply resolves the domain to Acme. 2) Loads Acme's published branding. 3) If unauthenticated, show Acme's branded login. 4) Authenticate securely. 5) Validate the user's Acme organization membership. 6) Resolve roles, permissions, and module entitlements. 7) Load the appropriate dashboard. 8) Continue all requests in the authorized tenant context. If the user has an existing valid authorized session, allow direct entry to the dashboard. Do not fall back to another organization's portal or Kiwiply's public website when enterprise tenant resolution fails.
### 3.4 Organization Branding
Each organization can configure: company name; logo; favicon; primary color; secondary color; accent color; login background/banner; welcome message; dashboard theme; approved navigation preferences; organization-specific terminology. Develop one reusable branded login component and one common enterprise application shell. Customization must not require a new deployment.
### 3.5 Shared Kiwiply Character
Use the existing generic Kiwiply character consistently throughout enterprise portals: welcoming on login; friendly greeting on dashboard; helpful expression on empty states; encouraging during interview preparation; celebrating on successful application/placement; subtle error or warning expressions. Do not create separate mascots per organization. Keep it compact and contextual, avoiding visual clutter.
### 3.6 Enterprise V2 Branch
Implement in the designated Enterprise V2 development branch. Inspect Git status, current branch, and pending changes before starting. Avoid destructive operations or overwriting existing work. Use feature flags, incremental migrations, and tests.

## 4. MANDATORY EXISTING SYSTEM AUDIT
Before designing new modules, inspect: frontend architecture and router; backend architecture; authentication and identity; roles and permissions; database entities; existing organization support; resume builder; profiles; job discovery; matching; applications; interview tools; notification infrastructure; email and calendar integrations; AI services; subscription models; pricing; payment-provider integration; existing feature gates; usage limits; file storage; background processing; hosting and reverse proxy; CI/CD; existing tests.
Produce an Existing System Reuse Matrix. Identify: existing functionality; reusable components; missing features; architectural risks; necessary refactoring; database impact; backward-compatibility requirements. Do not invent existing system behavior.

## 5. MULTI-TENANT SECURITY ARCHITECTURE
Design the tenant model including: organization; organization membership; organization configuration; organization domain; organization branding; organization roles; organization permissions; organization feature settings; consultant license entitlements; organization billing account.
Every protected operation must enforce the appropriate tenant context. Apply isolation to: backend APIs; database queries; file storage; resume documents; applications; interviews; placements; subscription records; billing details; notifications; AI requests; search indexes; background jobs; logs and audit trails; integration credentials.
Never trust frontend-supplied tenant identifiers as authorization. Unknown or unverified domains must fail safely. Implement negative cross-tenant access tests.

## 6. ENTERPRISE ROLE MODEL
Use default role templates, but support configurable permissions and multiple roles per user.
- Platform Super Admin — manages the Kiwiply platform, organizations, feature catalog, pricing, subscriptions, domain provisioning, integrations, operational health, platform security. Privileged access to customer data must remain separately restricted and audited.
- Organization Admin — organization-level administrative access, subject to mandatory security and privacy rules. Responsibilities: organization setup; company branding; custom domain; employees; invitations; departments; teams; roles; permissions; consultant assignments; marketing supervision; subscription management; reports; integrations; organization configuration.
- Consultant / Talent — employee or consultant seeking opportunities at client organizations: profile management; resume management; job preferences; availability; opportunity review; job applications; application tracking; interview preparation; interview attendance; feedback; offers; placement status.
- Talent Marketing Specialist — markets assigned consultants to job openings and client requirements: assigned consultant roster; resume review; authorized resume editing; job discovery; AI matching; consultant job assignment; application/submission coordination; follow-ups; interview scheduling; status updates; placement progress.
- Talent Marketing Manager — manages marketing teams, assignments, performance, approvals, escalations, workload balancing.
- HR Specialist — onboarding, employee records, employment lifecycle, HR documents, policies, compliance tasks, offboarding.
- Finance Specialist — subscriptions, billing, invoices, approved placement financials, timesheets, payments, reports within granted permissions.
- Account Manager — client accounts, contacts, requirements, offers, placements.
- Talent Acquisition Specialist — candidate sourcing, screening, talent pools, onboarding coordination.
- Executive / Viewer — permitted organization-wide analytics and read-only operational visibility.

## 7. USER PROFILE VS ROLE VS DASHBOARD (confirmed UX + architecture decision)
Every organization member has one basic user profile. A profile is not a dashboard. An Organization Admin does not need a consultant/career profile unless the same person also acts as a consultant.
Basic User Profile (reusable across all roles): profile photo; first and last name; work email; phone (optional); job title; timezone; language; notification preferences; account security; password/MFA settings where applicable; organization memberships; assigned roles (read-only unless authorized). Accessible from the avatar/account menu. Do not make My Profile the default page after login.
Organization Profile (separate from personal profile): organization name; logo; company contact details; addresses; branding; domains; organization policies; team configuration; integrations; subscription configuration.
Organization Admin Dashboard: Organization Admin must land directly on the Organization Admin Dashboard after authentication. Do not create an additional generic employee dashboard that administrators must visit first. Include: total consultants; licensed consultants; available consultants; marketing activity; active applications; interviews; placements; pending approvals; team performance; subscription summary; financial summary where permitted; recent activity; important alerts; quick actions (invite employee; assign marketer; manage licenses; review applications; view organization pipeline; configure organization).
Users With Multiple Roles: support multiple roles on one account (e.g. Sarah is Organization Admin and Talent Marketing Manager). Default to primary role's dashboard (generally Org Admin). Optional workspace switcher when workflows materially differ. No separate accounts or credentials. Do not duplicate basic profile functionality per role.

## 8. PERMISSIONS & ACCESS CONTROL
Centralized permission system. Separate: system role; organization role; job title; team; department; reporting manager; permission; resource scope; consultant assignment; feature entitlement.
Scopes: Own; Assigned; Team; Department; Organization.
A protected operation evaluates: 1) active tenant 2) active membership 3) organization status 4) user permissions 5) resource scope 6) module availability 7) consultant feature entitlements 8) consent and delegated authority where applicable. Backend-enforced authorization; hiding menus is not sufficient.

## 9. EMPLOYEE & ORGANIZATION MANAGEMENT
Lifecycle: invite; accept invitation; assign roles; assign department; assign team; set manager; activate; suspend; deactivate; reinstate; offboard. Bulk operations and audit history. Do not automatically destroy business records when accounts are disabled. Support multiple organization memberships per global user identity, if consistent with the current identity model.

## 10. CONSULTANT-MARKETER ASSIGNMENTS
Primary marketing specialist; backup marketing specialist; marketing manager; team ownership; effective assignment dates; assignment history; reassignment; temporary delegation; workload balancing. One marketer may manage multiple consultants. Reassignment preserves application, interview, and marketing history. Auditable assignment entity rather than a single fixed marketer field.

## 11. RESUMES & PROFILES
Reuse existing resume builder and profile functionality. Enterprise enhancements: consultant directory; consultant profile photo; skills; experience; availability; marketing status; assigned marketer; license status; resume completeness; named resumes; created date; last modified date; primary resume; resume visibility; resume ownership; resume versions; resume approval; sharing permissions; view/download/print; audit history. Distinguish personal resumes from organization-managed resumes. Define consultant consent and authorized marketing changes. Do not duplicate the resume builder.

## 12. TALENT MARKETING & JOB APPLICATION LIFECYCLE
Consultant Onboarding → Profile Preparation → Resume Review → Marketing Availability → Job Discovery → Matching → Opportunity Assignment → Consultant Review → Submission Authorization → Job Application → Follow-up → Interview → Offer → Placement → Extension or Redeployment.
Separate: job opportunity; client requirement; opportunity match; candidate submission; job application; interview; offer; placement. Implement state transitions, ownership, approvals, status history, notifications.
Marketing Specialist workflow: open assigned talent; review resumes; search job streams; match consultants; assign opportunities; request approvals; submit through authorized supported channels; follow up; coordinate interviews; record results; track placements.
Consultant workflow: review assigned opportunities; accept/decline; approve submissions where required; apply directly; track status; prepare for interviews; attend interviews; record feedback; review offers; track placements.
Prevent duplicate submissions where applicable. Respect external job-board terms and authorization requirements.

## 13. CLIENT & PLACEMENT MANAGEMENT
Clients; end clients; staffing vendors; contacts; requirements; submissions; interviews; offers; placements; engagement extensions; redeployment. Placement distinct from application. Model client/vendor relationships properly.

## 14. CONSULTANT-BASED ENTERPRISE SUBSCRIPTIONS (core V2 business requirement)
Enterprise subscriptions are based on consultants and the individual paid features selected for them. Org Admin, HR, Finance, Marketing employees do not automatically consume paid consultant licenses solely because they have accounts. Organization administration modules require separate organization-level entitlements if commercially restricted.
Consultant License Price = Base Recurring License Price + Sum of Selected Recurring Feature Prices = Configured Consultant Recurring Price; then apply contracted discounts and other pricing adjustments. Taxes, prorations, credits, one-time fees, and metered overages separately calculated where applicable. Each consultant may have a different feature configuration and recurring price.
Example: A = Base + AI Job Matching + AI Resume Tailoring; B = Base + Email Tracking + Marketing-Assisted Applications + Interview Prep; C = Base only; D = no paid license. Support all. Do not limit enterprise subscriptions to fixed Basic/Pro/Premium packages.

## 15. FEATURE CATALOG
Platform-controlled feature catalog. Potential features: AI Job Matching; AI Resume Tailoring; Resume Optimization; Advanced Resume Versions; Email Application Monitoring; Marketing-Assisted Applications; AI Interview Preparation; Advanced Job Alerts; Application Analytics; Approved Job Application Automation; Additional AI Credits.
Each feature: stable feature key; name; description; category; recurring price; currency; billing period; usage allowance; usage unit; dependencies; eligibility; effective dates; catalog version; active/inactive status. Separate feature definition from pricing. Immutable or effective-dated price versions. Do not silently change existing contracted prices.

## 16. BASE LICENSE & OPTIONAL FEATURES
Each paid consultant license has a required base license providing core consultant functionality. Debate base vs paid add-ons. Org Admin enables individually selectable features. Optional presets (Job Search Essentials; Resume & AI Support; Talent Marketing Support; Interview Support; Full Career Support) are configuration shortcuts, not mandatory packages.
Feature dependencies: distinguish technical dependency; commercial purchasing dependency; integration prerequisite; permission or consent requirement. If enabling a feature requires another paid feature, show full cost impact and obtain confirmation. Never silently add paid features.

## 17. PRICING & CONTRACT MANAGEMENT
Platform Admin manages: base prices; optional feature prices; catalog versions; currencies; billing intervals; promotions; discounts; organization-specific contracts; negotiated rates; volume discounts; feature presets; usage allowances.
Proposed precedence: Standard Catalog Price → Applicable Contract Override → Eligible Discount → Effective Price. Define precise precedence; avoid double discounts. Accurate monetary types. Pricing history and invoice snapshots. Org Admins configure purchased features but cannot change commercial pricing.

## 18. LICENSE ASSIGNMENT
Assign license; select features; remove features; upgrade; schedule downgrade; suspend where permitted; cancel; reactivate; bulk assign; bulk modify; view history; view pricing impact. Tie consultant licenses to the organization-specific consultant membership, not the global user. Effective dates. A consultant's license is isolated from their memberships in other organizations.

## 19. SUBSCRIPTION IMPACT PREVIEW
Before committing billing changes show: current base fee; current selected features; proposed features; proposed removals; contract discounts; current recurring total; proposed recurring total; difference; effective date; estimated proration; estimated next invoice; taxes where supported. Backend calculates authoritative totals; frontend estimates never determine charges. Use price-version validation or expiring quotes to prevent stale pricing.

## 20. CENTRALIZED FEATURE ENTITLEMENTS
Entitlement evaluation service validates: 1 organization 2 consultant 3 active license 4 selected feature 5 effective entitlement 6 current usage allowance 7 acting employee permission 8 assignment relationship 9 consultant consent where required 10 subscription state.
Marketer acting on behalf of consultant — e.g. Sarah (assigned to Anika) invokes AI Resume Tailoring for Anika; permitted only if Sarah may act for Anika, Acme allows the feature, Anika has the feature, usage is available, required approvals are satisfied. Record Actor: Sarah; Beneficiary: Anika; Organization: Acme; Feature: AI Resume Tailoring. Usage generally charged against Anika's consultant entitlement unless the commercial model defines a shared org allowance.

## 21. USAGE METERING
Included usage limits and future overages (AI resume generations; AI interview sessions; matching requests; email monitoring connections; application automation operations). Auditable usage ledger: organization; consultant; acting user; feature; quantity; unit; timestamp; billing period; idempotency key; status. Prevent double consumption on retries. Reserve usage for async tasks and release unused reservations after failures. Debate individual quotas vs organization-pooled allowances.

## 22. EXISTING PERSONAL SUBSCRIPTIONS
Preserve current personal subscriptions. A global user may have a personal subscription, an Acme membership, an Acme consultant license, another org membership. Keep billing ownership separate. Personal entitlements apply to personal workspaces; org-funded entitlements to the corresponding org workspace. Never combine benefits across workspaces automatically. Never cancel a personal subscription when a user joins an enterprise. Regression tests.

## 23. BILLING ENGINE
Audit and extend the existing payment-provider integration. Support: org billing account; consultant license charges; feature-based recurring charges; billing aggregation; discounts; contract pricing; invoices; renewals; prorations; credits; refunds; cancellation; payment failures; grace periods; webhooks; reconciliation. Prefer one organization-level billing relationship over a separate external subscription per consultant unless technical constraints justify otherwise. Keep consultant license configuration inside Kiwiply. Aggregate identical charges. Precise monetary calculations; idempotent operations.

## 24. ENTERPRISE BILLING PAGES
- Subscription Overview: total consultants; licensed; unlicensed; current monthly recurring amount; estimated next invoice; billing status; feature usage; pending changes.
- Consultant Licenses: consultant image; name; assigned marketer; active features; license status; recurring price; next effective change; configure action; filters, search, sorting, bulk actions.
- Configure Consultant License: consultant summary; base license; individual feature selection; feature prices; dependencies; allowances; current price; proposed price; billing impact; confirmation.
- Billing & Invoices: billing account; contracts; payment methods; invoices; credits; payment history.
- Feature Usage: by consultant; by feature; by team; remaining allowances; historical consumption.
- Platform Pricing Admin: feature catalog; base prices; feature prices; versions; discounts; contracts; pricing publication; change history.

## 25. DASHBOARD & PAGE INVENTORY (permission-driven navigation; refine against actual reusable functionality)
- Organization Admin: Home; Employees; Invitations; Teams; Departments; Roles & Permissions; Consultants; Resumes; Marketing Assignments; Jobs; Applications; Interviews; Clients; Placements; Subscription Overview; Consultant Licenses; Billing; Feature Usage; HR; Finance; Reports; Organization Branding; Domains; Integrations; Audit Logs; Settings. Default home: Org Admin Dashboard. My Profile via avatar menu.
- Talent Marketing Specialist: Home; My Assigned Talent; Resumes; Job Discovery; Job Matches; Opportunities; Submissions; Applications; Interviews; Follow-ups; Tasks; Activities; Performance.
- Marketing Manager: Home; Team; Consultant Assignments; Pipeline; Approvals; Workload; Escalations; Reports.
- Consultant: Home; My Profile; My Resumes; Job Matches; Assigned Opportunities; Applications; Interviews; AI Interview Preparation; Offers; Placements; My Available Features; Notifications; Settings. (Consultant career profile separate from basic account identity.)
- HR: Home; Employees; Onboarding; Documents; Compliance; Lifecycle; Offboarding; Reports.
- Finance: Home; Consultant Subscriptions; Billing; Invoices; Placements; Timesheets; Approvals; Payments; Reports.
- Account Manager: Home; Clients; Contacts; Requirements; Submissions; Interviews; Offers; Placements.
- Kiwiply Platform Admin: Platform Home; Organizations; Tenant Provisioning; Domains; Subscriptions; Feature Catalog; Pricing; Commercial Agreements; Integrations; Platform Analytics; Security; Tenant Health; Settings.

## 26. UX DESIGN STANDARDS
Preserve current Kiwiply visual identity. Gen Z / future Gen Alpha friendly; professional enough for enterprises; clean and modern; readable; not overcrowded; responsive; accessible; consistent across roles. Use compact contextual actions; modern icons; small character illustrations; clear status badges; search and filters; scalable grid/list layouts; comfortable spacing; natural scrolling; consistent header/sidebar. No unnecessarily large edit buttons. Don't compress all dashboard data into one viewport. Sidebars viewport-height and independently scrollable where required. Reuse components across roles.

## 27. ARCHITECTURE DEBATE — REQUIRED
Perspectives: SaaS Architect; Security Architect; Billing Architect; Product Owner; UX Director; Engineering Lead; Database Architect.
Debate: 1 tenant isolation model; 2 custom-domain provider; 3 hostname resolution; 4 custom-domain authentication; 5 multi-role permissions; 6 basic profile vs consultant profile; 7 unified vs role-specific dashboards; 8 consultant-marketer relationships; 9 resume ownership; 10 application authorization; 11 client/vendor modeling; 12 base license plus add-ons; 13 feature catalog versioning; 14 price overrides; 15 volume discounts; 16 usage credits; 17 organization billing aggregation; 18 existing subscription compatibility; 19 mid-cycle changes; 20 billing-provider limitations; 21 feature entitlement enforcement; 22 scalability; 23 migration strategy.
For each: problem; options; advantages; disadvantages; security impact; financial impact; implementation complexity; migration risk; recommendation; final decision. Don't debate endlessly; make safe, justified, reversible decisions and proceed.

## 28. TECHNICAL DOCUMENTATION — under `docs/enterprise-v2/`
Product Vision; Existing Architecture Audit; Architecture Debate; ADRs; Multi-Tenant Design; Domain Routing; Branding and Login; Identity; Roles and Permissions; User Profiles; Organization Administration; Employees and Teams; Consultant Assignments; Resume Management; Talent Marketing; Applications; Interviews; Clients; Placements; HR and Finance; Existing Subscription Audit; Consultant License Model; Feature Catalog; Pricing Calculation; Contract Discounts; Entitlements; Usage Metering; Billing Provider Integration; Subscription Lifecycle; Database Design; API Specifications; UI/UX Page Inventory; Security & Threat Model; Testing Plan; Deployment Plan; Agile Stories; Roadmap; Progress Tracker. Follow existing repo documentation conventions; keep docs synchronized with code.

## 29. PHASED IMPLEMENTATION (small vertical slices)
- Phase 0 — Repository Audit & Architecture Debate: current architecture review; subscription audit; architecture decisions; data model; domain boundaries; security design; full backlog; development branch and feature flags.
- Phase 1 — Enterprise Tenant Foundation: organization entity; tenant resolution; organization membership; tenant-aware authorization; invitation framework; tenant isolation tests.
- Phase 2 — Branded Login & Dashboard Shell: organization branding; login theme; shared Kiwiply character; organization subdomain; dashboard shell; role-aware routing; user profile access.
- Phase 3 — Custom Domains: domain management; DNS verification; certificate provisioning; custom-domain login; primary domain; domain lifecycle; security tests.
- Phase 4 — Roles & Employees: roles; permissions; departments; teams; employee invitations; employee lifecycle; consultant assignments.
- Phase 5 — Subscription Foundation: existing subscription compatibility; base license; feature catalog; feature prices; license assignment; entitlement evaluation; pricing engine.
- Phase 6 — Billing & License UI: consultant licenses; configure license; feature selection; price impact preview; organization billing; usage metering; invoice integration; subscription lifecycle.
- Phase 7 — Consultant & Resume Management: consultant directory; profiles; resume visibility; resume versions; approvals; marketing readiness.
- Phase 8 — Talent Marketing: assigned talent; job discovery; AI matching; opportunity assignments; submission pipeline; follow-ups; activity tracking.
- Phase 9 — Consultant Applications & Interviews: consultant dashboard; assigned jobs; application tracking; interview coordination; AI preparation; offers.
- Phase 10 — Clients & Placements: client records; requirements; vendor relationships; placement lifecycle; extensions and redeployment.
- Phase 11 — HR & Finance: HR; timesheets; approvals; placement finance; invoicing and reporting.
- Phase 12 — Advanced Analytics & Enterprise Features: advanced analytics; automation; integrations; SSO; advanced reporting; operational improvements.
Adjust sequencing when repository dependencies require it. Implement tenant isolation and entitlement enforcement before releasing protected features.

## 30. AGILE STORY MANAGEMENT
Every story: Story ID; Epic; Title; Persona; Objective; Functional requirements; UI requirements; Backend requirements; Database changes; APIs; Permissions; Feature entitlements; Dependencies; Acceptance criteria; Test cases; Complexity; Definition of Done.
Statuses: Not Started → In Progress → Code Complete → Testing → Completed / Blocked. Maintain an implementation progress tracker. Every completed story must reference actual code and tests.

## 31. DEFINITION OF DONE
Functionality works; backend validates permissions; tenant isolation enforced; entitlement checks work; UI follows Kiwiply design standards; error/loading/empty states handled; automated tests pass; migrations safe; documentation updated; no regression in existing personal functionality.
Billing stories additionally: correct monetary calculations; idempotent changes; valid price versions; historical billing traceability; reconciliation; existing subscription regression tests.

## 32. REQUIRED END-TO-END TEST SCENARIOS
- A Organization Admin: Acme onboarded → configures branding → custom domain verified → admin opens careers.acme.com → sees Acme-branded login → signs in → lands directly on Org Admin Dashboard → opens basic user profile from avatar → opens separate organization settings → manages employees and permissions.
- B Multi-Role User: Sarah has Org Admin + Marketing Manager → logs in once → primary dashboard Org Admin → switches to Marketing workspace → permissions enforced in both → profile remains the same.
- C Consultant License: Acme selects Anika → activates base license → selects AI Job Matching → selects AI Resume Tailoring → individual prices displayed → total calculated → backend validates price → admin confirms → Anika receives effective entitlements → unauthorized features remain unavailable.
- D Marketing Specialist: Sarah assigned Anika → opens Anika's profile → reviews authorized resume → finds matching jobs → assigns an opportunity → Anika approves → Sarah submits through an authorized workflow → both track progress → interview scheduled → outcome and placement recorded.
- E Personal Subscription Compatibility: Anika has a personal account → joins Acme → Acme assigns enterprise licenses → personal subscription unchanged → enterprise features only in the authorized Acme workspace → billing separate.
- F Tenant Security: Acme and Beta exist on the shared deployment → different branding → different subscriptions → Acme cannot access Beta resumes → nor Beta billing → unknown enterprise routes don't expose personal or platform-admin screens → direct unauthorized API requests rejected.

## 33. EXECUTION INSTRUCTIONS
1 AUDIT (actual codebase, subscriptions, architecture, deployment) → 2 DEBATE (challenge designs, alternatives, ADRs) → 3 DESIGN (domain models, schemas, APIs, state machines, permission models, pricing calculations, UX architecture) → 4 PLAN (phased roadmap, Agile stories, dependencies, acceptance criteria, progress tracker) → 5 IMPLEMENT (foundation first, small testable slices) → 6 VERIFY (functionality, authorization, tenant isolation, subscription calculations, backward compatibility) → 7 DOCUMENT (update design docs and progress after each phase).
Do not stop permanently at planning. Proceed with implementation where the design is sufficiently established and changes are safe. Do not deploy to production, initiate real charges, or perform irreversible customer-data migrations without appropriate authorization.

FINAL OBJECTIVE: production-capable, secure, configurable, multi-tenant SaaS: one shared deployment; org custom domains; branded enterprise login; shared Kiwiply character; dedicated Org Admin Dashboard; one basic user profile per member; multi-role permission-based workspaces; employee/department/team management; consultant-marketer assignments; resume and profile management; job discovery and AI matching; application and interview coordination; client placement workflows; HR and Finance; consultant-based subscriptions; individually selectable paid features; base + add-on pricing; contract pricing and discounts; accurate billing; usage metering and entitlement enforcement; full backward compatibility with personal subscriptions; secure tenant isolation; comprehensive documentation and Agile stories; incremental, testable implementation. Every organization should feel it is using its own professional application, while Kiwiply operates one shared, scalable platform.
