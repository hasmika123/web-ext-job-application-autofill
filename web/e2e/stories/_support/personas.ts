/** The demo roster (api EnterpriseDemoSeeder / web/scripts/fixtures/enterprise-demo.json). Nobody types a password: sign-in is the "Demo accounts" tab. */
export const PORT = process.env.E2E_REAL_PORT ?? "3200";

export interface Persona {
  key: string;
  /** "Sign in as <name>" button label on the Demo accounts tab. */
  name: string;
  tenant: "acme" | "beta" | "gamma";
  roles: string[];
  /** The workspace slug the member lands on after sign-in. */
  home: string;
  /**
   * "demo" (default): one-click Demo accounts tab. "password": a SEPARATE-accounts organization (Gamma) whose people are real enterprise
   * accounts; they sign in with their e-mail and the dev password, which is read from the GAMMA_DEMO_PASSWORD environment variable at run time
   * (never written in a spec, a log or a doc).
   */
  signIn?: "demo" | "password";
  /** The sign-in e-mail of a "password" persona (invented, on example.com). */
  email?: string;
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
  // Gamma Consulting: SEPARATE accounts (decision O4). Only real enterprise accounts can be acted for, so the act-for resume stories live here.
  gina: { key: "gina", name: "Gina Alvarez", tenant: "gamma", roles: ["OWNER"], home: "admin", signIn: "password", email: "gina.alvarez@gamma.example.com" },
  oscar: { key: "oscar", name: "Oscar Fraser", tenant: "gamma", roles: ["ORG_ADMIN"], home: "admin", signIn: "password", email: "oscar.fraser@gamma.example.com" },
  marco: { key: "marco", name: "Marco Bellini", tenant: "gamma", roles: ["MARKETING_SPECIALIST"], home: "marketing", signIn: "password", email: "marco.bellini@gamma.example.com" },
  cora: { key: "cora", name: "Cora Lindahl", tenant: "gamma", roles: ["CONSULTANT"], home: "consultant", signIn: "password", email: "cora.lindahl@gamma.example.com" },
  dana: { key: "dana", name: "Dana Moreau", tenant: "gamma", roles: ["CONSULTANT"], home: "consultant", signIn: "password", email: "dana.moreau@gamma.example.com" },
} as const satisfies Record<string, Persona>;

export type PersonaKey = keyof typeof PERSONAS;

export const hostOf = (p: Persona) => `http://${p.tenant}.localhost:${PORT}`;
