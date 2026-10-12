// Launcher tests (I1.14): env-file parsing, shell-wins merging, stub isolation, and "names only, never a value".
// Run: node --test scripts/dev/api-local.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildChildEnv, loadedMessage, main, parseArgs, parseEnvFile } from "./api-local.mjs";

const SECRET = "AIzaSy-not-a-real-key-0123456789";

test("parseEnvFile: KEY=VALUE, comments, export, quotes, trailing comments", () => {
  const vars = parseEnvFile(
    [
      "# a comment",
      "",
      "DOSSIER_AI_ENABLED=true",
      "export DOSSIER_AI_PROVIDER=gemini",
      `DOSSIER_AI_API_KEY="${SECRET}"`,
      "SINGLE='quoted value'",
      "WITH_COMMENT=abc   # not part of the value",
      "HASH_INSIDE=ab#cd",
      "not a pair",
      "=novalue",
      "1BAD=x",
      "EMPTY=",
    ].join("\r\n"),
  );
  assert.deepEqual(vars, {
    DOSSIER_AI_ENABLED: "true",
    DOSSIER_AI_PROVIDER: "gemini",
    DOSSIER_AI_API_KEY: SECRET,
    SINGLE: "quoted value",
    WITH_COMMENT: "abc",
    HASH_INSIDE: "ab#cd",
    EMPTY: "",
  });
});

test("buildChildEnv: the shell wins over the file; the profile is dev", () => {
  const { env, loaded } = buildChildEnv({ PATH: "/bin", DOSSIER_AI_PROVIDER: "from-shell" }, { DOSSIER_AI_PROVIDER: "gemini", DOSSIER_AI_API_KEY: SECRET });
  assert.equal(env.DOSSIER_AI_PROVIDER, "from-shell");
  assert.equal(env.DOSSIER_AI_API_KEY, SECRET);
  assert.deepEqual(loaded, ["DOSSIER_AI_API_KEY"]);
  assert.equal(env.SPRING_PROFILES_ACTIVE, "dev");
  assert.equal(env.SPRING_PROFILES_INCLUDE, undefined, "the stub is never on unless asked for");
});

test("buildChildEnv: --stub ignores the file entirely and turns on ai-stub", () => {
  const { env, loaded } = buildChildEnv({ PATH: "/bin" }, { DOSSIER_AI_API_KEY: SECRET }, { stub: true });
  assert.equal(env.DOSSIER_AI_API_KEY, undefined);
  assert.deepEqual(loaded, []);
  assert.equal(env.SPRING_PROFILES_ACTIVE, "dev");
  assert.equal(env.SPRING_PROFILES_INCLUDE, "ai-stub");
});

test("loadedMessage prints names, never values", () => {
  const msg = loadedMessage(["DOSSIER_AI_ENABLED", "DOSSIER_AI_API_KEY"], "api/.env.ai.local");
  assert.equal(msg, "api-local: loaded DOSSIER_AI_ENABLED, DOSSIER_AI_API_KEY from api/.env.ai.local");
  assert.ok(!msg.includes(SECRET));
});

test("parseArgs: --stub, --file, -- passthrough, unknown option", () => {
  const a = parseArgs(["--stub", "--", "--info", "-x", "test"]);
  assert.equal(a.stub, true);
  assert.deepEqual(a.passthrough, ["--info", "-x", "test"]);
  assert.equal(parseArgs([]).stub, false);
  assert.ok(parseArgs(["--file", "x.env"]).envFile.endsWith("x.env"));
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
});

test("main: logs variable names from the file and never the key (dry run)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "api-local-"));
  const file = path.join(dir, ".env.ai.local");
  writeFileSync(file, `DOSSIER_AI_ENABLED=true\nDOSSIER_AI_API_KEY=${SECRET}\n`);
  const lines = [];
  const r = main(["--dry-run", "--file", file, "--", "--info"], { PATH: "x" }, (l) => lines.push(l));
  const all = lines.join("\n");
  assert.equal(r.code, 0);
  assert.match(all, /loaded DOSSIER_AI_ENABLED, DOSSIER_AI_API_KEY from /);
  assert.ok(!all.includes(SECRET), "the key must never be printed");
  assert.equal(r.env.DOSSIER_AI_API_KEY, SECRET);
  assert.equal(r.env.SPRING_PROFILES_ACTIVE, "dev");
  assert.ok(r.commandArgs.includes("bootRun") && r.commandArgs.includes("--info"));
});

test("main: no env file is a notice, not an error", () => {
  const lines = [];
  const r = main(["--dry-run", "--file", path.join(tmpdir(), "definitely-not-here.env")], { PATH: "x" }, (l) => lines.push(l));
  assert.equal(r.code, 0);
  assert.match(lines.join("\n"), /server AI stays off/);
});

test("main: --stub reads no file and says it is the stub", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "api-local-"));
  const file = path.join(dir, ".env.ai.local");
  writeFileSync(file, `DOSSIER_AI_API_KEY=${SECRET}\n`);
  const lines = [];
  const r = main(["--stub", "--dry-run", "--file", file], { PATH: "x" }, (l) => lines.push(l));
  assert.equal(r.env.DOSSIER_AI_API_KEY, undefined);
  assert.equal(r.env.SPRING_PROFILES_INCLUDE, "ai-stub");
  assert.match(lines.join("\n"), /STUB mode/);
  assert.ok(!lines.join("\n").includes(SECRET));
});

test("main: refuses NODE_ENV=production", () => {
  const r = main(["--dry-run"], { NODE_ENV: "production" }, () => {});
  assert.equal(r.code, 1);
});
