import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
  // Resume Builder (DESIGN 15.1): no tunable is a literal. Limits, weights and timings come from
  // the settings seam via src/lib/resume-builder-config.ts; a number >= 100 in the builder UI is
  // almost always one of them. (A flat-config block replaces the rule above for these files, so the
  // svg selector is repeated.)
  {
    files: ["src/components/app-v3/resume-builder/**/*.{ts,tsx}"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      // R0 code that predates the rule and still hard-codes its constants (autosave delays, history
      // cap, id entropy, the document limits mirrored in the reducer, the title maxLength). Each file
      // leaves this list when the story that rebuilds it reads the value from the builder config.
      "**/EditorTopBar.tsx",
      "**/ResumeEditor.tsx",
      "**/state/autosave.ts",
      "**/state/history.ts",
      "**/state/ids.ts",
      "**/state/reducer.ts",
      // Geometry, not tunables: ui.ts holds the DESIGN 10.1 viewport breakpoints and sheet widths (R2.9);
      // ResumesHero and templateThumbs size art assets in pixels (the My Resumes list shell predates the rule).
      "**/state/ui.ts",
      "**/list/ResumesHero.tsx",
      "**/list/templateThumbs.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='svg']",
          message:
            "Inline <svg> icons are not allowed — add the glyph to @kiwiply/ui (packages/ui/src/primitives/icons.tsx) and import it, so icons stay uniform across web + extension.",
        },
        {
          selector: "Literal[raw=/^[0-9.]/][value>=100]",
          message:
            "Numeric literals >= 100 are not allowed in the Resume Builder UI — limits, weights and timings are settings. Read them from the builder config (web/src/lib/resume-builder-config.ts) instead of hard-coding them.",
        },
      ],
    },
  },
  // next/og images must be self-contained (no imports resolve in the OG runtime).
  {
    files: ["src/app/opengraph-image.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
