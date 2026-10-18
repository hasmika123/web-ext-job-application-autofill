# Real Gmail demo (inbox parsing and status updates)

Use a DEDICATED Gmail account made for the demo. Never your main account: Kiwiply reads the whole INBOX and Sent folders of whatever account is
connected (headers always, body text only for job mail, never attachments, nothing is ever sent, moved or deleted).

## 0. What is already prepared on the demo stack
- The API runs with `DOSSIER_DEMO_INBOX_SANDBOX=false`, so the built-in sample mailbox is OFF and connecting talks to real Gmail (`imap.gmail.com:993`).
- Anika Rao (consultant, Acme) already has two tracked applications on her board: **Orbit Freight - Platform Engineer** and
  **Cedar Analytics - Backend Developer**, both "Applied". The mails below are written to move exactly those.
- Her license carries the inbox add-on. The stored mailbox password is encrypted with the key `DOSSIER_INBOX_KEY` (already set).

## 1. Prepare the Gmail account (5 minutes, you do this)
1. Create a new consumer Gmail account (example: `yourname.kiwiply.demo@gmail.com`).
2. Turn on **2-Step Verification** (Google Account > Security).
3. Create an **App Password**: https://myaccount.google.com/apppasswords, name it "Kiwiply demo". Google shows 16 letters in four groups.
   Keep them to hand. You type them into the page yourself; nobody else needs to see them. (IMAP is on by default in Gmail.)

## 2. Put the demo mails in that account (5 minutes)
From ANY other mail account, send these to the demo Gmail address. Keep the company and role names exactly as written (the matcher reads them).
Send them in this order, one minute apart, and wait until each shows in the demo Gmail inbox.

| # | Subject | Body | Expected result |
|---|---|---|---|
| 1 | Thank you for applying to Orbit Freight | Thank you for applying to Orbit Freight. We have received your application for the Platform Engineer position and will be in touch. | Orbit Freight stays Applied (a receipt) |
| 2 | Interview invitation: Platform Engineer at Orbit Freight | We would like to schedule an interview with you for the Platform Engineer role. Please share your availability for next week. | Orbit Freight moves to **Interview** |
| 3 | Update on your application to Cedar Analytics | Thank you for your interest in the Backend Developer role at Cedar Analytics. After careful consideration we have decided to pursue other candidates. We wish you every success. | Cedar Analytics moves to **Rejected** |
| 4 | Interview invitation: Site Reliability Engineer at Harbor Cloud | We would like to invite you to an interview for the Site Reliability Engineer role at Harbor Cloud. Please share your availability. | Offered under "Found in your mail" (a job she has not tracked yet) |
| 5 | Thank you for applying to Lumen Health | Thanks for applying. We have received your application for the Data Engineer position at Lumen Health. | Offered under "Found in your mail" |
| 6 | Ten long articles for the weekend | A newsletter that is not job mail. | Ignored (not job mail) |

Tip: if the sender shown is your own name, that is fine; the company and role in the subject and text drive the match.

## 3. The demo (about 5 minutes)
1. Open `http://acme.localhost:3200`, sign in as **Anika** from the "Demo accounts" tab, open **Inbox**.
2. If it shows Connected from an earlier run (the old sample address), press **Disconnect** first.
3. Read the privacy panel ("Only you see your mail"). Enter the demo Gmail address and the 16-letter app password. Press **Check and connect**.
   The code is never shown again, on the page or in any API.
4. Reload until the first read finishes (usually under a minute). Show:
   - **Applications your mail is tracking:** Orbit Freight at Interview, Cedar Analytics at Rejected, each "from your inbox".
   - **Found in your mail:** Harbor Cloud and Lumen Health are OFFERED, not added behind her back. Add Harbor Cloud to the board, dismiss Lumen Health.
5. Privacy wall: sign in as **Sarah** (Org Admin) or **Omar** (marketer): Inbox is not in their menu and no mail, subject or sender appears anywhere.
6. After the demo: press **Disconnect** (it deletes everything read) and revoke the app password at https://myaccount.google.com/apppasswords.

## 4. What to say honestly
- It reads application receipts, in-review notices, interview invitations, assessments, rejections and offers, and moves a status forward only.
- It does not yet read the interview date, time, time zone or link out of the mail, and it does not yet handle reschedules, cancellations or recruiter outreach.
- A rejection is applied without asking first; confirm-before-apply, undo and a review list are next week's work.
- It checks mail every 15 minutes in the background; connecting triggers an immediate first read.

## 5. If it does not work
- "Gmail did not accept that code": 2-Step Verification must be on and the code must be an App Password (16 letters, spaces allowed), not the account password.
- Nothing appears after two minutes: reload; check that the mails really are in the INBOX (not Spam or Promotions tabs still count as INBOX but check Spam), and that this machine can reach `imap.gmail.com:993`.
- Orbit Freight or Cedar Analytics does not move: the subject or body must contain the company name and the role exactly as in the table.
- Status of the stack: API `http://localhost:18183/api/public/tenant/demo` should answer 200.
