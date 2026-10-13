# Real-stack runbook: the enterprise demo tenants (X1.12)

How to run Enterprise V2 end to end on the real stack (Spring API + MySQL + the web app) with the demo tenants **Acme Staffing**
and **Beta Talent**, and sign in as any demo member with one click. Development only: the seeder refuses to run under the `prod`
profile, and both switches below default to off.

## What you get

| Host | Organization | People |
|---|---|---|
| `http://acme.localhost:3200` | Acme Staffing (CONSULTANCY), teal/amber branding, a generated logo | Sarah Chen (Organization Admin + Marketing Manager), Omar Haddad (Marketing Specialist), Anika Rao and Ben Okafor (Consultants), Hana Petrov (HR Specialist), Felix Ng (Finance Specialist), Amara Silva (Account Manager), Tomas Berg (Talent Acquisition), Eve Lindqvist (Executive Viewer), Sam Whitfield (SUSPENDED), Nina Vogel (INVITED, no account yet) |
| `http://beta.localhost:3200` | Beta Talent (COMPANY), indigo/pink branding | Bea Turner (Owner) |

Two assignments exist: Sarah is Anika's PRIMARY marketer, Omar is Ben's. Logins are `demo-ent-{acme|beta}-{first name}`; nobody types
them. There is **no password** to know: each member gets a random password hash on every boot, and the only way in is the
**Demo accounts** tab on the tenant sign-in page (left edge of the screen).

The roster lives in `api/.../EnterpriseDemoSeeder.java`; `web/scripts/fixtures/enterprise-demo.json` is the same table for the mock
API and `EnterpriseDemoSeederIT` fails when the two differ.

## The switches (config only)

| Variable | Needed value | Why |
|---|---|---|
| `DEMO_ENABLED` | `true` | the regular demo switch |
| `ENT_DEMO_SEED` | `true` | seeds the two tenants at startup (property `dossier.demo.enterprise-seed`, default false) |
| `DEMO_ALLOW_WRITES` | unset (set `true` only to drive WRITES as a demo member, e.g. the Employees journey `web/e2e/journeys/tenant-employees.spec.ts`) | the demo sandbox stays on: account and billing writes are refused for demo members |
| `DOSSIER_TENANT_HOST_SECRET` | the same random value on the API and the web | the API only believes `X-Kiwiply-Host` from the web server |
| `APPLICATION_LIQUIBASE_ASYNC_START` | `false` | on a fresh database the startup seeders must not race the migrations |
| `DOSSIER_STORAGE_DRIVER` / `DOSSIER_STORAGE_LOCAL_ROOT` | `local` + a folder | the demo logo is stored through the FileStorage seam; no S3 needed |
| `dossier.tenant-host.allow-localhost-tenants` | `true` | already true in the `dev` profile; makes `*.localhost` a tenant base domain (never in prod) |

The seeder also turns `flag.enterprise`, `flag.enterprise.domains` and `flag.enterprise.roles` on **for the two demo organizations
only** (an allow list in the settings rows, merged with any list already there; an "on for everyone" flag is left alone) and adds
`localhost` to `enterprise.hosts.tenant_base_domains`. Every other organization on the same database stays dark.

## Start it

1. **MySQL**: the existing container `rb-demo-mysql` listens on `127.0.0.1:33511` (throwaway local root password `demotest`). Use
   a database of your own so you never touch another preview's data:
   `docker exec rb-demo-mysql mysql -uroot -p<root password> -e "CREATE DATABASE IF NOT EXISTS dossier_ent_demo CHARACTER SET utf8mb4"`.
2. **API on 18183** (`api/`): `./gradlew bootRun` with
   `SERVER_PORT=18183`, `SPRING_DATASOURCE_URL=jdbc:mysql://localhost:33511/dossier_ent_demo?useSSL=false&createDatabaseIfNotExist=true`,
   `SPRING_DATASOURCE_USERNAME=root`, `SPRING_DATASOURCE_PASSWORD=<root password>`, `DEMO_ENABLED=true`, `ENT_DEMO_SEED=true`,
   `DOSSIER_TENANT_HOST_SECRET=<random>`, `APPLICATION_LIQUIBASE_ASYNC_START=false`, `DOSSIER_STORAGE_DRIVER=local`,
   `DOSSIER_STORAGE_LOCAL_ROOT=<a folder>`. First boot migrates the schema (about a minute) and then logs
   `Enterprise demo seeded: 2 orgs, ...`. Booting again changes nothing (idempotent).
   Windows: `JAVA_HOME` = JDK 17, `DOCKER_API_VERSION=1.44`.
3. **Web on 3200** from a **production build** (Next dev mode does not work in worktrees):
   `npm run build -w web`, then from `web/`: `DOSSIER_API_URL=http://localhost:18183 DOSSIER_TENANT_HOST_SECRET=<same random> TRUST_PROXY_HOST=false next start -p 3200`.
   `TRUST_PROXY_HOST=false` because nothing sits in front of this `next start`.
4. Open **http://acme.localhost:3200/login** (Chromium resolves `*.localhost` to loopback; no hosts-file change). Click **Demo accounts**,
   pick **Sarah Chen**. You land on the workspace the API names for her primary role. `http://beta.localhost:3200/login` shows Beta's
   branding and its one member; a click on Sarah is not even offered there, and the API refuses her with `NOT_A_MEMBER` if asked.

`docs/claude-launch.example.json` has launch entries (`ent-api`, `ent-web`) for the same two processes; fill in the two secrets
in your own `.claude/launch.json` (never commit them).

## What to check

- `GET /api/public/tenant/demo` with `X-Kiwiply-Host: acme.localhost` (and the host secret) lists the eleven members with their
  role names; on `localhost` it is `{"enabled":false,"accounts":[]}`.
- `POST /api/authenticate/demo {"login":"demo-ent-acme-sarah"}` on Acme's host returns a token pair whose access and refresh
  tokens carry `tid` = Acme's organization id; the same call on Beta's host is `403 NOT_A_MEMBER`, on a platform host `404`,
  and with `DEMO_ENABLED=false` it is `403 DEMO_DISABLED`.
- `GET /api/me/tenant` with her token lists **two roles** (Organization Admin, Marketing Manager). Only the workspaces whose
  module is live open: the Marketing module flag is still deferred (not registrable), so Sarah's switcher shows Admin today and
  gains Marketing when that module ships.
- A suspended member (Sam) and the invited one (Nina) are listed in the tab but cannot be opened.

## Without the API: the mock

`npm run dev:demo -w web` serves the same two tenants and the same eleven members from `web/scripts/mock-api.mjs`
(`scripts/fixtures/enterprise.mjs` + `enterprise-demo.json`), so `http://acme.localhost:3100/login` has the same tab. The mock's
`/api/me/tenant` for a demo member goes through the same role templates and workspace definitions the API uses. Switch off with
`MOCK_DEMO_ENABLED=false` or `MOCK_ENTERPRISE_ENABLED=false`.

## Stopping and resetting

Kill only the processes you started (by PID). To start from nothing: stop the API, `DROP DATABASE dossier_ent_demo`, recreate it, boot again.
