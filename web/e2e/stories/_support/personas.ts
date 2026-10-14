/** The demo roster (api EnterpriseDemoSeeder / web/scripts/fixtures/enterprise-demo.json). Nobody types a password: sign-in is the "Demo accounts" tab. */
export const PORT = process.env.E2E_REAL_PORT ?? "3200";

export interface Persona {
  key: string;
  /** "Sign in as <name>" button label on the Demo accounts tab. */
  name: string;
  tenant: "acme" | "beta";
  roles: string[];
  /** The workspace slug the member lands on after sign-in. */
  home: string;
}

export const PERSONAS = {
  sarah: { key: "sarah", name: "Sarah Chen", tenant: "acme", roles: ["ORG_ADMIN", "MARKETING_MANAGER"], home: "admin" },
  omar: { key: "omar", name: "Omar Haddad", tenant: "acme", roles: ["MARKETING_SPECIALIST"], home: "marketing" },
  anika: { key: "anika", name: "Anika Rao", tenant: "acme", roles: ["CONSULTANT"], home: "consultant" },
  ben: { key: "ben", name: "Ben Okafor", tenant: "acme", roles: ["CONSULTANT"], home: "consultant" },
  hana: { key: "hana", name: "Hana Petrov", tenant: "acme", roles: ["HR_SPECIALIST"], home: "hr" },
  felix: { key: "felix", name: "Felix Ng", tenant: "acme", roles: ["FINANCE_SPECIALIST"], home: "finance" },
  amara: { key: "amara", name: "Amara Silva", tenant: "acme", roles: ["ACCOUNT_MANAGER"], home: "accounts" },
  tomas: { key: "tomas", name: "Tomas Berg", tenant: "acme", roles: ["TALENT_ACQUISITION"], home: "hr" },
  eve: { key: "eve", name: "Eve Lindqvist", tenant: "acme", roles: ["EXECUTIVE_VIEWER"], home: "exec" },
  bea: { key: "bea", name: "Bea Turner", tenant: "beta", roles: ["OWNER"], home: "admin" },
} as const satisfies Record<string, Persona>;

export type PersonaKey = keyof typeof PERSONAS;

export const hostOf = (p: Persona) => `http://${p.tenant}.localhost:${PORT}`;
