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
| A job posting for Rahul to save | `http://jobs.localhost:3399/greenhouse/brightwave-systems/101?t=Cloud%20Platform%20Engineer&c=Brightwave%20Systems` |

## One-time setup in your Chrome (10 minutes)
1. Two Chrome profiles: **Anika** and **Rahul**.
2. In each: `chrome://extensions` → **Developer mode** → **Load unpacked** → `job-autofill/.output/chrome-mv3-dev-aaruna-technologies` → pin it.
3. In each: sign in as that person → account menu (top right) → **Connect extension** → **Connect** → "Extension connected".
4. Anika only: extension gear → Settings → turn on **Use Kiwiply AI** and the **I consent** switch.
5. Anika only (recommended): in the extension drawer press **Upload** and pick `Anika-Rao-Resume.pdf` (Desktop). From then on the
   resume field of every form fills itself.

## Act 1. Priya sets the company up (5 min)
1. **Dashboard**: consultants, placements, applications at a glance.
2. **Consultants** → open **Anika Rao** → **License**: her paid add-ons (Autopilot prepare, Inbox tracking).
3. **Marketing Assignments**: Anika and Vikram are looked after by **Rahul Mehta**; show assigning two people and Undo.
4. **Settings** → *Prepare selected openings*: the company switched Autopilot on and set the daily/monthly limits.
5. (quick) **Branding**: Aaruna's logo and colours on every page.

## Act 2. Rahul finds work for Anika (5 min)
1. **Job Discovery**: open a job → **Assign** → Anika Rao.
2. In his Chrome: open the job posting address above → click the Aaruna icon → **Save for consultant** → note
   ("Strong fit for your cloud work") → tick **Anika Rao** → **Save** → "Sent to Anika Rao".
3. **Opportunities**: both jobs on his board, waiting for Anika's answer.

## Act 3. Anika applies with Pro and Autopilot (8 min)
1. **Assigned Opportunities**: Rahul's jobs with his notes. **Express Interest** on one; **Need More Info** on another (a question to Rahul).
2. **Pro, before applying**: open the job link of one job → click the Aaruna icon → **Best match for this job · 88%** (which of her
   resumes fits) → **Check fit** (match %, what's missing, what's covered).
3. **Autopilot**: back on Assigned Opportunities → tick 2-3 jobs → **Prepare selected** → confirm ("nothing is submitted for you").
4. Each job opens in its own tab with the review panel: name, contact, links, work authorization, and an **AI-written answer** to
   "Why would you like to work at …?". **Fill selected**.
5. She reads the form and presses the employer's own **Submit Application**. Back on Kiwiply the progress panel says **Submitted**.

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
- Don't press **Submit** on any real employer's site.
- **Check now** works once a minute.

## Before the demo: clean data
Stop the API → fresh database → start it → `node web/scripts/demo-setup.mjs` must say `0 failed` (DEMO-PLAN.md section 7).
Then reconnect the extension in both Chrome profiles.
