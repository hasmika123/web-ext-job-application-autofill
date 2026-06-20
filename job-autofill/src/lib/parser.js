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
    return null;
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

  function parseEducation(lines) {
    const out = [];
    let ed = null;
    const isSchool = (l) => /university|college|institute|\bschool\b|academy|polytechnic/i.test(l);
    for (const line of lines) {
      if (BULLET_RE.test(line) && ed) continue;
      if (isSchool(line) || (!ed && DEGREE_RE.test(line))) {
        if (ed) out.push(ed);
        const cells = splitCells(line);
        const dr = parseDateRange(line);
        ed = {
          school: cleanSeg(cells.find((c) => isSchool(c)) || cells[0] || line),
          degree: (line.match(DEGREE_RE) || [""])[0],
          field: "", startDate: dr.startDate, endDate: dr.endDate || (line.match(DATE_RE) || [""])[0],
          gpa: (line.match(/gpa[:\s]*([0-4]\.\d{1,2})/i) || [, ""])[1],
        };
        const loc = cells.find((c) => LOC_RE.test(c)); if (loc) ed.location = cleanSeg(loc);
      } else if (ed) {
        if (!ed.degree && DEGREE_RE.test(line)) {
          const inField = line.match(/(?:in|of)\s+([A-Z][A-Za-z &]+)/);
          if (inField) { ed.degree = (line.match(DEGREE_RE) || [""])[0]; ed.field = ed.field || cleanSeg(inField[1]); }
          else ed.degree = cleanSeg(line.split(/,|gpa/i)[0]);
        }
        if (!ed.field) {
          const inField = line.match(/(?:in|of)\s+([A-Z][A-Za-z &]+)/);
          if (inField) ed.field = cleanSeg(inField[1]);
        }
        if (!ed.gpa) { const g = line.match(/gpa[:\s]*([0-4]\.\d{1,2})/i); if (g) ed.gpa = g[1]; }
        const dr = parseDateRange(line); if (dr.endDate && !ed.endDate) ed.endDate = dr.endDate;
      }
    }
    if (ed) out.push(ed);
    return out;
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

  function parseProjects(lines) {
    const out = [];
    let pj = null;
    const skills = [];
    const techLine = /^(technolog(?:y|ies)|tech stack|tech|tools?|stack|built with|skills?\s*used|frameworks?|libraries|languages?)\s*[:\-–—]/i;
    const addSkills = (str) => str.split(/[,•·\/|]|\sand\s/i).map((s) => s.trim()).filter((s) => s && s.length <= 40).forEach((s) => skills.push(s));
    for (const line of lines) {
      if (BULLET_RE.test(line)) { if (pj) pj.bullets.push(line.replace(STRIP_BULLET, "").trim()); continue; }
      const tm = line.match(techLine);
      if (tm) { addSkills(line.slice(tm[0].length)); continue; }   // tech list -> skills, not a project
      if (pj) out.push(pj);
      // A name line like "Project — React, Node, Mongo" or "Project | Python, Flask":
      // keep the name, lift a trailing short comma-list of tech into skills.
      const segs = line.split(/\s*\|\s*|\s+[–—]\s+|\s+-\s+/);
      const name = cleanSeg(segs[0] || line);
      if (segs.length > 1) {
        const toks = segs.slice(1).join(", ").split(/[,•·\/]/).map((s) => s.trim()).filter(Boolean);
        if (toks.length && toks.every((t) => t.length <= 28 && (t.match(/\s/g) || []).length <= 1)) toks.forEach((t) => skills.push(t));
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
    for (const line of lines) {
      // Inline "Label: a, b, c" (e.g. "Tech Stack: React, Node" inside a project,
      // or "Skills: Python, Go") → route the content to that section directly.
      const colon = line.indexOf(":");
      if (colon > 0 && colon < 30) {
        const content = line.slice(colon + 1).trim();
        if (content) {
          const isec = detectSectionWord(line.slice(0, colon));
          if (isec && isec !== "other" && sections[isec]) { sections[isec].push(content); continue; }
        }
      }
      const sec = detectSection(line);
      if (sec) { cur = sec; continue; }
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

    return {
      summary: sections.summary.join(" ").trim(),
      skills,
      experience: parseExperience(sections.experience),
      education: parseEducation(sections.education),
      languages: parseLanguages(sections.languages),
      projects: projResult.projects,
    };
  }

  // --- LLM structuring (optional) ------------------------------------------
  async function llmStructure(text, apiKey) {
    const system =
      "You parse resume text into JSON. Return ONLY valid JSON, no prose, no markdown fences. " +
      'Schema: {"summary":string,"skills":string[],"experience":[{"company":string,"title":string,' +
      '"location":string,"startDate":string,"endDate":string,"current":boolean,"bullets":string[]}],' +
      '"education":[{"school":string,"degree":string,"field":string,"startDate":string,"endDate":string,"gpa":string}],' +
      '"languages":[{"name":string,"proficiency":string}],' +
      '"projects":[{"name":string,"bullets":string[]}]}. ' +
      "Put each job's title and company in SEPARATE fields (never combine them). Split date ranges into startDate and endDate; set current=true for present/ongoing. " +
      "Personal/side PROJECTS go in projects, NOT in experience. Technical skills/technologies listed under a project belong in skills, not in the project. Keep each experience bullet as a separate bullets[] entry. " +
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

  JAF.parser = { parse, extractText, heuristicStructure };
})();
