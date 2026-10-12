/**
 * Mock API fixture `org-roles` (O1.6 / O1.7 / O2.1 / O2.7): the people and organizations the org console journeys sign in
 * as. Brand-new, NON-demo accounts (test credentials that exist only in this mock) with nothing but their memberships, so
 * the console is what a real admin sees on day one: an honest empty state, never a sample row. Use it next to the other
 * fixture: `MOCK_FIXTURE=fresh,org-roles npm run dev:demo -w web`, then sign in on /login with the password below.
 *
 *   org.none      belongs to no organization            -> /org redirects to /org/new
 *   org.creator   belongs to no organization            -> walks the create flow end to end
 *   org.member    a plain MEMBER of Maple University    -> /org redirects to /dashboard with the explanation toast
 *   org.owner     OWNER of Northside Career Center (ACTIVE, 4 seats, no groups yet)
 *   org.admin     ADMIN, org.staff STAFF, org.finance FINANCE of the same org (role-aware nav)
 *   org.draft     OWNER of Lakeside Bootcamp (DRAFT: not activated yet)
 *   org.multi     OWNER of Harbor Staffing, ADMIN of Zephyr Academy, MEMBER of Orbit Coaching (the switcher)
 *
 * The demo logins keep their own organization (`fixtures/demo-org.json`); this file never touches it.
 */
const PASSWORD = "fixture-pass-1"; // test-only credentials for the local mock

const person = (login, firstName, lastName) => ({
  login,
  email: `${login}@example.test`,
  firstName,
  lastName,
  authorities: ["ROLE_USER"],
  activated: true,
  password: PASSWORD,
  empty: true,
});

const fixture = {
  name: "org-roles",
  accounts: Object.fromEntries(
    [
      person("org.none", "Nia", "Okoye"),
      person("org.creator", "Casey", "Lindqvist"),
      person("org.member", "Mina", "Park"),
      person("org.owner", "Olu", "Adeyemi"),
      person("org.admin", "Ada", "Ramos"),
      person("org.staff", "Stu", "Novak"),
      person("org.finance", "Fay", "Whitaker"),
      person("org.draft", "Dee", "Castillo"),
      person("org.multi", "Mo", "Haddad"),
    ].map((a) => [a.login, a]),
  ),
  orgs: [
    {
      id: 101, slug: "northside-career-center", name: "Northside Career Center", type: "SCHOOL", status: "ACTIVE", timezone: "America/Chicago", sizeBand: "51_200", country: "US",
      members: [
        { login: "org.owner", role: "OWNER" },
        { login: "org.admin", role: "ADMIN" },
        { login: "org.staff", role: "STAFF" },
        { login: "org.finance", role: "FINANCE" },
      ],
    },
    {
      id: 102, slug: "lakeside-bootcamp", name: "Lakeside Bootcamp", type: "BOOTCAMP", status: "DRAFT", timezone: "America/New_York", sizeBand: "1_50", country: "US",
      members: [{ login: "org.draft", role: "OWNER" }],
    },
    {
      id: 201, slug: "harbor-staffing", name: "Harbor Staffing", type: "CONSULTANCY", status: "ACTIVE", timezone: "America/Los_Angeles",
      members: [{ login: "org.multi", role: "OWNER" }],
    },
    {
      id: 202, slug: "zephyr-academy", name: "Zephyr Academy", type: "BOOTCAMP", status: "ACTIVE", timezone: "Europe/London", groups: ["Spring cohort"],
      members: [{ login: "org.multi", role: "ADMIN" }],
    },
    {
      id: 203, slug: "orbit-coaching", name: "Orbit Coaching", type: "OUTPLACEMENT", status: "ACTIVE",
      members: [{ login: "org.multi", role: "MEMBER" }],
    },
    {
      id: 301, slug: "maple-university", name: "Maple University", type: "SCHOOL", status: "ACTIVE",
      members: [{ login: "org.member", role: "MEMBER" }],
    },
  ],
};

export default fixture;
