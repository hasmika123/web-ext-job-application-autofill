# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys\tenant-clients.spec.ts >> clients (real stack) >> the journey
- Location: e2e\journeys\tenant-clients.spec.ts:40:7

# Error details

```
Test timeout of 240000ms exceeded.
```

```
Error: locator.click: Test timeout of 240000ms exceeded.
Call log:
  - waiting for getByRole('menuitem', { name: 'Inactive' })

```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - generic [ref=f1e3]:
    - link "Skip to content" [ref=f1e4] [cursor=pointer]:
      - /url: "#main-content"
    - complementary "Sidebar" [ref=f1e5]:
      - generic [ref=f1e6]:
        - link "Acme Staffing home" [ref=f1e8] [cursor=pointer]:
          - /url: /w/admin
          - generic [ref=f1e9]: Acme Staffing
          - generic [aria-hidden] [ref=f1e10]: Acme
        - navigation "Main" [ref=f1e12]:
          - list [ref=f1e14]:
            - listitem [ref=f1e15]:
              - link "Dashboard" [ref=f1e16] [cursor=pointer]:
                - /url: /w/admin
            - listitem [ref=f1e22]:
              - link "Employees" [ref=f1e23] [cursor=pointer]:
                - /url: /w/admin/employees
            - listitem [ref=f1e30]:
              - link "Invitations needs attention" [ref=f1e31] [cursor=pointer]:
                - /url: /w/admin/invitations
                - generic [ref=f1e35]: Invitations
                - generic "needs attention" [ref=f1e36]
            - listitem [ref=f1e37]:
              - link "Teams" [ref=f1e38] [cursor=pointer]:
                - /url: /w/admin/teams
            - listitem [ref=f1e45]:
              - link "Departments" [ref=f1e46] [cursor=pointer]:
                - /url: /w/admin/departments
            - listitem [ref=f1e52]:
              - link "Roles & Permissions" [ref=f1e53] [cursor=pointer]:
                - /url: /w/admin/roles
            - listitem [ref=f1e58]:
              - link "Consultants" [ref=f1e59] [cursor=pointer]:
                - /url: /w/admin/consultants
            - listitem [ref=f1e64]:
              - link "Resumes" [ref=f1e65] [cursor=pointer]:
                - /url: /w/admin/resumes
            - listitem [ref=f1e71]:
              - link "Marketing Assignments" [ref=f1e72] [cursor=pointer]:
                - /url: /w/admin/marketing-assignments
            - listitem [ref=f1e78]:
              - link "Jobs" [ref=f1e79] [cursor=pointer]:
                - /url: /w/admin/jobs
            - listitem [ref=f1e85]:
              - link "Applications" [ref=f1e86] [cursor=pointer]:
                - /url: /w/admin/applications
            - listitem [ref=f1e92]:
              - link "Interviews" [ref=f1e93] [cursor=pointer]:
                - /url: /w/admin/interviews
            - listitem [ref=f1e99]:
              - link "Clients" [ref=f1e100] [cursor=pointer]:
                - /url: /w/admin/clients
            - listitem [ref=f1e106]:
              - link "Placements" [ref=f1e107] [cursor=pointer]:
                - /url: /w/admin/placements
          - generic [ref=f1e113]:
            - separator [aria-hidden] [ref=f1e114]
            - list [ref=f1e115]:
              - listitem [ref=f1e116]:
                - link "Subscription Overview (soon)" [ref=f1e117] [cursor=pointer]:
                  - /url: /w/admin/subscription
                  - generic [ref=f1e122]: Subscription Overview
                  - generic [ref=f1e123]: (soon)
              - listitem [ref=f1e124]:
                - link "Consultant Licenses (soon)" [ref=f1e125] [cursor=pointer]:
                  - /url: /w/admin/licenses
                  - generic [ref=f1e129]: Consultant Licenses
                  - generic [ref=f1e130]: (soon)
              - listitem [ref=f1e131]:
                - link "Billing (soon)" [ref=f1e132] [cursor=pointer]:
                  - /url: /w/admin/billing
                  - generic [ref=f1e136]: Billing
                  - generic [ref=f1e137]: (soon)
              - listitem [ref=f1e138]:
                - link "Feature Usage (soon)" [ref=f1e139] [cursor=pointer]:
                  - /url: /w/admin/usage
                  - generic [ref=f1e142]: Feature Usage
                  - generic [ref=f1e143]: (soon)
              - listitem [ref=f1e144]:
                - link "HR" [ref=f1e145] [cursor=pointer]:
                  - /url: /w/admin/hr
              - listitem [ref=f1e151]:
                - link "Finance" [ref=f1e152] [cursor=pointer]:
                  - /url: /w/admin/finance
              - listitem [ref=f1e159]:
                - link "Reports" [ref=f1e160] [cursor=pointer]:
                  - /url: /w/admin/reports
          - generic [ref=f1e164]:
            - separator [aria-hidden] [ref=f1e165]
            - list [ref=f1e166]:
              - listitem [ref=f1e167]:
                - link "Organization Branding" [ref=f1e168] [cursor=pointer]:
                  - /url: /w/admin/branding
              - listitem [ref=f1e173]:
                - link "Domains" [ref=f1e174] [cursor=pointer]:
                  - /url: /w/admin/domains
              - listitem [ref=f1e179]:
                - link "Integrations (soon)" [ref=f1e180] [cursor=pointer]:
                  - /url: /w/admin/integrations
                  - generic [ref=f1e186]: Integrations
                  - generic [ref=f1e187]: (soon)
              - listitem [ref=f1e188]:
                - link "Audit Logs" [ref=f1e189] [cursor=pointer]:
                  - /url: /w/admin/audit
              - listitem [ref=f1e193]:
                - link "Settings" [ref=f1e194] [cursor=pointer]:
                  - /url: /w/admin/settings
    - generic [ref=f1e199]:
      - banner [ref=f1e200]:
        - generic [ref=f1e201]:
          - heading "Clients" [level=1] [ref=f1e202]
          - paragraph [ref=f1e203]: Manage client companies, contacts, and open requirements across your organization.
        - combobox "Search" [ref=f1e210]
        - button "Notifications" [ref=f1e213] [cursor=pointer]
        - button "Account menu for Sarah Chen" [ref=f1e219] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e220]: SC
          - generic [ref=f1e221]:
            - generic [ref=f1e222]: Sarah Chen
            - generic [ref=f1e223]: Org Admin
      - main [ref=f1e226]:
        - generic [ref=f1e228]:
          - generic [ref=f1e229]:
            - list "Client figures" [ref=f1e231]:
              - listitem [ref=f1e232]:
                - generic [ref=f1e233]:
                  - generic [ref=f1e239]: Total Clients
                  - generic [ref=f1e240]:
                    - generic [ref=f1e241]: "24"
                    - img "Total Clients, last 8 weeks" [ref=f1e242]
                  - generic [ref=f1e245]:
                    - generic [ref=f1e246]:
                      - generic [aria-hidden] [ref=f1e247]: ▲
                      - generic [ref=f1e248]: Up
                      - text: +33.3%
                    - text: vs last month
              - listitem [ref=f1e249]:
                - generic [ref=f1e250]:
                  - generic [ref=f1e256]: Active Requirements
                  - generic [ref=f1e257]:
                    - generic [ref=f1e258]: "49"
                    - img "Active Requirements, last 8 weeks" [ref=f1e259]
                  - generic [ref=f1e262]:
                    - generic [ref=f1e263]:
                      - generic [aria-hidden] [ref=f1e264]: ▲
                      - generic [ref=f1e265]: Up
                      - text: +113%
                    - text: vs last month
              - listitem [ref=f1e266]:
                - generic [ref=f1e267]:
                  - generic [ref=f1e274]: New Clients This Month
                  - generic [ref=f1e275]:
                    - generic [ref=f1e276]: "6"
                    - img "New Clients This Month, last 8 weeks" [ref=f1e277]
                  - generic [ref=f1e280]:
                    - generic [ref=f1e281]:
                      - generic [aria-hidden] [ref=f1e282]: ▲
                      - generic [ref=f1e283]: Up
                      - text: "+6"
                    - text: vs last month
              - listitem [ref=f1e284]:
                - generic [ref=f1e285]:
                  - generic [ref=f1e290]: Placements via Clients
                  - generic [ref=f1e291]:
                    - generic [ref=f1e292]: "131"
                    - img "Placements via Clients, last 8 weeks" [ref=f1e293]
                  - generic [ref=f1e296]:
                    - generic [ref=f1e297]:
                      - generic [aria-hidden] [ref=f1e298]: ▲
                      - generic [ref=f1e299]: Up
                      - text: +48.9%
                    - text: vs last month
            - region "Help" [ref=f1e301]:
              - generic [ref=f1e303]:
                - heading "Need help with client management?" [level=2] [ref=f1e304]
                - paragraph [ref=f1e305]: I can help you manage client companies, contacts, requirements, and track your client relationships.
                - button "Ask a question..." [ref=f1e306] [cursor=pointer]
          - generic [ref=f1e313]:
            - generic [ref=f1e314]:
              - generic [ref=f1e315]:
                - tablist "Clients views" [ref=f1e317]:
                  - tab "Client Directory" [selected] [ref=f1e318] [cursor=pointer]
                  - tab "Contacts" [ref=f1e324] [cursor=pointer]
                  - tab "Requirements" [ref=f1e331] [cursor=pointer]
                  - tab "Activity" [ref=f1e337] [cursor=pointer]
                - button "Add Client" [ref=f1e342] [cursor=pointer]
              - search [ref=f1e345]:
                - searchbox "Search clients" [ref=f1e347]: tech
                - button "Industry" [ref=f1e349] [cursor=pointer]:
                  - generic [ref=f1e350]: All Industries
                - button "Health" [ref=f1e352] [cursor=pointer]:
                  - generic [ref=f1e353]: All Health Statuses
                - button "More Filters" [ref=f1e354] [cursor=pointer]
                - button "Clear filters" [ref=f1e357] [cursor=pointer]
              - generic [ref=f1e358]:
                - paragraph [ref=f1e359]: 1-6 of 6 clients
                - generic [ref=f1e360]:
                  - generic [ref=f1e361]:
                    - generic [ref=f1e362]: "Sort by:"
                    - button "Sort by" [ref=f1e364] [cursor=pointer]:
                      - generic [ref=f1e365]: Last Activity
                  - group "View" [ref=f1e366]:
                    - button "List view" [pressed] [ref=f1e367] [cursor=pointer]
                    - button "Grid view" [ref=f1e371] [cursor=pointer]
                  - generic [ref=f1e377]:
                    - button "Previous page" [disabled] [ref=f1e378]
                    - button "Next page" [disabled] [ref=f1e381]
              - table [ref=f1e386]:
                - caption [ref=f1e387]: Clients
                - rowgroup [ref=f1e398]:
                  - row [ref=f1e399]:
                    - columnheader [ref=f1e400]:
                      - checkbox "Select all clients on this page" [ref=f1e401] [cursor=pointer]
                    - columnheader [ref=f1e402]:
                      - button "Client Company" [ref=f1e403] [cursor=pointer]
                    - columnheader [ref=f1e404]:
                      - button "Industry" [ref=f1e405] [cursor=pointer]
                    - columnheader [ref=f1e406]:
                      - button [ref=f1e407] [cursor=pointer]:
                        - generic [ref=f1e408]: OpenRequirements
                    - columnheader [ref=f1e409]:
                      - button [ref=f1e410] [cursor=pointer]:
                        - generic [ref=f1e411]: ActiveConsultants
                    - columnheader [ref=f1e412]:
                      - button "Account Manager" [ref=f1e413] [cursor=pointer]
                    - columnheader [ref=f1e414]:
                      - button "Health" [ref=f1e415] [cursor=pointer]
                    - columnheader [ref=f1e416]:
                      - button "Last Activity" [ref=f1e417] [cursor=pointer]
                    - columnheader "Actions" [ref=f1e420]
                - rowgroup [ref=f1e421]:
                  - row [ref=f1e422] [cursor=pointer]:
                    - cell [ref=f1e423]:
                      - checkbox "Select FinTech Solutions" [ref=f1e424]
                    - cell "FinTech Solutions" [ref=f1e425]:
                      - generic [ref=f1e426]:
                        - generic [aria-hidden] [ref=f1e427]: F
                        - generic [ref=f1e428]: FinTech Solutions
                    - cell "Financial Services" [ref=f1e429]
                    - cell "2" [ref=f1e430]
                    - cell "10" [ref=f1e431]
                    - cell "Amara Silva" [ref=f1e432]:
                      - generic [ref=f1e433]:
                        - generic [aria-hidden] [ref=f1e434]: AS
                        - generic [ref=f1e435]: Amara Silva
                    - cell "Healthy" [ref=f1e436]
                    - cell "Oct 14, 2026" [ref=f1e438]
                    - cell [ref=f1e439]:
                      - button "Actions for FinTech Solutions" [ref=f1e442]
                  - row [ref=f1e447] [cursor=pointer]:
                    - cell [ref=f1e448]:
                      - checkbox "Select InnovateLab" [ref=f1e449]
                    - cell "InnovateLab" [ref=f1e450]:
                      - generic [ref=f1e451]:
                        - generic [aria-hidden] [ref=f1e452]: I
                        - generic [ref=f1e453]: InnovateLab
                    - cell "Technology" [ref=f1e454]
                    - cell "2" [ref=f1e455]
                    - cell "7" [ref=f1e456]
                    - cell "Amara Silva" [ref=f1e457]:
                      - generic [ref=f1e458]:
                        - generic [aria-hidden] [ref=f1e459]: AS
                        - generic [ref=f1e460]: Amara Silva
                    - cell "Healthy" [ref=f1e461]
                    - cell "Oct 12, 2026" [ref=f1e463]
                    - cell [ref=f1e464]:
                      - button "Actions for InnovateLab" [ref=f1e467]
                  - row [ref=f1e472] [cursor=pointer]:
                    - cell [ref=f1e473]:
                      - checkbox "Select TechCorp" [ref=f1e474]
                    - cell "TechCorp" [ref=f1e475]:
                      - generic [ref=f1e476]:
                        - generic [aria-hidden] [ref=f1e477]: T
                        - generic [ref=f1e478]: TechCorp
                    - cell "Technology" [ref=f1e479]
                    - cell "2" [ref=f1e480]
                    - cell "7" [ref=f1e481]
                    - cell "Amara Silva" [ref=f1e482]:
                      - generic [ref=f1e483]:
                        - generic [aria-hidden] [ref=f1e484]: AS
                        - generic [ref=f1e485]: Amara Silva
                    - cell "Healthy" [ref=f1e486]
                    - cell "Oct 12, 2026" [ref=f1e488]
                    - cell [ref=f1e489]:
                      - button "Actions for TechCorp" [ref=f1e492]
                  - row [ref=f1e497] [cursor=pointer]:
                    - cell [ref=f1e498]:
                      - checkbox "Select Harvest Agritech" [ref=f1e499]
                    - cell "Harvest Agritech" [ref=f1e500]:
                      - generic [ref=f1e501]:
                        - generic [aria-hidden] [ref=f1e502]: HA
                        - generic [ref=f1e503]: Harvest Agritech
                    - cell "Agriculture" [ref=f1e504]
                    - cell "2" [ref=f1e505]
                    - cell "0" [ref=f1e506]
                    - cell "Jessica Davis" [ref=f1e507]:
                      - generic [ref=f1e508]:
                        - generic [aria-hidden] [ref=f1e509]: JD
                        - generic [ref=f1e510]: Jessica Davis
                    - cell "Neutral" [ref=f1e511]
                    - cell "Oct 7, 2026" [ref=f1e513]
                    - cell [ref=f1e514]:
                      - button "Actions for Harvest Agritech" [ref=f1e517]
                  - row [ref=f1e522] [cursor=pointer]:
                    - cell [ref=f1e523]:
                      - checkbox "Select Brightwave Software" [ref=f1e524]
                    - cell "Brightwave Software" [ref=f1e525]:
                      - generic [ref=f1e526]:
                        - generic [aria-hidden] [ref=f1e527]: BS
                        - generic [ref=f1e528]: Brightwave Software
                    - cell "Technology" [ref=f1e529]
                    - cell "2" [ref=f1e530]
                    - cell "0" [ref=f1e531]
                    - cell "Samantha Lee" [ref=f1e532]:
                      - generic [ref=f1e533]:
                        - generic [aria-hidden] [ref=f1e534]: SL
                        - generic [ref=f1e535]: Samantha Lee
                    - cell "Healthy" [ref=f1e536]
                    - cell "Oct 3, 2026" [ref=f1e538]
                    - cell [ref=f1e539]:
                      - button "Actions for Brightwave Software" [ref=f1e542]
                  - row [ref=f1e547] [cursor=pointer]:
                    - cell [ref=f1e548]:
                      - checkbox "Select Summit Biotech" [ref=f1e549]
                    - cell "Summit Biotech" [ref=f1e550]:
                      - generic [ref=f1e551]:
                        - generic [aria-hidden] [ref=f1e552]: SB
                        - generic [ref=f1e553]: Summit Biotech
                    - cell "Biotechnology" [ref=f1e554]
                    - cell "2" [ref=f1e555]
                    - cell "0" [ref=f1e556]
                    - cell "Emily Lawson" [ref=f1e557]:
                      - generic [ref=f1e558]:
                        - generic [aria-hidden] [ref=f1e559]: EL
                        - generic [ref=f1e560]: Emily Lawson
                    - cell "At Risk" [ref=f1e561]
                    - cell "Aug 22, 2026" [ref=f1e563]
                    - cell [ref=f1e564]:
                      - button "Actions for Summit Biotech" [ref=f1e567]
              - generic [ref=f1e572]:
                - paragraph [ref=f1e573]: 1-6 of 6 clients
                - button "Clients per page" [ref=f1e576] [cursor=pointer]:
                  - generic [ref=f1e577]: 10 per page
            - complementary "FinTech Solutions details" [ref=f1e579]:
              - generic [ref=f1e580]:
                - generic [ref=f1e581]:
                  - generic [aria-hidden] [ref=f1e583]: F
                  - generic [ref=f1e584]:
                    - generic [ref=f1e585]:
                      - heading "FinTech Solutions" [level=2] [ref=f1e586]
                      - button "Status" [active] [ref=f1e589] [cursor=pointer]:
                        - generic [ref=f1e590]: Active
                    - paragraph [ref=f1e593]: Financial Services
                    - link "www.fintechsolutions.example.com" [ref=f1e594] [cursor=pointer]:
                      - /url: https://www.fintechsolutions.example.com
                  - button "Close client details" [ref=f1e599] [cursor=pointer]
                - paragraph [ref=f1e602]:
                  - generic [ref=f1e603]: "Healthy:"
                  - text: Active within 14 days with work in flight.
                - tablist "Client details" [ref=f1e605]:
                  - tab "Overview" [selected] [ref=f1e606] [cursor=pointer]
                  - tab "Contacts (3)" [ref=f1e607] [cursor=pointer]
                  - tab "Requirements (3)" [ref=f1e608] [cursor=pointer]
                - tabpanel "overview" [ref=f1e609]:
                  - button "Edit client" [ref=f1e611] [cursor=pointer]
                  - generic [ref=f1e614]:
                    - region "About" [ref=f1e615]:
                      - heading "About" [level=3] [ref=f1e617]
                      - paragraph [ref=f1e618]: No description yet.
                      - list [ref=f1e619]:
                        - listitem [ref=f1e620]:
                          - generic [ref=f1e626]: Financial Services
                        - listitem [ref=f1e627]:
                          - generic [ref=f1e632]: "Account manager: Amara Silva"
                    - separator [ref=f1e633]
                    - region "Key contacts" [ref=f1e634]:
                      - generic [ref=f1e635]:
                        - heading "Key Contacts" [level=3] [ref=f1e636]
                        - button "View all contacts" [ref=f1e637] [cursor=pointer]: View All
                      - list [ref=f1e638]:
                        - listitem [ref=f1e639]:
                          - generic [aria-hidden] [ref=f1e640]: LB
                          - generic [ref=f1e641]:
                            - paragraph [ref=f1e642]: Laura Benitez
                            - paragraph [ref=f1e643]: Hiring Manager
                          - link "E-mail Laura Benitez" [ref=f1e644] [cursor=pointer]:
                            - /url: mailto:laura.benitez@fintechsolutions.example.com
                          - button "More for Laura Benitez" [ref=f1e650] [cursor=pointer]
                        - listitem [ref=f1e655]:
                          - generic [aria-hidden] [ref=f1e656]: OS
                          - generic [ref=f1e657]:
                            - paragraph [ref=f1e658]: Omar Siddiqui
                            - paragraph [ref=f1e659]: Talent Partner
                          - link "E-mail Omar Siddiqui" [ref=f1e660] [cursor=pointer]:
                            - /url: mailto:omar.siddiqui@fintechsolutions.example.com
                          - button "More for Omar Siddiqui" [ref=f1e666] [cursor=pointer]
                        - listitem [ref=f1e671]:
                          - generic [aria-hidden] [ref=f1e672]: JC
                          - generic [ref=f1e673]:
                            - paragraph [ref=f1e674]: Journey Contact
                            - paragraph
                          - link "E-mail Journey Contact" [ref=f1e675] [cursor=pointer]:
                            - /url: mailto:journey.contact@techcorp.example.com
                          - button "More for Journey Contact" [ref=f1e681] [cursor=pointer]
                    - separator [ref=f1e686]
                    - region "Recent requirements" [ref=f1e687]:
                      - generic [ref=f1e688]:
                        - heading "Recent Requirements" [level=3] [ref=f1e689]
                        - button "View all requirements" [ref=f1e690] [cursor=pointer]: View All
                      - list [ref=f1e691]:
                        - listitem [ref=f1e692]:
                          - generic [ref=f1e693]: Data Engineer
                          - generic [ref=f1e694]: Open
                          - generic [ref=f1e695]: Oct 8, 2026
                        - listitem [ref=f1e696]:
                          - generic [ref=f1e697]: Marketing Automation Specialist
                          - generic [ref=f1e698]: In Review
                          - generic [ref=f1e699]: Oct 5, 2026
                        - listitem [ref=f1e700]:
                          - generic [ref=f1e701]: Data Engineer
                          - generic [ref=f1e702]: Open
                          - generic [ref=f1e703]: May 18, 2026
                    - separator [ref=f1e704]
                    - region "Recent submissions" [ref=f1e705]:
                      - generic [ref=f1e706]:
                        - heading "Recent Submissions" [level=3] [ref=f1e707]
                        - link "View all submissions" [ref=f1e708] [cursor=pointer]:
                          - /url: /w/admin/applications?client=3
                          - text: View All
                      - list [ref=f1e709]:
                        - listitem [ref=f1e710]:
                          - generic [aria-hidden] [ref=f1e711]: HD
                          - generic [ref=f1e712]:
                            - paragraph [ref=f1e713]: Hamza Dubois
                            - paragraph [ref=f1e714]: Data Engineer
                          - generic [ref=f1e715]: Assigned
                          - generic [ref=f1e716]: 17 hours ago
                        - listitem [ref=f1e717]:
                          - generic [aria-hidden] [ref=f1e718]: LS
                          - generic [ref=f1e719]:
                            - paragraph [ref=f1e720]: Lucas Salazar
                            - paragraph [ref=f1e721]: Data Engineer
                          - generic [ref=f1e722]: Submitted
                          - generic [ref=f1e723]: 1 day ago
                        - listitem [ref=f1e724]:
                          - generic [aria-hidden] [ref=f1e725]: ZK
                          - generic [ref=f1e726]:
                            - paragraph [ref=f1e727]: Zane Kaplan
                            - paragraph [ref=f1e728]: Data Engineer
                          - generic [ref=f1e729]: Assigned
                          - generic [ref=f1e730]: 3 days ago
                    - separator [ref=f1e731]
                    - region "Relationship notes" [ref=f1e732]:
                      - generic [ref=f1e733]:
                        - heading "Relationship Notes" [level=3] [ref=f1e734]
                        - button "View all relationship notes" [ref=f1e735] [cursor=pointer]: View All
                      - list [ref=f1e736]:
                        - listitem [ref=f1e737]:
                          - generic [ref=f1e743]:
                            - paragraph [ref=f1e744]: "Journey note: renewal call booked."
                            - paragraph [ref=f1e745]: Oct 14, 2026 by Sarah Chen
                - generic [ref=f1e746]:
                  - button "Add Contact" [ref=f1e747] [cursor=pointer]
                  - button "Create Requirement" [ref=f1e753] [cursor=pointer]
                  - link "View Placements" [ref=f1e758] [cursor=pointer]:
                    - /url: /w/admin/placements?client=3
  - alert [ref=f1e762]
```

# Test source

```ts
  13  | const betaBase = `http://beta.localhost:${port}`;
  14  | const shots = resolve(__dirname, "../../../design/enterprise-more/built");
  15  | 
  16  | /**
  17  |  * Signs in as a demo member through the same endpoint the Demo accounts tab calls (`POST /api/auth/tenant-demo`). The tab itself asks the API
  18  |  * with a 4 second timeout and is flaky on a loaded machine, so the journey does not depend on it.
  19  |  */
  20  | async function signIn(page: Page, host: string, person: string) {
  21  |   const login = `demo-ent-${host.includes("beta.") ? "beta" : "acme"}-${person.split(" ")[0].toLowerCase()}`;
  22  |   await page.goto(`${host}/login`);
  23  |   const status = await page.evaluate(async (who) => (await fetch("/api/auth/tenant-demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: who }) })).status, login);
  24  |   expect(status).toBe(200);
  25  | }
  26  | 
  27  | /** Opens the page, reloading while the workspace answers "couldn't load" (the first request after a cold start on a loaded machine). */
  28  | async function openClients(page: Page, host: string) {
  29  |   for (let i = 0; i < 5; i++) {
  30  |     await page.goto(`${host}/w/admin/clients`);
  31  |     if (await page.locator("[data-clients-page]").isVisible({ timeout: 25_000 }).catch(() => false)) return;
  32  |   }
  33  | }
  34  | 
  35  | const rows = (page: Page) => page.locator("tr[data-row-id]");
  36  | 
  37  | test.describe("clients (real stack)", () => {
  38  |   test.use({ viewport: { width: 1448, height: 1086 } });
  39  | 
  40  |   test("the journey", async ({ page }) => {
  41  |     mkdirSync(shots, { recursive: true });
  42  |     await signIn(page, base, "Sarah Chen");
  43  |     await openClients(page, base);
  44  |     await expect(page.locator("[data-clients-page]")).toBeVisible();
  45  | 
  46  |     // the four tiles come from the seeded rows; the first client opens in the docked drawer
  47  |     const kpi = (k: string) => page.locator(`[data-kpi=${k}] [data-kpi-value]`);
  48  |     await expect(kpi("totalClients")).toHaveText(/^\d+$/);
  49  |     const total0 = Number(await kpi("totalClients").innerText());
  50  |     const fresh0 = Number(await kpi("newThisMonth").innerText());
  51  |     expect(total0).toBeGreaterThanOrEqual(24);
  52  |     await expect(page.locator("[data-kpi=totalClients] [data-kpi-delta]")).toContainText("vs last month");
  53  |     await expect(rows(page)).toHaveCount(10);
  54  |     await expect(page.locator("[data-client-drawer] [data-detail-body]")).toBeVisible();
  55  |     await expect(page.locator("[data-help-bee]")).toBeVisible();
  56  |     await page.screenshot({ path: resolve(shots, "clients-list.png") });
  57  | 
  58  |     // filter by health through the dropdown: the address and the count follow, every row carries that badge
  59  |     await page.locator('[data-filters] button[aria-label="Health"]').click();
  60  |     await page.getByRole("option", { name: /^At Risk \(/ }).click();
  61  |     expect(page.url()).toContain("health=AT_RISK");
  62  |     await expect(rows(page).first().locator("[data-health]")).toHaveAttribute("data-health", "AT_RISK");
  63  |     await expect(rows(page).locator("[data-health=HEALTHY]")).toHaveCount(0);
  64  |     const atRisk = await rows(page).count();
  65  |     expect(atRisk).toBeGreaterThan(0);
  66  |     for (let i = 0; i < atRisk; i++) await expect(rows(page).nth(i).locator("[data-health]")).toHaveAttribute("data-health", "AT_RISK");
  67  |     await page.locator("[data-clear-filters]").click();
  68  |     await expect(rows(page)).toHaveCount(10);
  69  | 
  70  |     // search narrows (and a shared link would reproduce it)
  71  |     await page.getByLabel("Search clients").fill("tech");
  72  |     await expect(rows(page).first()).toContainText(/tech/i);
  73  |     const filteredUrl = page.url();
  74  |     expect(filteredUrl).toContain("q=tech");
  75  | 
  76  |     // open a client: the drawer, its URL, its contacts and requirements
  77  |     await rows(page).first().click();
  78  |     const drawer = page.locator("[data-detail-body]");
  79  |     await expect(drawer).toBeVisible();
  80  |     expect(page.url()).toContain("client=");
  81  |     const clientId = await drawer.getAttribute("data-client-id");
  82  |     await expect(drawer.locator("[data-key-contacts] [data-contact-row]").first()).toBeVisible();
  83  |     await expect(drawer.locator("[data-health-reason]")).toContainText(/days|Nothing|prospect|inactive/i);
  84  |     await page.screenshot({ path: resolve(shots, "clients-drawer.png") });
  85  |     const fresh = await page.context().newPage();
  86  |     await fresh.goto(page.url());
  87  |     await expect(fresh.locator("[data-detail-body]")).toBeVisible();
  88  |     await expect(fresh.getByLabel("Search clients")).toHaveValue("tech");
  89  |     await fresh.close();
  90  | 
  91  |     // add a contact: a private mailbox is refused, a work e-mail is added and shows in the Contacts tab
  92  |     await drawer.locator("[data-add-contact]").click();
  93  |     await page.getByLabel(/^Name/).fill("Journey Contact");
  94  |     await page.getByLabel(/Work e-mail/).fill("journey.contact@gmail.com");
  95  |     await page.locator("[data-contact-submit]").click();
  96  |     await expect(page.locator("[data-contact-error]")).toContainText(/work e-mail/i);
  97  |     await page.getByLabel(/Work e-mail/).fill("journey.contact@techcorp.example.com");
  98  |     await page.locator("[data-contact-submit]").click();
  99  |     await expect(page.getByText("Journey Contact was added")).toBeVisible();
  100 |     await page.getByRole("tab", { name: /^Contacts \(/ }).click();
  101 |     await expect(page.locator("[data-contacts-tab]")).toContainText("Journey Contact");
  102 |     await page.getByRole("tab", { name: "Overview" }).click();
  103 | 
  104 |     // a relationship note: an explicit send
  105 |     await page.getByLabel("Add a relationship note").click();
  106 |     await page.getByLabel("New relationship note").fill("Journey note: renewal call booked.");
  107 |     await page.locator("[data-note-send]").click();
  108 |     await expect(page.getByText("Note added")).toBeVisible();
  109 |     await expect(page.locator("[data-notes]")).toContainText("Journey note: renewal call booked.");
  110 | 
  111 |     // status from the drawer autosaves, and Undo puts it back
  112 |     await page.locator("[data-status-menu]").click();
> 113 |     await page.getByRole("menuitem", { name: "Inactive" }).click();
      |                                                            ^ Error: locator.click: Test timeout of 240000ms exceeded.
  114 |     await expect(page.getByText(/is now Inactive/)).toBeVisible();
  115 |     await page.getByRole("button", { name: "Undo" }).click();
  116 |     await expect(page.getByText("Undone")).toBeVisible();
  117 |     await expect(page.locator("[data-status-menu]")).toContainText("Active");
  118 | 
  119 |     // edit mode: a field saves by itself, no Save button
  120 |     await page.locator("[data-edit-toggle]").click();
  121 |     await page.getByLabel("Location").fill("Austin, TX");
  122 |     await page.getByLabel("Location").blur();
  123 |     await expect(page.locator("[data-save-status]")).toContainText("Saved");
  124 |     await page.locator("[data-edit-toggle]").click();
  125 |     await expect(page.locator("[data-facts]")).toContainText("Austin, TX");
  126 | 
  127 |     // create a requirement for this client: the Jobs dialog opens with the client chosen
  128 |     await page.locator("[data-create-requirement]").click();
  129 |     await page.getByLabel(/Job title/).fill("Journey Platform Engineer");
  130 |     await page.locator("[data-create-submit]").click();
  131 |     await expect(page.getByText("Journey Platform Engineer was created")).toBeVisible();
  132 |     await page.getByRole("tab", { name: /^Requirements \(/ }).click();
  133 |     await expect(page.locator("[data-requirements-tab]")).toContainText("Journey Platform Engineer");
  134 |     await page.getByRole("tab", { name: "Overview" }).click();
  135 | 
  136 |     // add a client: it opens in the drawer and the tiles move
  137 |     await page.locator("[data-clear-filters]").click();
  138 |     await page.locator("[data-add-client]").click();
  139 |     await page.getByPlaceholder("TechCorp Inc.").fill("Journey Logistics");
  140 |     await page.locator("[data-add-submit]").click();
  141 |     await expect(page.getByText("Journey Logistics was added")).toBeVisible();
  142 |     await expect(page.locator("[data-client-title]")).toHaveText("Journey Logistics");
  143 |     await expect(kpi("totalClients")).toHaveText(String(total0 + 1));
  144 |     await expect(kpi("newThisMonth")).toHaveText(String(fresh0 + 1));
  145 |     await page.screenshot({ path: resolve(shots, "clients-added.png") });
  146 |     // the same name again is refused
  147 |     await page.locator("[data-add-client]").click();
  148 |     await page.getByPlaceholder("TechCorp Inc.").fill("journey logistics");
  149 |     await page.locator("[data-add-submit]").click();
  150 |     await expect(page.locator("[data-add-error]")).toContainText(/already have a client/);
  151 |     await page.getByRole("button", { name: "Cancel" }).click();
  152 | 
  153 |     // the other tabs are real lists
  154 |     await page.getByRole("tab", { name: /Contacts/ }).first().click();
  155 |     await expect(page.locator("[data-contacts-view] [data-contact-row]").first()).toBeVisible();
  156 |     await page.screenshot({ path: resolve(shots, "clients-contacts.png") });
  157 |     await page.getByRole("tab", { name: /Requirements/ }).first().click();
  158 |     await expect(page.locator("[data-requirements-view] [data-requirement-row]").first()).toBeVisible();
  159 |     await page.getByRole("tab", { name: /Activity/ }).click();
  160 |     await expect(page.locator("[data-activity-view] [data-activity-row]").first()).toBeVisible();
  161 |     await expect(page.locator("[data-activity-view]")).toContainText("Journey Logistics");
  162 |     await page.screenshot({ path: resolve(shots, "clients-activity.png") });
  163 | 
  164 |     // a phone gets cards and a bottom sheet
  165 |     await page.setViewportSize({ width: 390, height: 844 });
  166 |     await openClients(page, base);
  167 |     await expect(page.locator("[data-clients-list] ul li[data-row-id]").first()).toBeVisible();
  168 |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  169 |     await page.screenshot({ path: resolve(shots, "clients-phone.png") });
  170 |     await page.locator("[data-clients-list] ul li[data-row-id]").first().click();
  171 |     await expect(page.locator("#ent-client-sheet")).toBeVisible();
  172 |     await page.screenshot({ path: resolve(shots, "clients-phone-sheet.png") });
  173 |     expect(clientId).toBeTruthy();
  174 | 
  175 |     // the other tenant: Beta sees only its own clients, and Acme's ids are the generic 404 through either organization
  176 |     const betaCtx = await page.context().browser()!.newContext();
  177 |     const beta = await betaCtx.newPage();
  178 |     await signIn(beta, betaBase, "Bea Turner");
  179 |     await openClients(beta, betaBase);
  180 |     await expect(beta.locator("[data-clients-page]")).toBeVisible();
  181 |     await expect(beta.locator("tr[data-row-id]").first()).toBeVisible();
  182 |     await expect(beta.locator("[data-clients-page]")).not.toContainText("Journey Logistics");
  183 |     const out = await beta.evaluate(async (acmeClient) => {
  184 |       const me = (await (await fetch("/api/me/tenant")).json()) as { org: { id: number } };
  185 |       const mine = (await (await fetch(`/api/orgs/${me.org.id}/clients?size=100`)).json()) as { total: number; items: { name: string }[] };
  186 |       const acmeOrg = me.org.id === 1 ? 2 : 1;
  187 |       const viaOwn = await fetch(`/api/orgs/${me.org.id}/clients/${acmeClient}`);
  188 |       const viaAcme = await fetch(`/api/orgs/${acmeOrg}/clients`);
  189 |       const write = await fetch(`/api/orgs/${acmeOrg}/clients/${acmeClient}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "hijack" }) });
  190 |       return { total: mine.total, names: mine.items.map((i) => i.name), viaOwn: viaOwn.status, viaAcme: viaAcme.status, write: write.status };
  191 |     }, clientId!);
  192 |     expect(out.total).toBeGreaterThan(0);
  193 |     expect(out.names).not.toContain("Journey Logistics");
  194 |     expect(out.viaOwn).toBe(404);
  195 |     expect(out.viaAcme).toBe(404);
  196 |     expect(out.write).toBe(404);
  197 |     await betaCtx.close();
  198 |   });
  199 | });
  200 | 
```