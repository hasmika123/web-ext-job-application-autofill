# Demo walkthrough: Acme Staffing (2026-10-19)

Click-by-click for the three characters. Everything here was rehearsed on the local demo stack (DEMO-PLAN.md sections 7 and 8).

## Addresses

| What | Address |
|---|---|
| The app (sign in) | `http://acme.localhost:3200/login`, then the **Demo accounts** tab on the left edge |
| The demo Gmail (presenter's window) | `http://mail.localhost:3399` |
| Stand-in job postings | `http://jobs.localhost:3399/greenhouse/<company>/<number>?t=<job title>&c=<Company>` (the assigned jobs link here already) |

## One-time setup in your Chrome (about 10 minutes)

1. Make two Chrome profiles: **Anika** and **Omar** (each extension connects one account).
2. In each profile: open `chrome://extensions`, turn on **Developer mode**, **Load unpacked**, pick
   `job-autofill/.output/chrome-mv3-dev-acme-staffing`. Pin the **Acme Staffing** icon.
3. In each profile: sign in as that person, open the account menu (top right) → **Connect extension** → **Connect**.
   A tab says "Extension connected".
4. Anika only: in the extension, the gear → Settings → turn on **Use Kiwiply AI…** and the **I consent…** switch below it.
5. Anika only, optional: in the drawer press **Upload** and pick her resume PDF once. Then the resume field on job forms fills itself;
   without it, she attaches the file by hand (one click).

## W1. Sarah, Org Admin (5 min)
1. Dashboard: the numbers and the activation checklist.
2. **Consultants**: open a consultant → change **Availability** (it saves itself, with Undo) → **License** shows their add-ons.
3. **Marketing Assignments**: assign two consultants to a marketer → Undo.
4. **Settings** → *Prepare selected openings*: the organization's switch and its daily/monthly limits.
5. **Branding** (quick) and **Audit Logs** (quick).
- Don't click the 8 menu items marked **Soon**.

## W2. Omar, Marketing Specialist (5 min)
1. **Job Discovery**: open a job → **Assign** → Anika.
2. **Opportunities**: the board with every consultant's answers.
3. Extension: open any stand-in posting, for example
   `http://jobs.localhost:3399/greenhouse/brightwave-systems/101?t=Cloud%20Platform%20Engineer&c=Brightwave%20Systems`
   → click the Acme icon → **Save for consultant** → write a note → tick **Anika Rao** → **Save for consultant** → "Sent to Anika Rao".
4. Back in the app: the job is on **Opportunities**.

## W3. Anika, Autopilot (6 min)
1. **Assigned Opportunities**: Omar's jobs with his notes. **Express Interest** on one, **Need More Info** on another.
2. Tick 2-3 openings → **Prepare selected** → read the confirmation ("nothing is submitted for you") → confirm.
3. Each job opens in its own tab with the Acme review panel listing every answer, including an **AI draft** for "Why would you like to work at …?".
4. On one tab: **Fill selected** → the form fills. Attach the resume if asked → press the page's own **Submit Application**.
5. Back on the app tab: the progress panel shows **Submitted** for that job, **Needs input** for any field only she can do.

## W4. Anika, Pro tools (3 min)
1. On a posting tab, click the Acme icon. Under *Choose a resume*: **Best match for this job · 88%**.
2. **Check fit** → match %, what's missing from the resume (e.g. GraphQL), what's already covered.
3. The AI draft from W3 (it reads the question and names the company).
- In the web app, "fit" is the skill-match breakdown on **Job Matches** (rule-based).

## W5. Anika, email (5 min)
1. **Inbox** → Gmail address `kiwiply.demo.anika@gmail.com`, app password: any 16 letters → **Check and connect**.
   A few seconds later: Northwind Labs at **Offer** "from your inbox"; Harbor Cloud and Lumen Health offered under *Found in your mail*.
2. Switch to the demo Gmail window → **Demo: send email** (bottom right, or press **N**) → *Orbit Freight invites Anika to a phone screen*.
   Two emails arrive at the top.
3. Back in the app → **Check now** → Orbit Freight moves to **Interview**, with the phone screen's day and time.
4. Wait a minute (Check now works once a minute) → send *Cedar Analytics turns the application down* → **Check now** →
   it waits under **Needs your review** → **Accept** → Rejected → **Undo** puts it back.
- The Inbox page has a small note that this is a sample mailbox (it shows the address to type).
- The email changes show on the Inbox page; Omar and Sarah never see mail.

## W6. Omar sees the results (2 min)
1. **Opportunities**: Anika's answers ("is interested", "asked a question", "says they applied").
2. **Applications** and **Interviews** (quick).

## Before the demo: clean data
Stop the API, run a fresh database and the setup (DEMO-PLAN.md section 7), then in each Chrome profile connect the extension again.
`node web/scripts/demo-setup.mjs` must print `0 failed`.
