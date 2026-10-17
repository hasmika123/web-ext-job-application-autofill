# QA stories: Account Manager workspace (area key ACC)

Spec files: none yet (descriptions only; the browser walks are paused). Persona: **amara** (Amara Silva, Account Manager, `/w/accounts`, ORG scope: `clients.view`, `clients.manage`, `requirements.manage`). Tenant: Acme Staffing (`acme.localhost`). Every story that writes makes its own rows with a timestamp in the name and never touches the seeded roster. Writes need the API run with `DEMO_ALLOW_WRITES=true`.

## Area overview

**What the role does.** The Account Manager owns the client side: who the clients are, who the people at each client are, and what each client asked for. They enter a requirement (typed in, pasted from the client's email, or from a posting link), keep its priority, due date and status current, and put it in front of the right consultants. **E1 is absolute:** putting a requirement in front of a consultant RECORDS it. The consultant sees it as an opportunity and decides; nobody applies for them and nothing is sent to a client. **No sensitive PII:** a rate range is business data; every free-text field is scanned and an identity, bank, tax or birth value is refused with a clear sentence.

**Pages** (`/w/accounts/...`): Home (`/`), Clients (`clients`, built earlier), Contacts (`contacts`), Requirements (`requirements`), Interviews, Placements (built earlier). **Submissions and Offers are not part of this area's stories**: they keep "This page is on the way" until their own branch lands. API: `/api/orgs/{orgId}/requirements/**` (list, summary, one, candidates, intake, edit, assignments) and the existing `/api/orgs/{orgId}/clients/contacts` and `.../clients/{id}/contacts` routes (now with a work phone and a short note).

**Admin settings.** `org.accounts.requirement_aging_days` (default 14, per-organization override) decides when an open requirement counts as aging on Home and on the Requirements page. Nothing about it is hard-coded.

---

### ACC-1 Amara starts her day on the Accounts home
- **Persona / role:** amara, Account Manager. **Goal:** see what the clients are waiting on.
- **Steps:** 1. Sign in; she lands on `/w/accounts`. 2. Read the four tiles (Open requirements, Without a consultant, Aging, Client contacts). 3. Read the two cards: "Waiting for a consultant" and "Open the longest". 4. Select a tile.
- **Expected:** every figure is the API's count (no sample numbers); each card lists real requirements with client, age, due date and priority, or says in words that nothing is waiting; a tile opens the Requirements or Contacts page; the Aging tile names the organization's aging days.
- **Pages / APIs:** `/w/accounts`, `GET .../requirements/summary`, `GET .../requirements?status=OPEN&assigned=NONE`, `GET .../requirements?aging=true`.
- **Status: STORY-ONLY (covered by `AccountsHomePage.test.tsx`, `OrgRequirementResourceIT`)**

### ACC-2 Amara enters a client requirement by hand
- **Preconditions:** the seeded client Acme's Alpha client exists.
- **Steps:** 1. Open Requirements and press "Add requirement". 2. Leave "How did it arrive?" on "Typed in". 3. Enter a title, choose the client and a contact of that client, a location, work mode, three skills, a rate range per hour, two openings, priority High and a "needed by" date. 4. Save.
- **Expected:** the drawer opens on the new requirement showing every field; it is OPEN with no consultant; the list and the "Without a consultant" tile include it; History of the organization has a create row and an intake row by Amara. Pressing Save twice, or retrying after a lost answer, creates one requirement (the form carries one Idempotency-Key).
- **Pages / APIs:** Requirements, `POST .../requirements` (Idempotency-Key), audit `JOB_CREATE` + `REQUIREMENT_INTAKE`.
- **Status: STORY-ONLY (covered by `RequirementsPage.test.tsx`, `OrgRequirementResourceIT`)**

### ACC-3 Amara pastes the client's email as a requirement
- **Steps:** 1. Add requirement; choose "Pasted text". 2. Paste the client's text into "The client's text", add a title and the client. 3. Save. 4. Try again with the text left empty.
- **Expected:** the pasted text is the description (up to 4000 characters) and the source reads "Pasted text"; the empty paste is refused in the form before anything is sent ("Paste the client's text."). A pasted text that contains a Social Security number is refused with "That looks like sensitive personal data. We never store it, so please remove it." and nothing is saved.
- **Pages / APIs:** Requirements dialog, `POST .../requirements` (422 `SENSITIVE_CONTENT`).
- **Status: STORY-ONLY (covered by `RequirementsPage.test.tsx`, `OrgRequirementResourceIT`)**

### ACC-4 Amara enters a requirement from a posting link, and the same link twice is caught
- **Steps:** 1. Add requirement; choose "Link"; paste `https://boards.example.com/jobs/12345`; add a title and client; save. 2. Add another requirement with the same link and a different title. 3. Try a `javascript:` address.
- **Expected:** step 1 keeps the link (a "posting" link in the drawer); step 2 is refused with "This client already has an open requirement like this one." and an "Open it" button that opens the first one; step 3 is refused ("Paste the link of the posting, starting with https://."). The same client, title and place entered twice while the first is still open is refused the same way; after the first is closed it can be entered again.
- **Pages / APIs:** Requirements dialog, `POST .../requirements` (409 `REQUIREMENT_EXISTS` with `existingId`).
- **Status: STORY-ONLY (covered by `RequirementsPage.test.tsx`, `OrgRequirementResourceIT`)**

### ACC-5 Amara finds the requirements that need her
- **Steps:** 1. Open Requirements. 2. Select the "Without a consultant" tile. 3. Search for a skill. 4. Filter by client and priority. 5. Select the "Aging" tile. 6. Clear the filters. 7. Do the same on a 390 px wide screen.
- **Expected:** the filters are applied by the server (the list and the total change); an empty result says "No requirements match" with a "Clear filters" button; with no requirement at all the page invites the first one; on a phone each requirement is a card (title, client, place, priority, status, consultants, date) in the same list, with no sideways scrolling.
- **Pages / APIs:** Requirements, `GET .../requirements?q=&status=&priority=&clientId=&assigned=&aging=&sort=`.
- **Status: STORY-ONLY (covered by `RequirementsPage.test.tsx`, `OrgRequirementResourceIT`; the 390 px layout is NOT VERIFIED in a browser)**

### ACC-6 Amara keeps a requirement current and puts it in front of a consultant
- **Steps:** 1. Open a requirement's drawer. 2. Edit: raise the priority to Urgent, move the date, add a skill; save. 3. Choose a consultant under "Consultants it was put in front of" and press "Put in front of them". 4. Move the status to On hold, then back to Open, then to Filled.
- **Expected:** every edit sends only what changed, with the version it loaded (a stale drawer is told "Someone else changed this requirement. It was reloaded, try again." and reloads); the consultant list shows name, title and fit only (no e-mail, phone or resume); the consultant appears in the drawer and the "Without a consultant" count drops; the consultant finds it on their Assigned Opportunities and decides, and **no application exists until they apply**; Filled (or Closed) closes the assignments still waiting on it. A consultant whose marketing is paused, or who has no approved resume, is refused with a clear sentence. A member who can view but not manage sees no Add, no status move and no assigning.
- **Pages / APIs:** Requirements drawer, `PATCH .../requirements/{id}` (If-Match), `GET .../requirements/{id}/candidates`, `POST .../requirements/{id}/assignments`, audit `JOB_UPDATE`, `JOB_STATUS`, `REQUIREMENT_ASSIGN`, `REQUIREMENT_CLOSE`.
- **Status: STORY-ONLY (covered by `RequirementsPage.test.tsx`, `OrgRequirementResourceIT`)**

### ACC-7 Amara keeps the contact list of her clients
- **Steps:** 1. Open Contacts. 2. Search a name, then filter by client. 3. Add a contact: client, name, title, role, work e-mail, work phone and a short note. 4. Edit the phone. 5. Mark the person as left, then "Back at client". 6. Try a private mailbox (a free webmail address) and a note with a bank account number.
- **Expected:** the list shows name, title and role, client, work e-mail and phone (as links) and the note; a person who left is dimmed with a "Left" pill; the edit sends only the phone; a private mailbox is refused ("Use a work e-mail: we keep business contacts, not private mailboxes."); a note holding a bank number is refused as sensitive; a member without `clients.manage` sees the people but no buttons. The same contacts appear in the client's drawer on the Clients page.
- **Pages / APIs:** Contacts, `GET .../clients/contacts`, `POST .../clients/{id}/contacts` (Idempotency-Key), `PATCH .../clients/{id}/contacts/{contactId}`, audit `CLIENT_CONTACT_ADD`, `CLIENT_CONTACT_UPDATE`.
- **Status: STORY-ONLY (covered by `ContactsPage.test.tsx`, `OrgClientResourceIT`)**

### ACC-8 Another organization never sees or changes any of it
- **Steps:** as the owner of a second organization, call each Requirements route with Acme's ids and with Acme's organization id.
- **Expected:** every answer is the same generic "not found" (never 403), nothing of Acme changes, no audit row is written for Acme; a requirement id, client id or consultant id of the other organization put in a body is refused the same way.
- **Pages / APIs:** all `.../requirements/**` routes.
- **Status: STORY-ONLY (covered by `OrgIsolationIT` rows for the seven Requirements routes, `OrgRequirementResourceIT`)**
