/* parser.js — turn an uploaded resume file into structured fields (extension side).
 * Runs on the options page. Attaches to window.JAF.parser.
 * Text extraction: pdf.js (PDF) / mammoth (DOCX) / plain read (TXT) — this is the
 * environment-coupled half (chrome.runtime, window.mammoth, fetch). The pure text→
 * structure logic (heuristicStructure / parseBio) lives in the SHARED `parser-core.js`
 * module (JAF.parserCore), which the web app imports too; this file delegates to it.
 * Load order: parser-core.js must load before parser.js.
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
      // Column-aware reconstruction via the shared core, so two-column resumes read
      // column-by-column instead of interleaving the sidebar into the main column.
      const items = content.items
        .filter((it) => it.str)
        .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, str: it.str }));
      out += JAF.parserCore.reconstructPdfText(items) + "\n\n";
    }
    return out.trim();
  }

  async function extractDocx(file) {
    if (!window.mammoth) throw new Error("DOCX support not loaded.");
    const buf = await file.arrayBuffer();
    const res = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return (res.value || "").trim();
  }

  // Structuring is delegated to the shared core module.
  function heuristicStructure(text) {
    return JAF.parserCore.heuristicStructure(text);
  }
  function parseBio(text) {
    return JAF.parserCore.parseBio(text);
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
