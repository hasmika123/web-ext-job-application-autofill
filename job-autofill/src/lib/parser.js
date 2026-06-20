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
    summary: ["summary", "professional summary", "profile", "objective", "about"],
    skills: ["skills", "technical skills", "core competencies", "technologies", "expertise"],
    experience: ["experience", "work experience", "employment", "professional experience", "work history"],
    education: ["education", "academic", "qualifications"],
  };

  function detectSection(line) {
    const t = line.trim().toLowerCase().replace(/[:_]/g, "");
    if (t.length > 40) return null; // headers are short
    for (const [sec, words] of Object.entries(SECTION_WORDS)) {
      if (words.some((w) => t === w || t.startsWith(w + " ") || t === w + "s")) return sec;
    }
    return null;
  }

  const DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/)?[a-z]*\.?\s*\d{4}\b|present|current/i;

  function heuristicStructure(text) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const sections = { summary: [], skills: [], experience: [], education: [], other: [] };
    let cur = "other";
    for (const line of lines) {
      const sec = detectSection(line);
      if (sec) { cur = sec; continue; }
      sections[cur].push(line);
    }
    // skills -> array (split on commas, bullets, pipes, slashes)
    const skills = sections.skills
      .join(", ")
      .split(/[,•|·\u2022\n]|\s•\s/)
      .map((s) => s.replace(/^[-–•\s]+/, "").trim())
      .filter((s) => s && s.length <= 40);

    // experience -> rough entries: a line with a date opens/closes an entry
    const experience = [];
    let entry = null;
    for (const line of sections.experience) {
      const hasDate = DATE_RE.test(line);
      const isBullet = /^[-–•*]/.test(line);
      if (hasDate && !isBullet) {
        if (entry) experience.push(entry);
        const dm = line.match(DATE_RE);
        entry = { company: "", title: line.replace(DATE_RE, "").replace(/[-–|]/g, " ").trim(), location: "", startDate: "", endDate: dm ? dm[0] : "", current: /present|current/i.test(line), bullets: [] };
      } else if (entry && isBullet) {
        entry.bullets.push(line.replace(/^[-–•*\s]+/, "").trim());
      } else if (entry && !entry.company) {
        entry.company = line;
      } else if (entry) {
        entry.bullets.push(line);
      }
    }
    if (entry) experience.push(entry);

    const education = [];
    let edu = null;
    for (const line of sections.education) {
      if (DATE_RE.test(line) || /university|college|institute|school|b\.?s\.?|m\.?s\.?|bachelor|master|ph\.?d/i.test(line)) {
        if (edu) education.push(edu);
        edu = { school: line, degree: "", field: "", startDate: "", endDate: (line.match(DATE_RE) || [""])[0], gpa: (line.match(/gpa[:\s]*([0-4]\.\d+)/i) || [, ""])[1] };
      } else if (edu) {
        edu.degree = edu.degree || line;
      }
    }
    if (edu) education.push(edu);

    return {
      summary: sections.summary.join(" ").trim(),
      skills,
      experience,
      education,
      languages: [],
    };
  }

  // --- LLM structuring (optional) ------------------------------------------
  async function llmStructure(text, apiKey) {
    const system =
      "You parse resume text into JSON. Return ONLY valid JSON, no prose, no markdown fences. " +
      'Schema: {"summary":string,"skills":string[],"experience":[{"company":string,"title":string,' +
      '"location":string,"startDate":string,"endDate":string,"current":boolean,"bullets":string[]}],' +
      '"education":[{"school":string,"degree":string,"field":string,"startDate":string,"endDate":string,"gpa":string}],' +
      '"languages":[{"name":string,"proficiency":string}]}. ' +
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
