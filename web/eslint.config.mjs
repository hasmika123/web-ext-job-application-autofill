import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import kiwiply from "./eslint-rules/kiwiply.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated build-time copy of the extension's parser-core — lint the source instead.
    "src/lib/generated/**",
  ]),
  // Design-system guardrail: every icon comes from @kiwiply/ui (packages/ui), never inline
  // SVG — keeps the artwork uniform across web + extension. See packages/ui/README.md.
  {
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='svg']",
          message:
            "Inline <svg> icons are not allowed — add the glyph to @kiwiply/ui (packages/ui/src/primitives/icons.tsx) and import it, so icons stay uniform across web + extension.",
        },
      ],
    },
  },
  // Resume Builder (DESIGN 15.1): no tunable is a literal. Limits, caps, weights and timings are
  // settings: they come from the settings seam via src/lib/resume-builder-config.ts. Enforced by
  // the local rule `resume-builder/no-config-literal` (below): in the builder folder a numeric
  // literal >= 100 is an error unless the line itself, or the line above, carries
  //   // config-literal-ok: <reason>
  // The reason is mandatory and says why the number is not a builder tunable (a pixel / viewport /
  // art size, a unit conversion, a schema constant with no settings key, ...). A number that IS a
  // limit with a settings key reads `config.limits.*` instead; nothing in this block is exempted by
  // FILE, and the rule is separate from the `no-restricted-syntax` svg rule above, so the inline-svg
  // ban still applies to every file here too. Test files are not covered (they pin fixtures).
  {
    files: ["src/components/app-v3/resume-builder/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    plugins: {
      "resume-builder": {
        rules: {
          "no-config-literal": {
            meta: {
              type: "problem",
              schema: [],
              messages: {
                literal:
                  "Numeric literal {{raw}} (>= 100) in the Resume Builder UI: limits, caps and timings are settings - read them from the builder config (web/src/lib/resume-builder-config.ts). If it is genuinely not a tunable (layout / art size, unit conversion, schema constant), add `// config-literal-ok: <reason>` on this line or the line above.",
              },
            },
            create(context) {
              const covered = new Set();
              for (const c of context.sourceCode.getAllComments()) {
                if (!/config-literal-ok:\s*\S/.test(c.value)) continue;
                covered.add(c.loc.start.line);
                covered.add(c.loc.end.line);
                covered.add(c.loc.end.line + 1);
              }
              return {
                Literal(node) {
                  if (typeof node.value !== "number" || node.value < 100) return;
                  if (covered.has(node.loc.start.line)) return;
                  context.report({ node, messageId: "literal", data: { raw: node.raw } });
                },
              };
            },
          },
        },
      },
    },
    rules: { "resume-builder/no-config-literal": "error" },
  },
  // Every icon-only control has an accessible name (E2E-U0.0, DECISIONS #32). Rule: web/eslint-rules/kiwiply.mjs.
  {
    files: ["src/**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    plugins: { kiwiply },
    rules: { "kiwiply/icon-button-needs-label": "error" },
  },
  // next/og images must be self-contained (no imports resolve in the OG runtime).
  {
    files: ["src/app/opengraph-image.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
