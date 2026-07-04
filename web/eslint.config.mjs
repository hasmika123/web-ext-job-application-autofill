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
  // next/og images must be self-contained (no imports resolve in the OG runtime).
  {
    files: ["src/app/opengraph-image.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
