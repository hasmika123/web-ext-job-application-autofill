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

  const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
  const DATE_TOKEN = new RegExp(`(?:${MONTH}\\s*)?\\d{4}|\\d{1,2}\\/\\d{4}|\\d{1,2}\\/\\d{2}`, "i");
  const DATE_RE = new RegExp(`${DATE_TOKEN.source}|present|current|ongoing`, "i");
  const LOC_RE = /\bremote\b|\bhybrid\b|\bonsite\b|,\s*[A-Z]{2}\b|[A-Z][a-z]+,\s*[A-Z]{2}\b|,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s*$/;
  const TITLE_RE = /\b(engineer|developer|manager|intern|analyst|designer|scientist|consultant|lead|director|architect|administrator|specialist|coordinator|associate|officer|president|founder|owner|assistant|technician|researcher|programmer|strategist|recruiter|accountant|attorney|nurse|teacher|professor|fellow|ambassador|representative|agent|advisor|adviser|trainee|apprentice|head|vp|chief|cto|ceo|cfo|coo)\b/i;
  const BULLET_RE = /^[\s]*[-–—•*▪◦‣·●○]/;
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

  function buildExpEntry(headerLines, bullets) {
    let company = "", title = "", location = "", startDate = "", endDate = "", current = false;
    const dateIdx = headerLines.findIndex((l) => DATE_RE.test(l));
    if (dateIdx >= 0) {
      const cells = splitCells(headerLines[dateIdx]);
      const dci = cells.findIndex((c) => DATE_RE.test(c));
      const dr = parseDateRange(dci >= 0 ? cells[dci] : headerLines[dateIdx]);
      startDate = dr.startDate; endDate = dr.endDate; current = dr.current;
      if (dci >= 0) cells.splice(dci, 1);
      for (const c of cells) {
        if (!location && LOC_RE.test(c)) location = c;
        else if (TITLE_RE.test(c) && !title) title = c;
        else if (!company) company = c;
        else if (!title) title = c;
      }
    }
    for (let i = 0; i < headerLines.length; i++) {
      if (i === dateIdx) continue;
      for (const c of splitCells(headerLines[i])) {
        if (!location && LOC_RE.test(c)) location = c;
        else if (TITLE_RE.test(c) && !title) title = c;
        else if (!company) company = c;
        else if (!title) title = c;
      }
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
      if (isBullet) { if (open) bullets.push(line.replace(BULLET_RE, "").trim()); continue; }
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
    for (const line of lines) {
      if (BULLET_RE.test(line)) { if (pj) pj.bullets.push(line.replace(BULLET_RE, "").trim()); continue; }
      if (pj) out.push(pj);
      pj = { name: cleanSeg(splitCells(line)[0] || line), bullets: [] };
    }
    if (pj) out.push(pj);
    return out.filter((p) => p.name);
  }

  function heuristicStructure(text) {
    const lines = text.split("\n").map((l) => l.replace(/\u00a0/g, " ").replace(/\s+$/g, "")).map((l) => l.trim()).filter(Boolean);
    const sections = { summary: [], skills: [], experience: [], education: [], projects: [], languages: [], other: [] };
    let cur = "other";
    for (const line of lines) {
      const sec = detectSection(line);
      if (sec) { cur = sec; continue; }
      sections[cur].push(line);
    }
    const skills = sections.skills
      .join(", ")
      .split(/[,•|·\u2022\n]|\s•\s|\s\/\s/)
      .map((s) => s.replace(/^[-–•\s]+/, "").trim())
      .filter((s) => s && s.length <= 40);

    return {
      summary: sections.summary.join(" ").trim(),
      skills,
      experience: parseExperience(sections.experience),
      education: parseEducation(sections.education),
      languages: parseLanguages(sections.languages),
      projects: parseProjects(sections.projects),
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
      "Personal/side PROJECTS go in projects, NOT in experience. Use empty strings/arrays when unknown. Do not invent facts.";
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
