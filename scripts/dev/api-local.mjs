#!/usr/bin/env node
/**
 * Starts the Spring API for local development with the AI settings from `api/.env.ai.local` (I1.14).
 *
 *   node scripts/dev/api-local.mjs                 # real Gemini: reads api/.env.ai.local
 *   node scripts/dev/api-local.mjs --stub          # the deterministic stub provider: no key, no network, no cost
 *   node scripts/dev/api-local.mjs -- --info       # anything after `--` goes to gradlew
 *
 * The env file is `KEY=VALUE` lines (`#` comments, optional `export `, optional quotes), e.g.
 *
 *   DOSSIER_AI_ENABLED=true
 *   DOSSIER_AI_PROVIDER=gemini
 *   DOSSIER_AI_API_KEY=<your key>
 *
 * Rules (AI-ADMIN-CONFIG-DESIGN 7.2): the values go to the CHILD PROCESS ENVIRONMENT only (never written anywhere,
 * never printed - the launcher prints variable NAMES, nothing else); a variable already set in your shell wins over
 * the file; `NODE_ENV=production` is refused; `--stub` ignores the file, so a real key and the stub can never meet.
 * Everything else about the API (ports, database, storage) is the usual Spring environment: set SERVER_PORT,
 * SPRING_DATASOURCE_URL, ... in your shell first.
 *
 * Tested by scripts/dev/api-local.test.mjs (`node --test scripts/dev/api-local.test.mjs`).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `KEY=VALUE` lines to an object. `#` comments and blank lines are skipped; `export ` and one pair of quotes are stripped. */
export function parseEnvFile(text) {
  const vars = {};
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const name = line
      .slice(0, eq)
      .replace(/^export\s+/, "")
      .trim();
    if (!NAME.test(name)) continue;
    let value = line.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, ""); // a trailing ` # comment` on an unquoted value
    }
    vars[name] = value;
  }
  return vars;
}

/** The child environment: the shell's, plus the file's variables where the shell has not set them, plus the profile. */
export function buildChildEnv(base, fileVars, { stub = false } = {}) {
  const env = { ...base };
  const loaded = [];
  if (!stub) {
    for (const [k, v] of Object.entries(fileVars)) {
      if (env[k] === undefined || env[k] === "") {
        env[k] = v;
        loaded.push(k);
      }
    }
  }
  env.SPRING_PROFILES_ACTIVE = "dev";
  // gradlew bootRun passes --spring.profiles.active=dev,... on the command line (gradle/profile_dev.gradle), which beats
  // the env var above, so the stub is switched on with the ADDITIVE spring.profiles.include instead.
  if (stub) env.SPRING_PROFILES_INCLUDE = "ai-stub";
  else delete env.SPRING_PROFILES_INCLUDE;
  return { env, loaded };
}

/** The one line the launcher prints about the file: variable NAMES only, never a value. */
export function loadedMessage(names, fileLabel) {
  return names.length
    ? `api-local: loaded ${names.join(", ")} from ${fileLabel}`
    : `api-local: ${fileLabel} has nothing to load (the shell's variables already cover it)`;
}

export function parseArgs(argv) {
  const out = { stub: false, dryRun: false, envFile: path.join(root, "api", ".env.ai.local"), passthrough: [] };
  const dashes = argv.indexOf("--");
  const own = dashes < 0 ? argv : argv.slice(0, dashes);
  out.passthrough = dashes < 0 ? [] : argv.slice(dashes + 1);
  for (let i = 0; i < own.length; i++) {
    if (own[i] === "--stub") out.stub = true;
    else if (own[i] === "--dry-run") out.dryRun = true;
    else if (own[i] === "--file") out.envFile = path.resolve(own[++i] ?? "");
    else throw new Error(`unknown option ${own[i]} (use --stub, --file <path>, --dry-run, or -- <gradlew args>)`);
  }
  return out;
}

export function main(argv, base = process.env, log = console.log) {
  if (base.NODE_ENV === "production") {
    console.error("api-local: refusing to run with NODE_ENV=production (this is a development launcher).");
    return { code: 1 };
  }
  const args = parseArgs(argv);
  let fileVars = {};
  let label = path.relative(root, args.envFile).split(path.sep).join("/");
  if (args.stub) {
    log("api-local: STUB mode - profile ai-stub, every AI call is answered by a deterministic stub (no key is read, nothing leaves this machine)");
    label = "";
  } else if (existsSync(args.envFile)) {
    fileVars = parseEnvFile(readFileSync(args.envFile, "utf8"));
  } else {
    log(`api-local: no ${label} - server AI stays off unless your shell sets DOSSIER_AI_*; see DEPLOY.md section 10 (or pass --stub)`);
    label = "";
  }
  const { env, loaded } = buildChildEnv(base, fileVars, { stub: args.stub });
  if (label) log(loadedMessage(loaded, label));
  const win = process.platform === "win32";
  const command = win ? "cmd.exe" : "./gradlew";
  const commandArgs = win ? ["/d", "/c", ".\\gradlew.bat", "bootRun", ...args.passthrough] : ["bootRun", ...args.passthrough];
  if (args.dryRun) {
    log(`api-local: would run ${command} ${commandArgs.join(" ")} in api/ with profile dev${env.SPRING_PROFILES_INCLUDE ? " + " + env.SPRING_PROFILES_INCLUDE : ""}`);
    return { code: 0, env, command, commandArgs };
  }
  const child = spawn(command, commandArgs, { cwd: path.join(root, "api"), env, stdio: "inherit" });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  return { code: null, child };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const r = main(process.argv.slice(2));
    if (r.code !== null) process.exit(r.code);
  } catch (e) {
    console.error(`api-local: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
