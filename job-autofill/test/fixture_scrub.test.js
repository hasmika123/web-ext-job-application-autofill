// Regression tests for the local ATS fixture scrubber. It must preserve matcher structure while
// removing executable content, values, third-party URLs, and accidental candidate data.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { scrubHtml } = require("../scripts/fixture-scrub");

let pass = 0, fail = 0;
const fails = [];
function ok(name, condition, extra) {
  if (condition) pass++;
  else { fail++; fails.push(name + (extra ? `  ->  ${extra}` : "")); }
}

(function run() {
  const input = `<!doctype html><html><body onload="boom()">
    <script>document.cookie = "bad";</script><link rel="preload" href="https://evil.test/app.js">
    <meta property="og:url" content="/apply?session_token=secret#candidate"><meta http-equiv="refresh" content="0;url=https://evil.test/next?session_token=secret"><form action="/apply?session_token=secret#candidate"><label for="x">Email</label><p>ada@example.com</p><input id="x" name="email" value="ada@example.com" onblur="boom()">
    <textarea>+1 (212) 555-0199</textarea><select><option selected value="secret">United States</option></select>
    <style>.avatar { background-image: url(https://cdn.evil.test/a.png) }</style><img src="https://cdn.evil.test/a.png" srcset="https://cdn.evil.test/a.png 1x" style="background-image:url(data:image/png;base64,AAAA)"><a href="javascript:alert(1)">Ada Lovelace</a>
    <div data-automation-id="keep-me" aria-label="Ada Lovelace" placeholder="Call +1 (212) 555-0199">Ada Lovelace</div></form></body></html>`;
  const out = scrubHtml(input, { origin: "https://jobs.example.test", replacements: { "Ada Lovelace": "Synthetic Candidate" } });
  ok("scripts removed", !/<script/i.test(out));
  ok("styles removed", !/<style/i.test(out));
  ok("preload links removed", !/rel="preload"/i.test(out));
  ok("inline event handlers removed", !/onload=|onblur=/i.test(out));
  ok("input values removed", !/value="ada@example.com"/i.test(out));
  ok("textarea value removed", !/212|555-0199/.test(out));
  ok("select option vocabulary kept", /United States/.test(out));
  ok("selected state removed", !/selected(?:="selected")?/i.test(out));
  ok("option values removed", !/value="secret"/.test(out));
  ok("third-party URLs neutralized", !/evil\.test|javascript:/i.test(out));
  ok("same-origin query and fragment stripped", !/session_token|candidate/.test(out) && /action="https:\/\/jobs.example.test\/apply"/.test(out) && /content="https:\/\/jobs.example.test\/apply"/.test(out));
  ok("base64 blobs neutralized", !/base64,/i.test(out));
  ok("matcher data attributes kept", /data-automation-id="keep-me"/.test(out));
  ok("email scrubbed", !/ada@example\.com/i.test(out) && /synthetic@example\.test/i.test(out));
  ok("name scrubbed", !/Ada Lovelace/.test(out) && /Synthetic Candidate/.test(out));
  ok("candidate data scrubbed from text attributes", !/Ada Lovelace|212|555-0199/.test(out));
  ok("size guard rejects oversized source", (() => {
    try { scrubHtml("x".repeat(101), { maxBytes: 100 }); return false; } catch (e) { return /exceeds/.test(e.message); }
  })());

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jaf-fixture-scrub-"));
  try {
    const inputPath = path.join(temp, "input.html");
    const outputPath = path.join(temp, "output.html");
    fs.writeFileSync(inputPath, "<p>Ada Lovelace</p>");
    const cli = spawnSync(process.execPath, [path.join(__dirname, "../scripts/fixture-scrub.js"), inputPath, outputPath, JSON.stringify({ "Ada Lovelace": "Synthetic Candidate" })], { encoding: "utf8" });
    const cliOutput = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    ok("CLI accepts candidate-specific replacements", cli.status === 0 && /Synthetic Candidate/.test(cliOutput) && !/Ada Lovelace/.test(cliOutput));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  console.log(`[fixture_scrub] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log(`  x ${f}`)); process.exit(1); }
})();
