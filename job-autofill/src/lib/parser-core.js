/* parser-core.js — pure resume text→structure logic, SHARED by the extension and
 * the web app. This is the structuring half of the old parser.js: heuristicStructure
 * (no-API parsing) + parseBio + all the regex helpers. It has ZERO dependency on the
 * DOM, chrome.*, window, pdf.js, or mammoth — it only turns plain text into objects.
 *
 * No build step: this loads as a classic <script> (attaches to JAF.parserCore) in the
 * extension AND as a CommonJS module (require) in Node and the Next.js web app, which
 * does its own file→text extraction and then calls the same heuristicStructure here.
 * The extension's parser.js keeps the environment-coupled I/O (PDF/DOCX/LLM) and
 * delegates structuring to this module.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  // Browser / extension global (and the jsdom test harness): attach to JAF.
  if (typeof root !== "undefined" && root) {
    const JAF = (root.JAF = root.JAF || {});
    JAF.parserCore = api;
  }
  // Node / bundler (web app, unit tests): CommonJS export.
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Self-sufficient skills splitter — kept identical to JAF.schema.splitSkills so
  // standalone (web-app/Node) parsing matches the extension exactly. Splits on commas,
  // semicolons, pipes, bullets, " / ", " & ", " and ", and newlines/tabs; trims
  // bullets, drops over-long blobs, and dedupes case-insensitively.
  function splitSkills(input) {
    const arr = Array.isArray(input) ? input : [input];
    const SEP = /[,;\n\r\t|·•‣▪◦●○∙⁃•·]|\s\/\s|\s&\s|\sand\s/i;
    const out = [], seen = new Set();
    arr.forEach((chunk) => {
      String(chunk == null ? "" : chunk).split(SEP).forEach((raw) => {
        const v = raw.replace(/^[\s\-–—•*▪◦‣·●○∙⁃]+/, "").replace(/[\s:]+$/, "").trim();
        if (!v || v.length > 40) return;
        const key = v.toLowerCase();
        if (!seen.has(key)) { seen.add(key); out.push(v); }
      });
    });
    return out;
  }
  // Prefer the extension's schema.splitSkills when present (single source of truth in
  // that context — identical behavior); otherwise use the bundled one above.
  function resolveSplitSkills() {
    const g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g.JAF && g.JAF.schema && g.JAF.schema.splitSkills) return g.JAF.schema.splitSkills;
    return splitSkills;
  }

  // --- Heuristic structuring (no API key) ----------------------------------
  const SECTION_WORDS = {
    summary: ["summary", "professional summary", "profile", "objective", "about", "about me"],
    skills: ["skills", "technical skills", "core competencies", "technologies", "expertise", "tech stack", "proficiencies"],
    experience: ["experience", "work experience", "employment", "professional experience", "work history", "employment history", "professional background"],
    education: ["education", "academic background", "academics", "qualifications", "academic qualifications"],
    projects: ["projects", "personal projects", "side projects", "academic projects", "selected projects", "notable projects"],
    languages: ["languages", "language proficiency", "spoken languages"],
    // recognized but parked so they DON'T bleed into the section above them:
    other: ["certifications", "certification", "licenses", "awards", "honors", "publications", "patents", "volunteer", "volunteering", "activities", "leadership", "interests", "hobbies", "references", "courses", "coursework", "involvement", "extracurricular"],
  };
  function detectSection(line) {
    const t = line.trim().toLowerCase().replace(/[:_*]/g, "").trim();
    if (t.length > 45) return null;
    for (const [sec, words] of Object.entries(SECTION_WORDS)) {
      if (words.some((w) => t === w || t === w + "s" || t.startsWith(w + " ") || t.startsWith(w + " &") || t.startsWith(w + " and"))) return sec;
    }
    // Relaxed match for headings that carry leading qualifiers, e.g. "Relevant
    // Technical Skills", "Core Technical Skills", "Areas of Expertise" — any heading
    // that ENDS in a section keyword. Gated on the line looking like a heading so we
    // never reclassify body text that merely happens to end in "skills".
    if (looksLikeHeading(line)) {
      for (const [sec, words] of Object.entries(SECTION_WORDS)) {
        if (words.some((w) => t.endsWith(" " + w) || t.endsWith(" " + w + "s"))) return sec;
      }
    }
    return null;
  }
  // A short, capitalized line with no sentence punctuation — a section heading
  // rather than a bullet or a sentence. Used to safely relax keyword matching above.
  function looksLikeHeading(raw) {
    const s = String(raw || "").trim().replace(/[\s:*_]+$/g, "").trim();
    if (!s || s.length > 45) return false;
    if (BULLET_RE.test(raw)) return false;
    if (/[.!?,;]$/.test(s)) return false;
    const words = s.split(/\s+/);
    if (words.length < 2 || words.length > 6) return false; // single-word headings already caught above
    const sig = words.filter((w) => !/^(of|the|and|&|a|to|in|for|with)$/i.test(w));
    const allCaps = /[A-Za-z]/.test(s) && s === s.toUpperCase();
    const titleCase = sig.length > 0 && sig.every((w) => /^[^A-Za-z]*[A-Z]/.test(w));
    return allCaps || titleCase;
  }
  // Which section does the text BEFORE a colon name? (for inline "Label: a, b, c")
  function detectSectionWord(head) {
    const t = head.toLowerCase().replace(/[*_]/g, "").trim();
    if (!t || t.length > 30) return null;
    for (const [sec, words] of Object.entries(SECTION_WORDS)) {
      if (words.some((w) => t === w || t === w + "s" || t.startsWith(w))) return sec;
    }
    return null;
  }

  const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
  const DATE_TOKEN = new RegExp(`(?:${MONTH}\\s*)?\\d{4}|\\d{1,2}\\/\\d{4}|\\d{1,2}\\/\\d{2}`, "i");
  const DATE_RE = new RegExp(`${DATE_TOKEN.source}|present|current|ongoing`, "i");
  const LOC_RE = /\bremote\b|\bhybrid\b|\bonsite\b|,\s*[A-Z]{2}\b|[A-Z][a-z]+,\s*[A-Z]{2}\b|,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s*$/;
  const TITLE_RE = /\b(engineer|developer|manager|intern|analyst|designer|scientist|consultant|lead|director|architect|administrator|specialist|coordinator|associate|officer|president|founder|owner|assistant|technician|researcher|programmer|strategist|recruiter|accountant|attorney|nurse|teacher|professor|fellow|ambassador|representative|agent|advisor|adviser|trainee|apprentice|head|vp|chief|cto|ceo|cfo|coo)\b/i;
  const BULLET_RE = /^\s*(?:[-–—•*▪◦‣·●○▸►▹◆◇∙⁃・]\s*|\d{1,2}[.)]\s+)/;
  const STRIP_BULLET = /^\s*(?:[-–—•*▪◦‣·●○▸►▹◆◇∙⁃・]\s*|\d{1,2}[.)]\s+)/;
  const DEGREE_RE = /\b(b\.?s\.?c?\.?|m\.?s\.?c?\.?|b\.?a\.?|m\.?a\.?|b\.?eng|m\.?eng|b\.?tech|m\.?tech|mba|ph\.?\s?d|bachelor|master|doctor(?:ate)?|associate|diploma|undergraduate|graduate)\b/i;

  // "City, ST" detection — a real US state abbreviation after a comma. Used to keep
  // a location (e.g. "Atlanta, GA") from ever being routed into skills/projects.
  const US_STATE_NAMES = { AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California", CO:"Colorado", CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia", HI:"Hawaii", ID:"Idaho", IL:"Illinois", IN:"Indiana", IA:"Iowa", KS:"Kansas", KY:"Kentucky", LA:"Louisiana", ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Michigan", MN:"Minnesota", MS:"Mississippi", MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada", NH:"New Hampshire", NJ:"New Jersey", NM:"New Mexico", NY:"New York", NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma", OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina", SD:"South Dakota", TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia", WA:"Washington", WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming", DC:"District of Columbia" };
  const US_STATE_ABBR = new Set(Object.keys(US_STATE_NAMES));
  const US_STATE_BY_NAME = {}; Object.values(US_STATE_NAMES).forEach((n) => { US_STATE_BY_NAME[n.toLowerCase()] = n; });
  function isCityState(s) {
    if (!s) return false;
    const t = String(s).trim();
    // "Atlanta, GA"  or  "Atlanta, Georgia" / "New York, New York"
    const m = t.match(/^([A-Za-z][A-Za-z.'\- ]+),\s*([A-Za-z][A-Za-z. ]+)$/);
    return !!(m && resolveStateName(m[2]));
  }
  // Resolve a region token after a city ("GA", "Georgia", "New York", "GA 30301")
  // to its proper full state name, or null if it isn't a US state.
  function resolveStateName(region) {
    if (!region) return null;
    const r = String(region).trim().replace(/\s+\d.*$/, "").trim(); // drop a trailing zip etc.
    if (/^[A-Za-z]{2}$/.test(r) && US_STATE_ABBR.has(r.toUpperCase())) return US_STATE_NAMES[r.toUpperCase()];
    if (US_STATE_BY_NAME[r.toLowerCase()]) return US_STATE_BY_NAME[r.toLowerCase()];
    // tolerate trailing words ("Georgia Remote", "New York NY") by trying shorter prefixes
    const words = r.split(/\s+/);
    for (let n = Math.min(words.length, 3); n >= 1; n--) {
      const cand = words.slice(0, n).join(" ");
      if (US_STATE_BY_NAME[cand.toLowerCase()]) return US_STATE_BY_NAME[cand.toLowerCase()];
      if (/^[A-Za-z]{2}$/.test(cand) && US_STATE_ABBR.has(cand.toUpperCase())) return US_STATE_NAMES[cand.toUpperCase()];
    }
    return null;
  }

  function splitCells(line) {
    return line.split(/\t+|\s{2,}|\s*\|\s*|\s*•\s*|\s*·\s*|\s*‧\s*/).map((s) => s.trim()).filter(Boolean);
  }
  function cleanSeg(s) { return (s || "").replace(/^[\s,;:|\-–—]+|[\s,;:|\-–—]+$/g, "").trim(); }
  function parseDateRange(s) {
    const present = /present|current|ongoing|now/i.test(s);
    const tokens = s.match(new RegExp(DATE_TOKEN.source, "gi")) || [];
    const startDate = (tokens[0] || "").trim();
    const endDate = (tokens[1] || (present ? "Present" : "")).trim();
    return { startDate, endDate, current: present };
  }

  // Split a header line into segments on tabs / 2+ spaces / pipes / spaced dashes
  // (NOT commas — "City, ST" uses a comma).
  function splitSegs(line) {
    return line.split(/\t+|\s{2,}|\s*\|\s*|\s+[–—]\s+|\s+-\s+|\s*•\s*|\s*·\s*/).map((s) => s.trim()).filter(Boolean);
  }
  // "Meta, Atlanta, GA" -> ["Meta","Atlanta, GA"]; "Atlanta, GA" -> ["","Atlanta, GA"].
  function splitCityState(tok) {
    const m = tok.match(/^(.*?)(?:,\s*)?([A-Z][A-Za-z.'\- ]+,\s*[A-Z]{2}|remote|hybrid|onsite)\s*$/i);
    if (m) return [cleanSeg(m[1]), m[2].trim()];
    return [tok, null];
  }
  const RANGE_RE = new RegExp(`(?:${DATE_TOKEN.source}|present|current)\\s*(?:[-–—]|to|until|–|—)\\s*(?:${DATE_TOKEN.source}|present|current|ongoing)`, "i");
  const SINGLE_DATE_RE = new RegExp(`${DATE_TOKEN.source}|present|current|ongoing`, "i");

  function buildExpEntry(headerLines, bullets) {
    let company = "", title = "", location = "", startDate = "", endDate = "", current = false, dateFound = false;
    const candidates = [];
    for (const raw of headerLines) {
      let work = raw;
      // Pull the date RANGE (or single date) out first so it isn't split apart.
      const rm = work.match(RANGE_RE);
      if (rm && !dateFound) {
        const dr = parseDateRange(rm[0]); startDate = dr.startDate; endDate = dr.endDate; current = dr.current; dateFound = true;
        work = work.replace(rm[0], "  ");
      } else if (!dateFound) {
        const sm = work.match(SINGLE_DATE_RE);
        if (sm) { const dr = parseDateRange(work); startDate = dr.startDate; endDate = dr.endDate; current = dr.current; dateFound = true; work = work.replace(sm[0], "  "); }
      }
      // A date pulled from inside brackets leaves an empty "( )" / "[ ]" behind
      // (e.g. "Engineer, Google (2021 - Present)"). Drop it so the bracket doesn't
      // become a phantom company/title segment.
      work = work.replace(/[([{]\s*[)\]}]/g, " ");
      for (const seg of splitSegs(work)) {
        const [comp, loc] = splitCityState(seg);
        if (loc && !location) location = loc;
        if (comp) candidates.push(comp);
      }
    }
    // Classify: location, then title (by keyword), then company gets the rest. A segment
    // that carries a job-title keyword is never a location — guards against LOC_RE's loose
    // ", Propername" branch eating "Software Engineer, Google" when no real location exists.
    for (const c of candidates) { if (!location && LOC_RE.test(c) && !TITLE_RE.test(c)) { location = c; } }
    for (const c of candidates) { if (!title && c !== location && TITLE_RE.test(c)) { title = c; break; } }
    for (const c of candidates) {
      if (c === title || c === location) continue;
      if (!company) { company = c; continue; }
      if (!title) { title = c; }
    }
    // "Title at Company" / "Title @ Company" collapsed into one token.
    if (title && !company) {
      const at = title.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
      if (at) { title = cleanSeg(at[1]); company = cleanSeg(at[2]); }
    }
    if (company && !title) {
      const at = company.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
      if (at && TITLE_RE.test(at[1])) { title = cleanSeg(at[1]); company = cleanSeg(at[2]); }
    }
    if (!title && company && TITLE_RE.test(company)) { title = company; company = ""; }
    // "Software Engineer Intern, Stripe" → title + company (location already removed).
    if (title && !company && title.includes(",")) {
      const parts = title.split(/,\s*/);
      if (parts.length === 2 && !LOC_RE.test(parts[1]) && !/^[A-Z]{2}$/.test(parts[1].trim())) {
        if (TITLE_RE.test(parts[0]) && !TITLE_RE.test(parts[1])) { title = cleanSeg(parts[0]); company = cleanSeg(parts[1]); }
        else if (TITLE_RE.test(parts[1]) && !TITLE_RE.test(parts[0])) { company = cleanSeg(parts[0]); title = cleanSeg(parts[1]); }
      }
    }
    return { company: cleanSeg(company), title: cleanSeg(title), location: cleanSeg(location), startDate, endDate, current, bullets };
  }

  function parseExperience(lines) {
    const entries = [];
    let header = [], bullets = [], open = false, headerHasDate = false;
    const flush = () => {
      if (open && (header.length || bullets.length)) entries.push(buildExpEntry(header, bullets));
      header = []; bullets = []; open = false; headerHasDate = false;
    };
    // After bullets have started, a date-less non-bullet line is ambiguous: it's either
    // the next entry's header (its date is on a following line) or a wrapped bullet. Peek
    // ahead — a date within the next few non-bullet lines means a new entry starts here.
    const startsNewEntry = (idx) => {
      for (let j = idx + 1; j < lines.length && j <= idx + 3; j++) {
        if (BULLET_RE.test(lines[j])) return false;  // bullets follow → it was a wrapped bullet
        if (DATE_RE.test(lines[j])) return true;      // a date shortly after → a real header
      }
      return false;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isBullet = BULLET_RE.test(line);
      const hasDate = DATE_RE.test(line);
      if (isBullet) { if (open) bullets.push(line.replace(STRIP_BULLET, "").trim()); continue; }
      if (!open) { open = true; header.push(line); if (hasDate) headerHasDate = true; continue; }
      if (hasDate) {
        // A date when the current entry already has its date (or already has bullets) is
        // the NEXT entry starting; otherwise it's THIS header's date, arriving on its own
        // line — attach it instead of prematurely splitting the entry.
        if (headerHasDate || bullets.length > 0) { flush(); open = true; header.push(line); headerHasDate = true; }
        else { header.push(line); headerHasDate = true; }
        continue;
      }
      if (bullets.length === 0 && header.length < 3) header.push(line); // still the header
      else if (startsNewEntry(i)) { flush(); open = true; header.push(line); }
      else bullets.push(line);
    }
    flush();
    return entries.filter((e) => e.company || e.title || e.bullets.length);
  }

  const DATE_PHRASE = new RegExp(`(?:${MONTH}\\s*)?(?:19|20)\\d{2}`, "i");
  // Pull graduation/attendance dates out of an education line and clean the residue.
  function extractEduDates(line) {
    const present = /present|current|expected|anticipat|ongoing/i.test(line);
    const phrases = line.match(new RegExp(DATE_PHRASE.source, "gi")) || [];
    let startDate = "", endDate = "";
    if (phrases.length >= 2) { startDate = phrases[0].trim(); endDate = phrases[1].trim(); }
    else if (phrases.length === 1) { endDate = phrases[0].trim(); } // a lone date = graduation/end
    if (present && !endDate) endDate = "Present";
    let cleaned = line;
    phrases.forEach((p) => { cleaned = cleaned.replace(p, "  "); });
    cleaned = cleaned
      .replace(/\b(expected graduation|expected|anticipated graduation|anticipated|graduation date|graduation|grad date|class of|graduating)\b/gi, "  ")
      .replace(/[([{]\s*[)\]}]/g, " ")
      .replace(/\s*[-–—|:]\s*(?=\s|$)/g, " ")
      .replace(/\s{2,}/g, "  ").trim();
    return { startDate, endDate, cleaned };
  }

  function parseEducation(lines) {
    const out = [];
    let ed = null;
    const isSchool = (l) => /university|college|institute|\bschool\b|academy|polytechnic|seminary/i.test(l);
    const startNew = (line) => {
      const { startDate, endDate, cleaned } = extractEduDates(line);
      let location = "", school = "", degree = "";
      for (const seg of splitSegs(cleaned)) {
        const [rest, loc] = splitCityState(seg);
        if (loc && !location) location = loc;
        const core = rest || seg;
        if (!school && isSchool(core)) school = core;
        else if (!degree && DEGREE_RE.test(core)) degree = (core.match(DEGREE_RE) || [""])[0];
      }
      if (!school) { const segs = splitSegs(cleaned); school = cleanSeg(segs.find(isSchool) || segs[0] || cleaned); }
      return {
        school: cleanSeg(school), degree, field: "", startDate, endDate,
        gpa: (line.match(/gpa[:\s]*([0-4]\.\d{1,2})/i) || [, ""])[1] || "",
        location: cleanSeg(location),
      };
    };
    for (const line of lines) {
      if (BULLET_RE.test(line) && ed) continue;
      if (isSchool(line) || (!ed && DEGREE_RE.test(line))) {
        if (ed) out.push(ed);
        ed = startNew(line);
      } else if (ed) {
        if (!ed.degree && DEGREE_RE.test(line)) ed.degree = (line.match(DEGREE_RE) || [""])[0];
        if (!ed.field) {
          const inField = line.match(/(?:in|of|major(?:ing)?\s+in)\s+([A-Z][A-Za-z &]+)/);
          if (inField) ed.field = cleanSeg(inField[1]);
          else if (DEGREE_RE.test(line)) {
            const after = line.replace(DEGREE_RE, "").replace(/^[\s,.\-–—]+/, "");
            const f = after.match(/^([A-Z][A-Za-z &]{2,})/);
            if (f) ed.field = cleanSeg(f[1].split(/,/)[0]);
          }
        }
        if (!ed.gpa) { const g = line.match(/gpa[:\s]*([0-4]\.\d{1,2})/i); if (g) ed.gpa = g[1]; }
        const d = extractEduDates(line);
        if (d.startDate && !ed.startDate) ed.startDate = d.startDate;
        if (d.endDate && !ed.endDate) ed.endDate = d.endDate;
        if (!ed.location) { const [, loc] = splitCityState(line); if (loc) ed.location = loc; }
      }
    }
    if (ed) out.push(ed);
    return out.filter((e) => e.school);
  }

  function parseLanguages(lines) {
    const PROF = /native|fluent|professional|conversational|basic|intermediate|advanced|proficient|beginner|elementary|working|bilingual|mother\s*tongue/i;
    const out = [];
    for (const raw of lines) {
      for (const part of raw.split(/[,;]| and /i).map((s) => s.trim()).filter(Boolean)) {
        const paren = part.match(/^([A-Za-z][A-Za-z\s]+?)\s*\(([^)]+)\)/);
        const dash = part.match(/^([A-Za-z][A-Za-z\s]+?)\s*[:\-–—]\s*(.+)$/);
        if (paren) out.push({ name: paren[1].trim(), proficiency: paren[2].trim() });
        else if (dash && PROF.test(dash[2])) out.push({ name: dash[1].trim(), proficiency: dash[2].trim() });
        else if (/^[A-Za-z][A-Za-z\s]{1,18}$/.test(part)) out.push({ name: part.trim(), proficiency: "" });
      }
    }
    return out.filter((l) => l.name && l.name.length <= 24);
  }

  // A skills-section category label (often appears bare or as "Category: a, b, c").
  const CATEGORY_RE = /^(?:programming\s+|developer\s+|technical\s+)?(?:languages?|frameworks?|libraries|tools?|technolog(?:y|ies)|databases?|cloud|devops|platforms?|methodolog(?:y|ies)|concepts?|paradigms?|operating\s+systems?|os|version\s+control|testing|data|machine\s+learning|ml|ai|soft\s+skills?|frontend|front-end|backend|back-end|design|other|misc(?:ellaneous)?|certifications?|skills?|competencies|expertise|proficiencies|stack)\b/i;
  function skillsFromName(n) {
    let s = n; const cm = n.match(CATEGORY_RE);
    if (cm) s = n.replace(CATEGORY_RE, "").replace(/^[\s:–—\-|]+/, "");
    return s.split(/[,•·\/|]/).map((x) => x.trim()).filter((x) => x && x.length <= 30);
  }
  // Is this "project" actually a skills line/category that slipped into the section?
  function looksLikeSkillsProject(p) {
    if (p.bullets && p.bullets.length) return false;       // real projects have descriptions
    const n = (p.name || "").trim(); if (!n) return true;
    const toks = n.split(/[,•·\/|]/).map((s) => s.trim()).filter(Boolean);
    if (toks.length >= 2 && toks.every((t) => t.length <= 25 && (t.match(/\s/g) || []).length <= 1)) return true; // a tech list
    const cm = n.match(CATEGORY_RE);
    if (cm) {
      const rest = n.replace(CATEGORY_RE, "").replace(/^[\s:–—\-|]+/, "").trim();
      if (!rest) return true;                               // bare category header
      if (/[,•·\/|]/.test(rest)) {
        const rtoks = rest.split(/[,•·\/|]/).map((s) => s.trim()).filter(Boolean);
        if (rtoks.length >= 2 && rtoks.every((t) => t.length <= 25 && (t.match(/\s/g) || []).length <= 1)) return true;
      }
    }
    return false;
  }

  // True when a line is ENTIRELY skills-category words + connectors (e.g. "Frameworks
  // & Libraries", "Cloud / DevOps", "Languages") — a sub-heading, not a skill itself.
  function isPureCategoryLabel(line) {
    if (line.includes(":")) return false;
    let s = " " + line.toLowerCase() + " ";
    s = s.replace(/[,&\/\-–—|+]/g, " ");
    s = s.replace(/\b(programming|developer|technical|languages?|frameworks?|libraries|tools?|technolog(?:y|ies)|databases?|cloud|devops|platforms?|methodolog(?:y|ies)|concepts?|paradigms?|operating|systems?|os|version|control|testing|machine|learning|ml|ai|soft|skills?|competencies|expertise|proficiencies|stack|and|other|misc(?:ellaneous)?|certifications?|frontend|backend|design|data)\b/g, " ");
    return s.replace(/\s+/g, "").length === 0;
  }

  function parseProjects(lines) {
    const out = [];
    let pj = null;
    const skills = [];
    const techLine = /^(technolog(?:y|ies)|tech stack|tech|tools?|stack|built with|skills?\s*used|frameworks?|libraries|languages?)\s*[:\-–—]/i;
    const addSkills = (str) => str.split(/[,•·\/|]|\sand\s/i).map((s) => s.trim()).filter((s) => s && s.length <= 40).forEach((s) => skills.push(s));
    const looksLikeTechList = (line) => {
      if (/[()]/.test(line)) return false; // parens handled separately
      if (isCityState(line)) return false; // "Atlanta, GA" is a location, not a tech list
      const toks = line.split(/[,•·\/|]/).map((s) => s.trim()).filter(Boolean);
      if (toks.length < 2) return false;
      return toks.every((t) => t.length <= 25 && (t.match(/\s/g) || []).length <= 1 && !/[.!?]$/.test(t) && !/\b(the|and|with|using|built|develop|created?|designed?|implement|led|managed|improv|increas|reduc|responsible)\b/i.test(t));
    };
    for (const line of lines) {
      if (BULLET_RE.test(line)) { if (pj) pj.bullets.push(line.replace(STRIP_BULLET, "").trim()); continue; }
      if (isCityState(line)) continue; // stray "City, ST" line — not a project nor a skill
      const tm = line.match(techLine);
      if (tm) { addSkills(line.slice(tm[0].length)); continue; }   // labeled tech list -> skills
      // Pull a trailing "(React, Node, Postgres)" off a project name into skills first.
      let work = line, parenTech = null;
      const paren = work.match(/\(([^)]+)\)\s*$/);
      if (paren && looksLikeTechList(paren[1])) { parenTech = paren[1]; work = work.replace(/\s*\([^)]*\)\s*$/, ""); }
      if (!parenTech && looksLikeTechList(work)) { addSkills(work); continue; } // bare tech list -> skills, not a project
      if (pj) out.push(pj);
      if (parenTech) addSkills(parenTech);
      // Also lift a trailing "| React, Node" / "— Python, Flask" off the name.
      const segs = work.split(/\s*\|\s*|\s+[–—]\s+|\s+-\s+/);
      const name = cleanSeg(segs[0] || work);
      if (segs.length > 1) {
        const tail = segs.slice(1).join(", ");
        if (!isCityState(tail)) { // don't lift a trailing "City, ST" location into skills
          const toks = tail.split(/[,•·\/]/).map((s) => s.trim()).filter(Boolean);
          if (toks.length && toks.every((t) => t.length <= 28 && (t.match(/\s/g) || []).length <= 1)) toks.forEach((t) => skills.push(t));
        }
      }
      pj = { name, bullets: [] };
    }
    if (pj) out.push(pj);
    return { projects: out.filter((p) => p.name), skills };
  }

  function heuristicStructure(text) {
    const splitFn = resolveSplitSkills();
    const lines = text.split("\n").map((l) => l.replace(/ /g, " ").replace(/\s+$/g, "")).map((l) => l.trim()).filter(Boolean);
    const sections = { summary: [], skills: [], experience: [], education: [], projects: [], languages: [], other: [] };
    let cur = "other";
    const profRe = /native|fluent|conversational|intermediate|advanced|beginner|proficient|basic|bilingual|elementary|working|mother\s*tongue/i;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      // Inline "Label: a, b, c".
      const colon = line.indexOf(":");
      if (colon > 0 && colon < 30) {
        const head = line.slice(0, colon);
        const content = line.slice(colon + 1).trim();
        if (cur === "skills") {
          if (isCityState(content)) continue;                            // "Location: Atlanta, GA" — not a skill
          if (content) { sections.skills.push(content); continue; }      // skill sub-category
          // "Data:" with nothing after it — a dangling category label; drop it (its
          // skills follow on later lines and stay, since cur is still "skills").
          if (isPureCategoryLabel(head) || CATEGORY_RE.test(head.trim())) continue;
        } else if (content) {
          const isec = detectSectionWord(head);
          if (isec && isec !== "other" && sections[isec]) { sections[isec].push(content); continue; }
        }
      }
      const sec = detectSection(line);
      // Drop a bare skills sub-heading (and keep its skills, which follow) instead of
      // letting it leak in as a literal skill.
      if (cur === "skills" && !line.includes(":") && line.length <= 40 && isPureCategoryLabel(line)) continue;
      // Drop a stray "City, ST" line sitting in the skills section (contact/location residue).
      if (cur === "skills" && isCityState(line)) continue;
      if (sec) {
        // A category word that is also a section name ("Languages", "Technologies")
        // followed by a tech list (not proficiency text) is a skills sub-heading, not
        // a real spoken-languages/other section — don't switch on it.
        if (isPureCategoryLabel(line) && line.length <= 22 && !profRe.test(lines[li + 1] || "")) {
          if (cur === "skills" || cur === "projects") continue;
          cur = "skills"; continue;
        }
        cur = sec; continue;
      }
      sections[cur].push(line);
    }
    // Route skills through the shared splitter so multi-skill blobs become separate
    // skills (handles ; | tabs / & "and" beyond the legacy comma/bullet split).
    const skills = (splitFn(sections.skills))
      .join(", ")
      .split(/[,•|·•\n]|\s•\s|\s\/\s/)
      .map((s) => s.replace(/^[-–•\s]+/, "").trim())
      .filter((s) => s && s.length <= 40);

    const projResult = parseProjects(sections.projects);
    // Technical skills found inside the projects section belong in skills.
    for (const s of projResult.skills) {
      if (!skills.some((x) => x.toLowerCase() === s.toLowerCase())) skills.push(s);
    }
    // A "project" that is really a skills category or a tech list → move it to skills.
    const realProjects = [];
    for (const p of projResult.projects) {
      if (looksLikeSkillsProject(p)) {
        for (const s of skillsFromName(p.name)) if (!skills.some((x) => x.toLowerCase() === s.toLowerCase())) skills.push(s);
      } else realProjects.push(p);
    }

    return {
      summary: sections.summary.join(" ").trim(),
      skills,
      experience: parseExperience(sections.experience),
      education: parseEducation(sections.education),
      languages: parseLanguages(sections.languages),
      projects: realProjects,
    };
  }

  // --- Bio extraction (name / contact / links) -----------------------------
  // Pull personal-profile fields out of the resume header so the options page can
  // offer to populate the single shared Bio. Returns only the fields it is
  // reasonably confident about; everything else is left for the user to fill.
  function parseBio(text) {
    const bio = {};
    const lines = (text || "").split("\n").map((l) => l.replace(/ /g, " ").trim()).filter(Boolean);
    const head = lines.slice(0, 15).join("\n").replace(/ /g, " ");

    const email = (text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [])[0];
    if (email) bio.email = email.trim();

    const phone = (text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/) || [])[0];
    if (phone) bio.phone = phone.trim();

    const li = (text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s)|,]+/i) || [])[0];
    if (li) bio.linkedin = /^https?:/i.test(li) ? li : "https://" + li;
    const gh = (text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s)|,]+/i) || [])[0];
    if (gh) bio.github = /^https?:/i.test(gh) ? gh : "https://" + gh;
    const urls = text.match(/https?:\/\/[^\s)|,]+/gi) || [];
    const site = urls.find((u) => !/linkedin\.com|github\.com/i.test(u));
    if (site) bio.website = site;

    // "City, ST" / "City, Full State Name" in the header block. The state is stored
    // as its proper full name so it matches the Bio state dropdown.
    for (const l of head.split("\n")) {
      const m = l.match(/([A-Z][A-Za-z.'\- ]+?),\s*([A-Za-z][A-Za-z. ]+)/);
      if (!m) continue;
      const full = resolveStateName(m[2]);
      if (full) { bio.city = cleanSeg(m[1]); bio.state = full; break; }
    }

    // Name: first plausible "First Last" line near the top — no digits/@, not a
    // section heading, not a job title.
    for (const l of lines.slice(0, 6)) {
      if (/[@\d]/.test(l) || detectSection(l) || TITLE_RE.test(l)) continue;
      const words = l.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Za-z][A-Za-z.'\-]*$/.test(w))) {
        bio.firstName = words[0];
        bio.lastName = words.slice(1).join(" ");
        break;
      }
    }
    return bio;
  }

  // --- PDF layout reconstruction (column-aware) ----------------------------
  // Turn positioned PDF text items into reading-order plain text. The naive approach
  // (group every item by its y row, left-to-right) shreds TWO-COLUMN resumes: a skills
  // sidebar and the experience column share rows, so they interleave into garbage. Here
  // we first detect a consistent vertical gutter; if found, each column is read fully
  // top-to-bottom (left, then right) before handing off to the text structurer. Single
  // column (the common case) falls through to the original y-ordering, unchanged.
  //
  // items: [{ x, y, w, str }] — x = left edge, y = baseline (PDF y grows upward),
  // w = advance width, str = text. Pure: no pdf.js/DOM dependency, so the web app and
  // the extension reconstruct identically.
  function itemsToText(items) {
    const rows = new Map();
    for (const it of items) {
      const y = Math.round(it.y);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(it);
    }
    const lines = [];
    [...rows.keys()].sort((a, b) => b - a).forEach((y) => {
      const row = rows.get(y).sort((a, b) => a.x - b.x);
      const text = row.map((r) => r.str).join(" ").replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
    });
    return lines.join("\n");
  }
  // Find an x where text splits into a left and a right column that BOTH run most of the
  // page height with very few rows crossing — the signature of a real two-column layout
  // (not just right-aligned dates, which only span a few rows). Returns the x, or null.
  function findColumnSplit(items) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const it of items) {
      const r = it.x + (it.w || 0);
      if (it.x < minX) minX = it.x;
      if (r > maxX) maxX = r;
      if (it.y < minY) minY = it.y;
      if (it.y > maxY) maxY = it.y;
    }
    const pageW = maxX - minX, pageH = maxY - minY;
    if (pageW <= 0 || pageH <= 0) return null;
    const NB = 16; // vertical bands used to measure how much height each side covers
    const bandOf = (y) => Math.min(NB - 1, Math.max(0, Math.floor(((maxY - y) / pageH) * NB)));
    let best = null;
    for (let frac = 0.28; frac <= 0.72 + 1e-9; frac += 0.02) {
      const g = minX + frac * pageW;
      const leftBands = new Set(), rightBands = new Set(), crossBands = new Set();
      let cross = 0;
      for (const it of items) {
        const l = it.x, r = it.x + (it.w || 0), b = bandOf(it.y);
        if (r <= g) leftBands.add(b);
        else if (l >= g) rightBands.add(b);
        else { crossBands.add(b); cross++; }
      }
      if (leftBands.size >= NB * 0.5 && rightBands.size >= NB * 0.5 && crossBands.size <= NB * 0.2) {
        const score = crossBands.size * 1000 + cross;
        if (!best || score < best.score) best = { g, score };
      }
    }
    return best ? best.g : null;
  }
  function reconstructPdfText(items) {
    const its = (items || []).filter((it) => it && typeof it.str === "string" && it.str.trim() !== "");
    if (its.length < 8) return itemsToText(its); // too little text to risk column detection
    const g = findColumnSplit(its);
    if (g == null) return itemsToText(its);
    const left = [], right = [];
    for (const it of its) (it.x + (it.w || 0) / 2 < g ? left : right).push(it);
    if (left.length < 3 || right.length < 3) return itemsToText(its); // not really two columns
    return itemsToText(left) + "\n" + itemsToText(right);
  }

  return { heuristicStructure, parseBio, splitSkills, reconstructPdfText };
});
