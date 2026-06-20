/* parser.js — turn an uploaded resume file into structured fields.
 * Runs on the options page. Attaches to window.JAF.parser.
 * Text extraction: pdf.js (PDF) / mammoth (DOCX) / plain read (TXT).
 * Structuring: heuristic (default) or Anthropic API (optional, user's key).
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});

  async function extractText(file) {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".pdf") || file.type === "application/pdf") return extractPdf(file);
    if (name.endsWith(".docx")) return extractDocx(file);
    if (name.endsWith(".txt") || file.type === "text/plain") return file.text();
    if (name.endsWith(".doc")) throw new Error("Legacy .doc isn't supported — please save as .docx or PDF.");
    // last resort: try as text
    return file.text();
  }

  async function extractPdf(file) {
    const pdfjs = await import(chrome.runtime.getURL("vendor/pdf.min.mjs"));
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    let out = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Reconstruct lines by y-position so columns/bullets survive reasonably.
      const rows = {};
      content.items.forEach((it) => {
        if (!it.str) return;
        const y = Math.round(it.transform[5]);
        (rows[y] = rows[y] || []).push(it.str);
      });
      Object.keys(rows)
        .sort((a, b) => b - a)
        .forEach((y) => { out += rows[y].join(" ").replace(/\s+/g, " ").trim() + "\n"; });
      out += "\n";
    }
    return out.trim();
  }

  async function extractDocx(file) {
    if (!window.mammoth) throw new Error("DOCX support not loaded.");
    const buf = await file.arrayBuffer();
    const res = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return (res.value || "").trim();
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
      for (const seg of splitSegs(work)) {
        const [comp, loc] = splitCityState(seg);
        if (loc && !location) location = loc;
        if (comp) candidates.push(comp);
      }
    }
    // Classify: location, then title (by keyword), then company gets the rest.
    for (const c of candidates) { if (!location && LOC_RE.test(c)) { location = c; } }
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
    let header = [], bullets = [], open = false;
    const flush = () => { if (open && (header.length || bullets.length)) entries.push(buildExpEntry(header, bullets)); header = []; bullets = []; open = false; };
    for (const line of lines) {
      const isBullet = BULLET_RE.test(line);
      const hasDate = DATE_RE.test(line);
      if (isBullet) { if (open) bullets.push(line.replace(STRIP_BULLET, "").trim()); continue; }
      if (hasDate) {
        if (open && (bullets.length > 0 || header.length >= 2)) flush();
        open = true; header.push(line);
      } else if (!open) { open = true; header.push(line); }
      else if (bullets.length === 0 && header.length < 3) header.push(line);
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
    const lines = text.split("\n").map((l) => l.replace(/\u00a0/g, " ").replace(/\s+$/g, "")).map((l) => l.trim()).filter(Boolean);
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
    const skills = sections.skills
      .join(", ")
      .split(/[,•|·\u2022\n]|\s•\s|\s\/\s/)
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
    const lines = (text || "").split("\n").map((l) => l.replace(/ /g, " ").trim()).filter(Boolean);
    const head = lines.slice(0, 15).join("\n").replace(/ /g, " ");

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

  // --- LLM structuring (optional) ------------------------------------------
  async function llmStructure(text, apiKey) {
    const system =
      "You parse resume text into JSON. Return ONLY valid JSON, no prose, no markdown fences. " +
      'Schema: {"summary":string,"skills":string[],"experience":[{"company":string,"title":string,' +
      '"location":string,"startDate":string,"endDate":string,"current":boolean,"bullets":string[]}],' +
      '"education":[{"school":string,"degree":string,"field":string,"location":string,"startDate":string,"endDate":string,"gpa":string}],' +
      '"languages":[{"name":string,"proficiency":string}],' +
      '"projects":[{"name":string,"bullets":string[]}]}. ' +
      "Put each job's title and company in SEPARATE fields (never combine them). Split date ranges into startDate and endDate; set current=true for present/ongoing. " +
      "Personal/side PROJECTS go in projects, NOT in experience. Technical skills/technologies listed under a project belong in skills, not in the project. Keep each experience AND project bullet as a separate bullets[] entry. " +
      "The 'school' field is the institution NAME ONLY — put the campus city/state in 'location' and the graduation date in 'endDate', never inside 'school'. " +
      "Programming languages (e.g. Python, Java, C++) listed under a technical-skills heading are skills, NOT spoken languages; only real spoken languages go in 'languages'. " +
      "Use empty strings/arrays when unknown. Do not invent facts.";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: "Resume text:\n\n" + text.slice(0, 18000) }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error("API error " + res.status + ": " + t.slice(0, 200));
    }
    const data = await res.json();
    const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const clean = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(clean);
    return {
      summary: parsed.summary || "",
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      experience: Array.isArray(parsed.experience) ? parsed.experience : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      languages: Array.isArray(parsed.languages) ? parsed.languages : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  }

  async function parse(file, settings) {
    const text = await extractText(file);
    let structured;
    if (settings && settings.llmEnabled && settings.apiKey) {
      try { structured = await llmStructure(text, settings.apiKey); }
      catch (e) { structured = heuristicStructure(text); structured.__warning = "LLM parse failed (" + e.message + "); used heuristic instead."; }
    } else {
      structured = heuristicStructure(text);
    }
    structured.__rawText = text;
    return structured;
  }

  JAF.parser = { parse, extractText, heuristicStructure, parseBio };
})();
