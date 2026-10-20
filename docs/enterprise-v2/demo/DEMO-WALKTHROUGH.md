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
| The job Rahul saves live (Adobe, on Workday) | `http://adobe.wd5.myworkdayjobs.localhost:3399/en-US/external_experienced/job/San-Jose/Senior-Backend-Engineer---Cloud-Platform_R168509` |

## Job postings in the demo
Employers on five different hiring systems. Figma, Ramp, Rover and Robinhood are the real, live postings. **Adobe (Workday) and ServiceNow
(SmartRecruiters) are local copies of those sites** (Adobe's real Workday pages, logo and job text; ServiceNow's real posting and a
SmartRecruiters application page), because the real ones can't be autofilled on stage: SmartRecruiters blocks automated browsers with a
bot check, and Workday's real form is five pages. On the copies Autopilot fills **every page, up to the last one before Submit**.
The setup saves Figma, Ramp, Rover, Robinhood and ServiceNow for Anika; Rahul saves Adobe live in Act 2.

| Employer · job | Hiring system | What it shows |
|---|---|---|
| Figma · Data Platform Engineer | Greenhouse | Autopilot fills every required question (13 fields, AI-written answers, the AI picks "worked for Figma before? No") |
| Ramp · Software Engineer, Data Platform | Ashby | Autopilot fills all but one ("Where do you plan to work from?"); best resume + Check fit |
| Rover · Staff Engineer, Commerce Platform | Lever | Autopilot fills 11 incl. salary, sponsorship, relocation; left: "Who referred you?" and the certify box |
| Adobe · Senior Backend Engineer - Cloud Platform | Workday (local copy) | Rahul's live save; best resume 88% + Check fit; Autopilot fills all 5 Workday pages (My Information, My Experience with 3 jobs, 2 degrees, skills, résumé and links, Application Questions, Voluntary Disclosures) and stops on **Review** with Submit untouched: 53 of 53 fields |
| Robinhood · Staff Software Engineer, Backend Platform | Greenhouse | Spare: fills 6 fields |
| ServiceNow · Senior Staff Platform Engineer | SmartRecruiters (local copy) | Autopilot fills both pages (application + screening questions, résumé attached) and stops at Submit: 14 of 14 fields |

**Never press Submit on Figma, Ramp, Rover or Robinhood: they are real employers.** Submit on the local pages (Adobe, ServiceNow,
TechCorp, Northbeam) sends nothing anywhere; the practice posting for the Submit moment is **Cloud Engineer at TechCorp** (a local page
in Greenhouse's own look). Postings close: run the setup the morning of the demo, it flags any link that stopped answering.

## One-time setup in your Chrome (10 minutes)
1. Two Chrome profiles: **Anika** and **Rahul**.
2. In each: `chrome://extensions` → **Developer mode** → **Load unpacked** → `job-autofill/.output/chrome-mv3-dev-aaruna-technologies` → pin it.
   Loaded it before? Press **Reload** on its card (it must say version **0.71.1**).
3. In each: sign in as that person → account menu (top right) → **Connect extension** → **Connect** → "Extension connected".
4. Anika only: extension gear → Settings → turn on **Use Aaruna AI** and the **I consent** switch.
5. Anika only: open the drawer once on any page so it pulls her profile; **Choose a resume** should list "Anika Rao - Senior
   Platform…" with a **PDF** badge (the extension fetches the PDF from her account by itself). The resume field of every form then
   fills itself. Optional show-off: **Upload** → `Anika-Rao-Resume.pdf` (Desktop) → **Save to my resumes** → the review shows 32 skills,
   3 roles, 2 schools → **Save**.

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
3. **Tailor, then assign** (the job her resume doesn't fit yet): **Job Discovery** → search **Northbeam** → **View** on *ML Platform Engineer ·
   Northbeam Media*. The sheet shows **Anika Rao · 58%**, "missing: ML pipelines, Model serving, MLflow, Feature store" → **Tailor Anika's
   resume for this job**. The AI reads the posting and her resume, then lists its suggestions: headline, summary and three bullets reworded
   (old text struck through, new text below, and why), skills reordered, and **Add only if true**: MLflow and Feast are ticked ("Anika
   confirmed on Monday's call"), **Kubeflow** is not ("not on her profile, ask her first"). The score reads **58% → 87%** and the job's
   keywords turn green as changes are kept. Show the honesty beat: tick Kubeflow (90%), then untick it: nothing goes on her resume she
   hasn't done. → **Save as new resume & assign to Anika**. Her original resume is untouched; the new one is hers to approve.
4. **Opportunities**: the jobs on his board (Figma, Ramp, Rover, Adobe, Northbeam, …), waiting for Anika's answer.

## Act 3. Anika applies with Pro and Autopilot (8 min)
1. **Assigned Opportunities**: Rahul's jobs with his notes. **Express Interest** on one; **Need More Info** on another (a question to Rahul).
2. **Pro, before applying**: open the **Adobe** job link (Workday) → click the Aaruna icon → **Best match for this job · 88%** (which
   of her two resumes fits) → **Check fit** (match %, what's missing, what's covered). Ramp works the same way.
3. **Autopilot**: back on Assigned Opportunities. The **Northbeam** row reads "Resume tailored by Rahul · 58% → 87% · **View changes**":
   open it to show what Rahul changed (read-only, with a link to the PDF). Tick **Figma**, **Ramp**, **Adobe**, **ServiceNow** and
   **Northbeam · ML Platform Engineer** (Rover too if you like: every ticked job opens, up to ten)
   → **Prepare selected**. The dialog says Northbeam uses the resume Rahul tailored for it and that **preparing approves it**; the
   other jobs keep her usual resume → **Prepare**.
4. Each job opens in its own tab **already filled**, with the review panel beside the page: Greenhouse, Ashby, Workday, SmartRecruiters
   plus the practice page. The tabs are filled one after another (each comes to the front for its turn), then the Aaruna page comes back.
   **Adobe (Workday)** is the one to show: the extension fills a page, presses Workday's **Next**, fills the next one, and so on through
   all five pages; it stops on **Review** ("Filled 53 of 53 fields across 5 steps · résumé attached") and never presses Submit. Scroll
   the Review page: every job with its dates, both degrees, the skills, the résumé, the answers, the voluntary disclosures ("I do not
   wish to answer"). **ServiceNow** does the same over its two pages. The panel reads "Filled N of M fields · résumé attached", lists every answer (name, contact,
   links, work authorization, salary; on Figma an **AI-written answer** to its open question) and, under **Still needs you**, the
   fields only she can do. Figma and Ramp are complete; Rover asks who referred her and leaves the certify box: say plainly that the
   extension never ticks an attestation for her: she does. Press **Done** to close the panel; the small card bottom-left keeps the list.
5. On **Northbeam** (a practice page, so Submit is safe): the review panel's **Résumé file** row reads "anika_rao_resume.pdf" and, under it,
   **Anika Rao - ML Platform Engineer (Northbeam Media)**: the tailored resume. Every upload is renamed first_last_resume.pdf for the employer.
   She presses **Submit Application**; back on the Aaruna site the progress panel says **Submitted**, and **My Resumes** now lists the
   tailored resume. Close the Figma, Ramp and Rover tabs without submitting. (TechCorp · Cloud Engineer still works as the practice page.)

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
- Don't press **Submit** on a real employer's site (Figma, Ramp, Rover, Robinhood). Adobe, ServiceNow, TechCorp and Northbeam are local copies: Submit there is safe but marks the job submitted, so leave Adobe and ServiceNow on their last page.
- The Adobe and ServiceNow copies need the demo stand-in server running (`node web/scripts/demo-ats-server.mjs`, port 3399) and the extension built with their addresses (DEMO-PLAN.md section 17).
- **Check now** works once a minute.

## Before the demo: clean data
Stop the API → fresh database → start it → `node web/scripts/demo-setup.mjs` must say `0 failed` (DEMO-PLAN.md section 7).
The tailor story alone (its job and Anika's tailored resume, archived until she prepares): `node web/scripts/demo-tailor-setup.mjs`. A rehearsal
leaves Anika assigned to Northbeam; only a fresh database removes that.
A "LINK DID NOT ANSWER" line means that posting closed: swap it in `web/scripts/demo-real-jobs.mjs`. Then reconnect the extension
in both Chrome profiles.
