import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import plugin from "./kiwiply.mjs";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
});

describe("kiwiply/icon-button-needs-label", () => {
  it("accepts named icon controls and reports unnamed ones", () => {
    tester.run("icon-button-needs-label", plugin.rules["icon-button-needs-label"], {
      valid: [
        { code: `const a = <IconButton aria-label="Close"><XIcon /></IconButton>;` },
        { code: `const a = <button type="button" aria-label="Close"><XIcon /></button>;` },
        { code: `const a = <button aria-labelledby="t"><svg /></button>;` },
        // text makes it a normal button
        { code: `const a = <button><XIcon /> Close</button>;` },
        { code: `const a = <button>Close</button>;` },
        // a spread may carry the label
        { code: `const a = <IconButton {...props}><XIcon /></IconButton>;` },
        // dynamic children: cannot tell, so no report
        { code: `const a = <button>{children}</button>;` },
        // other elements are not this rule's business
        { code: `const a = <div><XIcon /></div>;` },
      ],
      invalid: [
        { code: `const a = <IconButton onClick={f}><XIcon /></IconButton>;`, errors: [{ messageId: "label" }] },
        { code: `const a = <button type="button" onClick={f}><XIcon className="h-4" /></button>;`, errors: [{ messageId: "label" }] },
        { code: `const a = <button>\n  <TrashIcon />\n</button>;`, errors: [{ messageId: "label" }] },
        { code: `const a = <button title="Close"><svg /></button>;`, errors: [{ messageId: "label" }] },
      ],
    });
  });
});

describe("kiwiply/one-mascot-per-file", () => {
  it("allows one mascot and reports the second", () => {
    tester.run("one-mascot-per-file", plugin.rules["one-mascot-per-file"], {
      valid: [
        { code: `const a = <MascotPose pose="empty" />;` },
        { code: `const a = <EmptyState mascotPose="empty" title="x" />;` },
        { code: `const a = <div><EnterpriseMascot pose="greet" /></div>;` },
        { code: `const a = <EmptyState mascot title="x" />;` },
      ],
      invalid: [
        { code: `const a = <><MascotPose pose="empty" /><MascotPose pose="peek" /></>;`, errors: [{ messageId: "many" }] },
        { code: `const a = <><EnterpriseMascot pose="greet" /><EmptyState mascotPose="empty" title="x" /></>;`, errors: [{ messageId: "many" }] },
        { code: `const a = <><MascotPose pose="a" /><MascotPose pose="b" /><MascotPose pose="c" /></>;`, errors: [{ messageId: "many" }, { messageId: "many" }] },
      ],
    });
  });
});
