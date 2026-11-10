# App v3 — second-generation signed-in app pages (branch `version2`)

**Status:** design locked 2026-10-11 (Fable) from four boards the user pasted inline (not on
disk). Rule agreed with the user: **build the richest variant of each page**, merging extras from
the other variants where they fit. This spec IS the board for the build agents. Companion:
`web/APP-V2-SPEC.md` (§1 rules, §2 primitives — all still apply; `components/app-v2/common/*`
exists and must be reused/extended, never re-implemented).

## 0. What changes vs. app v2

- **Sidebar** shrinks to 13 items (below) and gains a **"Free Plan — Upgrade for more power"**
  card (crown icon, lime "Upgrade →") instead of the big mascot card; the mascot moves into the
  page heroes.
- **Every page gets a soft hero band** (pale lime→blue wash, rounded 20px, 120–150px tall) with
  the title, one-line subtitle, and a mascot (or illustration) at the right, often with a small
  handwritten note.
- New pages: **My Profiles**, **AI Assistant**, **Job Alerts**, **Interview Prep**, **Messages**,
  **Explore**, **Analytics**. Rebuilt pages: **Dashboard**, **Job Search**, **Applications**,
  **Resume Builder**, **Saved Jobs**, **Settings**.
- Old v2 routes keep working as redirects: `/ai-apply` → `/jobs` (AI Apply is folded into the Job
  Search hero + AI Assistant), `/interviews` → `/interview-prep`, `/resume` → `/resume-builder`,
  `/ai-tools` → `/assistant`, `/insights` → `/analytics`, `/companies` and `/networking` and
  `/learning` → `/explore`, `/profile` → `/profiles`, `/board` → `/applications`, `/matches` →
  `/jobs`. Keep the old page components in the tree (unused) until QA deletes them.

## 1. Shell (every board)

- **Sidebar** 220px white: logo; nav with 18px icons and labels: Dashboard `/dashboard` ·
  Job Search `/jobs` · Applications `/applications` · My Profiles `/profiles` · AI Assistant
  `/assistant` · Job Alerts `/alerts` · Resume Builder `/resume-builder` · Interview Prep
  `/interview-prep` · Messages `/messages` (red unread dot) · Saved Jobs `/saved` · Explore
  `/explore` · Analytics `/analytics` · Settings `/settings`. Active = blue-soft pill
  (`#E8F0FF`) with blue text (`#1E6FF5`) and bold label (the boards use blue for the individual
  app's active state — update the nav-active tokens accordingly; keep lime for CTAs).
- **Plan card** at the sidebar bottom: crown icon (amber), "Free Plan" bold, "Upgrade for more
  power" muted, lime pill "Upgrade →" → `/pricing`. On Pro: "Pro Plan" + "Manage" → `/settings#billing`.
- **Top bar** 64px: search "Search for jobs, companies, or skills..." (max 560px); right: bell with
  red dot, avatar initials + "Hi, <First>" + chevron (menu: Profile, Settings, Kiwiply for
  Organizations → `/org`, Sign out).
- Responsive per APP-V2-SPEC §1.6 (drawer < 1024, stacked rails < 1280, cards < 768).

## 2. Pages — richest variant, transcribed

### 2.1 Dashboard `/dashboard`
Hero band: "Good morning, Priya! 👋" (real first name; time-of-day greeting; the emoji is a
`HandWaveIcon`-free text emoji is NOT allowed — use the `SparkBurst` doodle instead of an emoji) ·
"Let's find your next opportunity." · mascot `mascot-wave-laptop.png` right with handwritten
"You're doing great! Keep going!".
Stat tiles (4): 42 Applications "+12% this week" (blue) · 8 Interviews "2 this week" (green) ·
5 Offers "1 new" (violet) · 18 Saved Jobs "+6 this week" (amber). Real counts from the
applications list when present (fallback sample).
Row 2 (3 columns): **Application Activity** (Last 30 days ▾) grouped bars Applied/Interviews/
Offers for Sep 10 · Sep 17 · Sep 24 · Oct 1 · Oct 8 (values 18/6/2 · 22/7/3 · 15/5/1 · 26/9/4 ·
30/10/5); **Application Status** donut "42 Total": Applied 18 (blue) · Under Review 10 (amber) ·
Interview 8 (green) · Offer 5 (violet) · Rejected 1 (coral); **AI Insights** card (lime-soft):
three rows with check icons — "You have 3 upcoming interviews. Prepare with AI." · "Your resume
is a strong match (85%+) for 5 similar roles." · "Try applying to 8 more high-match jobs this
week." each with ›.
Row 3 (3 columns): **Recent Applications · View All →** (5 rows: Google · Software Engineer ·
Interview · Oct 8; Microsoft · Frontend Developer · Under Review · Oct 6; Airbnb · Software
Engineer · Applied · Oct 4; Amazon · SDE II · Applied · Oct 3; Meta · Frontend Engineer ·
Rejected · Oct 1) — real rows when present; **Recommended for You · See all →** (3 rows with
match pct + bookmark: Google Software Engineer 95% Match; Airbnb Frontend Developer 88%; Amazon
SDE II 86% — Pro matches when present); **Profile Strength**: ring 78% + "Your profile is
strong! Add a few more details to get better matches." + checklist (✓ Resume uploaded · ✓ Skills
added · ✓ Work experience added · ○ Add portfolio or projects · ○ Add target job titles · ○ Add
location preference) — derived from the real profile where possible.
Row 4 (3 columns): **Upcoming Interviews · View all →** (Google · Software Engineer · Oct 10,
10:00 AM · Prep →; Microsoft · Frontend Developer · Oct 14, 2:00 PM · Prep →); **Job Alerts ·
Manage** (Python Developer · 3 new · 2h ago; Frontend Engineer (Remote) · 5 new · 5h ago;
Software Engineer · 12 new · Yesterday); **Quick Actions** 2×2 tiles: Find Jobs · Update
Resume · Practice Interview · Ask AI Assistant.

### 2.2 Job Search `/jobs`
Hero band: "Find your next opportunity" · "Search, filter, and discover jobs that match your
skills and goals." · search input "Search job titles, keywords, or companies..." + lime "Search"
button; quick chips Remote · Full-time · Part-time · Contract · Internship; right: `home-woman.png`
or mascot `mascot-search.png` with "Let AI find better matches for you" card + "Try AI Search".
Body: left **filter rail** (Location: Remote / United States / Other locations + input; Job Type:
Full-time ✓ / Part-time / Contract / Internship; Salary Range: $0 – $300k+ slider; Experience
Level: Entry / Mid / Senior / Lead; Company: search + Google / Microsoft / Amazon / Meta / Airbnb;
"Clear all"), centre **"1,234 jobs found · Sort by: Most relevant ▾"** list, each row: company tile
· title · company · location · type · tags (React, TypeScript, Next.js) · "Posted N days ago" ·
"Save" bookmark · match pct; rows: Software Engineer · Google · Mountain View, CA · Full-time ·
Remote · 95% · 2 days ago; Frontend Developer · Microsoft · Seattle, WA · Full-time · 88% · 3 days;
Software Engineer · Airbnb · Remote · 86% · 3 days; SDE II · Amazon · Seattle, WA · 86% · 2 days;
Frontend Engineer · Meta · Remote · 84% · 1 week. Clicking a row opens the **right detail
panel** (variant 3): Google building photo placeholder (tinted panel), title, company, location,
salary "$140K–$200K", tags, "Apply" (lime) · "Save" · "+", tabs Overview · Requirements · Benefits ·
Company · Reviews, "About the role" paragraph, "What you'll do" bullets (5), "Requirements"
bullets. Pagination 1 2 3 4 5 ›.

### 2.3 Applications `/applications`
Hero: "My Applications" · "Track, manage, and never miss an update." · mascot `mascot-apps.png`.
Tabs: All (42) · Applied (18) · Under Review (10) · Interviews (8) · Offers (5) · Rejected (1).
Toolbar: search "Search applications..." · All Status ▾ · All Companies ▾ · Last 30 days ▾ ·
Filter · Sort by: Recently Updated ▾. Table Job Title · Company · Status · Applied Date · Next
Step · Actions (View · ⋮): Software Engineer · Google · Interview · Oct 8, 2026 · Oct 10, 10:00
AM Video Interview; Frontend Developer · Microsoft · Under Review · Oct 6, 2026 · —; SDE II ·
Amazon · Applied · Oct 3, 2026 · —; Product Engineer · Microsoft · Applied · Oct 2, 2026 · —;
Frontend Engineer · Meta · Rejected · Oct 1, 2026 · —; Full Stack Developer · Netflix · Under
Review · Sep 28, 2026; Software Engineer · Uber · Interview · Sep 25, 2026 · Oct 12, 3:00 PM
Technical; Frontend Developer · Shopify · Applied · Sep 22, 2026; Software Engineer · Tesla ·
Offer · Sep 20, 2026 · Review offer; Backend Engineer · Stripe · Applied · Sep 18, 2026.
Real rows map as in APP-V2-SPEC §3.2 (sample when empty). Mobile: stacked cards.

### 2.4 My Profiles `/profiles`
Hero: "My Profiles" · "Manage your professional information and tailor it for different jobs." ·
mascot `mascot-grad.png`. Tabs: Overview · Personal Info · Work Experience · Education · Skills ·
Projects · Preferences (Overview built; others reuse the existing profile editor sections from
`(app)/profile` where they exist, else "Coming soon" panels).
Overview: left card avatar + "Priya Sharma" (real name) · "Software Engineer" · 📍 San Francisco,
CA · ✉ priya@email.com (real) · "Open to opportunities" green chip · "Edit Profile"; **Profile
completeness** 78% bar + 6 tiles (Personal Info Completed · Work Experience Completed · Education
Completed · Skills Completed · Projects 2/3 · Job Preferences Completed); **Public Profile
Preview** card (name, title, About paragraph, Skills chips, "View Full Profile"); **Multiple
Profiles** row: Software Engineer (Default) · Frontend Developer · Data Scientist · "+ Create
Profile"; **Quick Actions**: Update Resume · Add Experience · Add Skills · Edit Preferences;
**Resume Versions** (Software Engineer Resume (Default) · Frontend Developer Resume · Product
Manager Resume — real resumes when present); **Linked Profiles**: LinkedIn · GitHub · Portfolio
with "Connect"/"Connected" (all "Connect" → toast "Coming soon").

### 2.5 AI Assistant `/assistant`
Hero: "Kiwiply AI Assistant" · "Your personal job search copilot." · mascot `mascot-wave-laptop.png`.
Prompt chips: Improve my resume · Find matching jobs · Prepare for interview · Analyze job
description · Write a cover letter · Negotiate a salary. Chat area: assistant bubble "Hi Priya! 👋
I'm your Kiwiply AI Assistant. I can help you with: Finding the right jobs · Improving your resume
· Writing cover letters · Preparing for interviews · Career advice · And much more! What would you
like help with today?" (text emoji allowed inside chat copy). Right rail "Recent chats": Resume
feedback · Oct 8 · Interview questions · Oct 6 · Job search strategy · Oct 4 · Cover letter help ·
Sep 28 · Salary negotiation · Sep 25. Input "Ask me anything about your job search..." + send.
Sending a message appends it and replies with a canned "Kiwiply AI is coming soon — for now, try
the Pro drafting features on your applications." (no API call).

### 2.6 Job Alerts `/alerts`
Hero: "Job Alerts" · "Get notified about new opportunities that match your preferences." · "+ Create
Alert" (lime). Tabs Active (6) · Paused (1) · Notification Settings. Rows (company-coloured icon,
title, meta line, tags, frequency, channel, toggle, Edit, ⋮): Software Engineer · Remote · Full-time
· $100K+ · React, TypeScript · Daily · Email & In-app · on; Frontend Developer · Remote · US ·
Immediate · Email & In-app · on; Full Stack Engineer · San Francisco, CA · Daily · Email · on; React
Developer · Remote · US · Daily · Email & In-app · on; Product Engineer · New York, NY · Daily ·
In-app · off; Data Engineer · Remote · US · Daily · Email · on. "Create Alert" opens a `Dialog` with
Title, Location, Job type, Frequency, Channels (client state only).

### 2.7 Resume Builder `/resume-builder`
Hero: "Resume Builder" · "Create a professional resume that gets you interviews." · mascot
`mascot-resume.png`. Tabs: Builder · Templates · AI Suggestions · Cover Letter. **Builder**: left
"Sections" list (Personal Info · Professional Summary (active) · Work Experience · Education ·
Skills · Projects · Certifications · Achievements · "+ Add Section"); centre editor card
"Professional Summary" with a toolbar (B I U · lists · align) and the text "Results-driven Software
Engineer with 5+ years of experience building scalable web applications using React, Node.js, and
cloud technologies. Passionate about creating intuitive user experiences and solving complex
problems." + "✦ Generate with AI" button + "Examples" chips (Software Engineer · Frontend Developer ·
Full Stack Developer · Product Engineer); right rail **Templates** thumbnails (Modern (selected) ·
Classic · Professional · Minimal · Creative) and **AI Suggestions** (Make it 30% stronger · Tailor
for this job · Improve bullet points · Fix grammar & tone); footer buttons Preview · Download PDF ·
Save (lime). Edit/Create open the existing `ResumesWorkspace` in a SidePanel (keep v2 wiring).

### 2.8 Interview Prep `/interview-prep`
Hero: "Interview Preparation" · "Practice, learn, and build confidence." · `calendar-note.png`.
Tabs: Practice · Questions · Mock Interviews · My Sessions. **Practice**: "Choose a practice mode"
4 tiles (Quick Practice — 5–10 min targeted questions; Full Mock Interview — 45–60 min, real
interview simulation; Behavioral Questions — STAR method practice; Technical Questions —
Role-specific technical prep); "Select a Role" ▾ Software Engineer · "Select Company (Optional)" ▾
Google · lime "Start Mock Interview"; **Common Question Sets**: Technical Questions (50 questions) ·
Behavioral Questions (40) · System Design (25) · Company Specific (Google, Microsoft, etc.) · Coding
Practice (LeetCode style); **Popular questions** list with "Practice" links: Tell me about
yourself. · Why do you want to work here? · Describe a challenging project you worked on. · How do
you handle tight deadlines? · Explain a technical concept to a non-technical person.; right rail
**Recent Practice Sessions · View all** (Frontend Engineer · Google · 85% · Behavioral Questions ·
System Design 72%) + **Your Progress** ring 70% with 12 Mock Interviews · 48 Questions practiced ·
8 Areas improved. "Start" buttons toast "Coming soon".

### 2.9 Messages `/messages`
Hero: "Messages" · "Communication with recruiters and hiring teams." Two-pane: left conversation
list with search: Sarah Johnson · Google · Recruiter · "Hi Priya, we'd like to schedule an
interview..." · 2m ago (unread dot); Alex Chen · Microsoft · "Thanks for applying..." · 1h ago;
Hiring Team · Airbnb · "Your application is under review" · 3h ago; Priya Patel · Amazon · "We've
moved to the next round..." · 1d ago; Emily Davis · Amazon · "Can you share your availability?";
David Wilson · Meta · "Great to connect!". Right thread (Sarah Johnson · Recruiter at Google):
incoming bubble "Hi Priya, We were impressed with your application and would like to schedule a
30-minute video interview. Are you available this week?" · outgoing lime bubble "Hi Sarah! Thanks
for the opportunity. I'm available on Thursday or Friday. Please let me know what time works best
for you." · incoming "Thursday at 10 AM PST work for you?" · input "Type a message..." + send
(client-state only; a note line "Messaging launches with Inbox v2 — these are examples").

### 2.10 Saved Jobs `/saved`
Hero: "Saved Jobs" · "Keep track of opportunities you're interested in." Tabs All (18) · Recently
Saved · To Apply (12) · Applied (4) · Not Interested (2). Rows: Software Engineer · Google ·
Mountain View, CA · Remote · $140K–$180K · React, TypeScript, Next.js · Saved 2 days ago · "Apply";
Frontend Developer · Microsoft · Redmond, WA · Hybrid · React, Tailwind, JavaScript · 3 days;
Full Stack Engineer · Airbnb · San Francisco, CA · Remote · Node.js, React, AWS · 5 days; Product
Engineer · Stripe · San Francisco, CA · Hybrid · React, Node.js, System Design · 1 week; SDE II ·
Amazon · Seattle, WA · Full-time · Java, AWS · 1 week; Software Engineer · Netflix · Los Gatos, CA
· Python, React, Node.js · 2 weeks. Grid/list toggle, remove, client state (keep v2 behaviour).

### 2.11 Explore `/explore`
Hero: "Explore" · "Discover companies, roles, and career resources." Tabs Companies · Roles ·
Career Paths · Resources. **Popular Companies** 6 tiles (Google 120 jobs · Microsoft 98 · Amazon
134 · Meta 76 · Apple 64 · Netflix 41 — initials/`GoogleIcon`); **Trending Roles** chips (Software
Engineer · Frontend Developer · Product Manager · Data Scientist · DevOps Engineer · UX Designer);
**Career Paths** cards (Frontend → Full Stack → Engineering Manager; Data Analyst → Data Scientist
→ ML Engineer); **Resources** list (Resume writing guide · Interview question bank · Salary
negotiation 101 · Networking playbook) → `/learning` content if any else "Coming soon".

### 2.12 Analytics `/analytics`
Hero: "Your Job Search Analytics" · "Track your progress and insights." Tabs Overview ·
Applications · Interviews · Offers. Stat tiles: 42 Applications ↑12% · 8 Interviews ↑3 · 5 Offers
↑1 · 19% Response rate ↑4%. **Applications over time** (Last 30 days ▾) grouped bars (same data
as 2.1); **Response rate by company** horizontal bars (Google 60% · Microsoft 45% · Amazon 40% ·
Meta 25% · Airbnb 50%); **Status breakdown** donut (2.1 data); **Skills in demand** list (React
92% · TypeScript 88% · Node.js 76% · AWS 64% · Python 58%). Real counts from applications when
present.

### 2.13 Settings `/settings`
Hero: "Settings" · "Manage your account and preferences." Left sub-nav: Account · Notifications ·
Privacy · Job Preferences · Billing · Help & Support. Reuse the existing settings sections and
billing card inside this layout (Account form: avatar, Full name, Email, Phone, Location, Time
zone, "Edit"); keep every existing behaviour (inbox, AI, autofill, delete account, billing).

## 3. Ownership (parallel agents, main-checkout + worktrees as in APP-V2-SPEC §8)

| Phase | Owns | Prefix |
|---|---|---|
| **V3-A shell + dashboard + jobs** (main checkout, goes first; pushes the shell early) | `app-shell/*`, `(app)/layout.tsx`, `app-v2/common/*` (extend only), `app-v2/sample-data.ts`, new `app-v3/{home,jobs}/*`, `(app)/dashboard`, `(app)/jobs/**`, redirects for old routes, `theme-v2.css` tokens (nav-active blue) | `app3a:` |
| **V3-B applications + profiles + saved + settings** (worktree) | `app-v3/{applications,profiles,saved,settings}/*`, `(app)/{applications,profiles,saved,settings}/**` | `app3b:` |
| **V3-C assistant + alerts + messages** (worktree) | `app-v3/{assistant,alerts,messages}/*`, `(app)/{assistant,alerts,messages}/**` | `app3c:` |
| **V3-D resume builder + interview prep + explore + analytics** (worktree) | `app-v3/{resume-builder,interview-prep,explore,analytics}/*`, their routes | `app3d:` |
| **V3-QA** | merge, dedupe, delete unused v2 page folders, route smoke at 1440/1024/375, build, PROGRESS | `app3qa:` |

Sample data: each worktree agent writes `app-v3/sample-data.<phase>.ts` with the SAMPLE comment;
QA merges into one `app-v3/sample-data.ts`. Mascots: reuse `web/public/v2/app/*.png` (poses listed
in §2); no new assets are available — do not reference files that don't exist.
