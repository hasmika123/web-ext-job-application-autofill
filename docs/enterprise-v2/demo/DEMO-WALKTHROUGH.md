# Demo walkthrough: Aaruna Technologies

One story, three people: the **admin** sets the company up, the **marketer** finds work, the **consultant** applies with Autopilot and
her email keeps the board current, then the marketer and the admin see the results. About 30 minutes; the (quick) steps can be skipped.

| Person | Role | Sign in as |
|---|---|---|
| **Priya Sharma** | Org Admin (runs the consultancy) | Demo accounts → Priya Sharma |
| **Rahul Mehta** | Marketing Specialist (finds jobs for consultants) | Demo accounts → Rahul Mehta |
| **Anika Rao** | Consultant (Pro + Autopilot add-ons) | Demo accounts → Anika Rao |

## Addresses

| What | Address |
|---|---|
| The app | `http://aaruna.localhost:3200/login` → **Demo accounts** tab on the left edge |
| Anika's Gmail (presenter's window) | `http://mail.localhost:3399` |
| The job Rahul saves live (Adobe, on Workday) | `https://adobe.wd5.myworkdayjobs.com/external_experienced/job/San-Jose/Senior-Backend-Engineer---Cloud-Platform_R168509` |

## Real job postings in the demo
Real, live employers on five different hiring systems. The setup saves five of them for Anika; Rahul saves Adobe live in Act 2.

| Employer · job | Hiring system | What it shows |
|---|---|---|
| Figma · Data Platform Engineer | Greenhouse | Autopilot fills every required question (13 fields, AI-written answers, the AI picks "worked for Figma before? No") |
| Ramp · Software Engineer, Data Platform | Ashby | Autopilot fills all but one ("Where do you plan to work from?"); best resume + Check fit |
| Rover · Staff Engineer, Commerce Platform | Lever | Autopilot fills 11 incl. salary, sponsorship, relocation; left: "Who referred you?" and the certify box |
| Adobe · Senior Backend Engineer - Cloud Platform | Workday | Rahul's live save; best resume + Check fit (the form itself needs a Workday sign-in) |
| Robinhood · Staff Software Engineer, Backend Platform | Greenhouse | Spare: fills 6 fields |
| ServiceNow · Senior Staff Platform Engineer | SmartRecruiters | On the list for variety (the form needs their sign-in) |

**Never press Submit on these pages: they are real employers.** The practice posting for the Submit moment is **Cloud Engineer at TechCorp**
(a local page that looks like Greenhouse). Postings close: run the setup the morning of the demo, it flags any link that stopped answering.

## One-time setup in your Chrome (10 minutes)
1. Two Chrome profiles: **Anika** and **Rahul**.
2. In each: `chrome://extensions` → **Developer mode** → **Load unpacked** → `job-autofill/.output/chrome-mv3-dev-aaruna-technologies` → pin it.
   Loaded it before? Press **Reload** on its card (it must say version **0.69.3**).
3. In each: sign in as that person → account menu (top right) → **Connect extension** → **Connect** → "Extension connected".
4. Anika only: extension gear → Settings → turn on **Use Aaruna AI** and the **I consent** switch.
5. Anika only: in the extension drawer press **Upload** → pick `Anika-Rao-Resume.pdf` (Desktop) → **Save to my resumes** → the review
   shows 32 skills, 3 roles, 2 schools → **Save**. Pick it in **Choose a resume**. From then on the resume field of every form fills itself.

## Act 1. Priya sets the company up (5 min)
1. **Dashboard**: consultants, placements, applications at a glance.
2. **Consultants** → open **Anika Rao** → **License**: her paid add-ons (Autopilot prepare, Inbox tracking).
3. **Marketing Assignments**: Anika and Vikram are looked after by **Rahul Mehta** (the setup puts Anika with him); show assigning two people and Undo.
4. **Settings** → *Prepare selected openings*: the company switched Autopilot on and set the daily/monthly limits.
5. (quick) **Branding**: Aaruna's logo and colours on every page.

## Act 2. Rahul finds work for Anika (5 min)
1. **Job Discovery**: open a job → **Assign** → Anika Rao.
2. In his Chrome: open the **Adobe** posting (Workday, address above) → click the Aaruna icon → **Save for consultant**. The title is
   read from the page; shorten the employer from "ADUS-Adobe Inc." to **Adobe** → note ("Strong fit for your cloud platform work")
   → tick **Anika Rao** → **Save** → "Sent to Anika Rao".
3. **Opportunities**: the jobs on his board (Figma, Ramp, Rover, Adobe, …), waiting for Anika's answer.

## Act 3. Anika applies with Pro and Autopilot (8 min)
1. **Assigned Opportunities**: Rahul's jobs with his notes. **Express Interest** on one; **Need More Info** on another (a question to Rahul).
2. **Pro, before applying**: open the **Adobe** job link (Workday) → click the Aaruna icon → **Best match for this job · 88%** (which
   of her two resumes fits) → **Check fit** (match %, what's missing, what's covered). Ramp works the same way.
3. **Autopilot**: back on Assigned Opportunities → tick **Figma**, **Ramp**, **Rover** and **TechCorp · Cloud Engineer** → **Prepare selected** →
   confirm ("nothing is submitted for you").
4. Each job opens in its own tab with the review panel: three real hiring systems (Greenhouse, Ashby, Lever) plus the practice page.
   Name, contact, links, work authorization, and on Figma an **AI-written answer** to its open question.
   **Fill selected** on each. Figma is complete; Ramp asks one question (where she plans to work from); Rover asks who referred her and
   leaves the certify box: say plainly that the extension never ticks an attestation for her: she does.
5. On **TechCorp** only (practice page) she presses **Submit Application**; back on the Aaruna site the progress panel says **Submitted**.
   Close the Figma, Ramp and Rover tabs without submitting.

## Act 4. Anika's email keeps the board current (5 min)
1. **Inbox** → `anika.rao.jobs@gmail.com`, app password: any 16 letters → **Check and connect**. A few seconds later Northwind Labs
   reads **Offer** "from your inbox", and two jobs she never tracked are offered under *Found in your mail*.
2. Switch to the Gmail window → **Demo: send email** (bottom right, or press **N**) → *Orbit Freight invites Anika to a phone screen*.
3. Back on Inbox → **Check now** → Orbit Freight moves to **Interview** with the day and time.
4. A minute later: send *Cedar Analytics turns the application down* → **Check now** → it waits under **Needs your review** →
   **Accept** → Rejected → **Undo** (nothing risky happens on its own).

## Act 5. Rahul and Priya see the results (3 min)
1. Rahul → **Opportunities**: "is interested", "asked a question", "says they applied" → answer her question.
2. Rahul → (quick) **Interviews**, **Follow-ups**.
3. Priya → **Applications** and **Audit Logs**: who did what, when. (quick) **Reports**.

## (quick) More to show if there is time
Anika: **Interview Prep**, **Offers** (compare, negotiate), **My Resumes** (builder). Priya: **Roles & Permissions**, **Employees**.

## Don'ts
- Don't click the 8 admin menu items marked **Soon** (Billing, HR, …).
- Don't press **Submit** on any real employer's site (Figma, Ramp, Rover, Robinhood, Adobe, ServiceNow). Submit only on the TechCorp practice page.
- **Check now** works once a minute.

## Before the demo: clean data
Stop the API → fresh database → start it → `node web/scripts/demo-setup.mjs` must say `0 failed` (DEMO-PLAN.md section 7).
A "LINK DID NOT ANSWER" line means that posting closed: swap it in `web/scripts/demo-real-jobs.mjs`. Then reconnect the extension
in both Chrome profiles.
