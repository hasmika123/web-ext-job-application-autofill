/* schema.js — the canonical data model shared by every part of the extension.
 * Loaded as a classic script; attaches everything to window.JAF.schema.
 *
 * The whole extension speaks ONE vocabulary of "canonical fields". Each site
 * adapter's only job is to connect real DOM inputs to these canonical keys.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});

  // --- Canonical field keys -------------------------------------------------
  // These are the only field names the rest of the code ever refers to.
  const FIELDS = {
    firstName: "firstName",
    lastName: "lastName",
    fullName: "fullName",
    preferredName: "preferredName",
    email: "email",
    phone: "phone",
    addressLine1: "addressLine1",
    addressLine2: "addressLine2",
    city: "city",
    state: "state",
    postalCode: "postalCode",
    country: "country",
    linkedin: "linkedin",
    github: "github",
    website: "website",
    // work authorization
    authorizedToWork: "authorizedToWork",
    requireSponsorship: "requireSponsorship",
    // free-text / structured resume content
    summary: "summary",
    skills: "skills",
    coverLetter: "coverLetter",
    // EEO / demographic (off by default; never auto-guessed)
    gender: "gender",
    race: "race",
    ethnicity: "ethnicity",
    veteranStatus: "veteranStatus",
    disabilityStatus: "disabilityStatus",
  };

  // --- Keyword sets for the GENERIC label matcher ---------------------------
  // These now live in the versioned ruleset (src/config/rules.js) so they can be
  // updated at runtime without an extension release. schema.MATCHERS mirrors the
  // bundled copy for back-compat; scanGeneric reads the ACTIVE ruleset.
  const MATCHERS = (JAF.defaultRules && JAF.defaultRules.generic) || [];

  // Fields whose value should be left untouched unless the user opts in.
  const SENSITIVE = [FIELDS.gender, FIELDS.race, FIELDS.ethnicity, FIELDS.veteranStatus, FIELDS.disabilityStatus];

  // Human-readable labels for the confirm overlay.
  const LABELS = {
    firstName: "First name", lastName: "Last name", fullName: "Full name",
    preferredName: "Preferred name", email: "Email", phone: "Phone",
    addressLine1: "Address", addressLine2: "Address line 2", city: "City",
    state: "State / Province", postalCode: "Postal code", country: "Country",
    linkedin: "LinkedIn", github: "GitHub", website: "Website",
    authorizedToWork: "Authorized to work", requireSponsorship: "Needs sponsorship",
    summary: "Summary", skills: "Skills", coverLetter: "Cover letter",
    gender: "Gender", race: "Race", ethnicity: "Hispanic / Latino", veteranStatus: "Veteran status",
    disabilityStatus: "Disability status",
  };

  // --- Profile shapes (used by storage + options page) ----------------------
  function emptyBio() {
    return {
      firstName: "", lastName: "", preferredName: "", email: "", phone: "",
      addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "",
      country: "", linkedin: "", github: "", website: "",
      authorizedToWork: "", requireSponsorship: "",
      // EEO answers are part of bio but only used when the user enables them
      gender: "", race: "", ethnicity: "", veteranStatus: "", disabilityStatus: "",
    };
  }

  function emptyResume() {
    return {
      id: "res_" + Math.random().toString(36).slice(2, 10),
      label: "Untitled resume",
      fileName: "",          // original file name; bytes live in IndexedDB under this id
      hasFile: false,
      summary: "",
      skills: [],            // array of strings
      experience: [],        // [{company,title,location,startDate,endDate,current,bullets:[]}]
      education: [],         // [{school,degree,field,startDate,endDate,gpa}]
      languages: [],         // [{name, proficiency}]
      projects: [],          // [{name, bullets:[]}] — kept separate from experience
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // Merge bio + chosen resume into the flat value bag the filler consumes.
  function buildFillValues(bio, resume, opts) {
    opts = opts || {};
    const v = {};
    const map = {
      firstName: bio.firstName, lastName: bio.lastName, preferredName: bio.preferredName,
      fullName: [bio.firstName, bio.lastName].filter(Boolean).join(" "),
      email: bio.email, phone: bio.phone,
      addressLine1: bio.addressLine1, addressLine2: bio.addressLine2,
      city: bio.city, state: bio.state, postalCode: bio.postalCode, country: bio.country,
      linkedin: bio.linkedin, github: bio.github, website: bio.website,
      authorizedToWork: bio.authorizedToWork, requireSponsorship: bio.requireSponsorship,
      summary: resume.summary || "",
      skills: Array.isArray(resume.skills) ? resume.skills.join(", ") : (resume.skills || ""),
    };
    Object.keys(map).forEach((k) => { if (map[k] !== undefined && map[k] !== "") v[k] = map[k]; });
    // EEO / demographic self-ID: ALWAYS included when the user has provided it (no
    // opt-in gate — user decision 2026-07-01: this data is always available). It only
    // fills where the page actually asks, and the user still reviews/unchecks each value
    // in the overlay before anything is written. `opts` is retained for call compatibility.
    [FIELDS.gender, FIELDS.race, FIELDS.ethnicity, FIELDS.veteranStatus, FIELDS.disabilityStatus].forEach((k) => {
      if (bio[k]) v[k] = bio[k];
    });
    // structured experience/education travel alongside for adapters that use them
    v.__experience = resume.experience || [];
    v.__education = resume.education || [];
    v.__languages = Array.isArray(resume.languages) ? resume.languages : [];
    v.__projects = Array.isArray(resume.projects) ? resume.projects : []; // not auto-filled; only when a page asks
    v.__skillsArray = Array.isArray(resume.skills) ? resume.skills : [];
    v.__webCount = [bio.linkedin, bio.github, bio.website].filter(Boolean).length;
    return v;
  }

  // US state abbreviation <-> full name, so a dropdown listing "Georgia" still
  // matches a resume/bio value of "GA" (and vice-versa via candidate fallback).
  const US_STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia" };
  const STATE_ABBR = Object.fromEntries(Object.entries(US_STATES).map(([a, n]) => [n.toLowerCase(), a]));
  // Returns [primary, ...alternates] to try against a dropdown's options.
  function stateCandidates(v) {
    if (!v) return [];
    const t = String(v).trim();
    const up = t.toUpperCase();
    if (US_STATES[up]) return [US_STATES[up], up];                 // "GA" -> ["Georgia","GA"]
    if (STATE_ABBR[t.toLowerCase()]) return [t, STATE_ABBR[t.toLowerCase()]]; // "Georgia" -> ["Georgia","GA"]
    return [t];
  }
  function countryCandidates(v) {
    if (!v) return [];
    const t = String(v).trim();
    const m = { "us": "United States", "u.s.": "United States", "usa": "United States", "u.s.a.": "United States", "united states": "United States", "uk": "United Kingdom", "u.k.": "United Kingdom" };
    const full = m[t.toLowerCase()] || t;
    const alts = [full, t, "United States of America", "USA", "US"].filter((x, i, a) => x && a.indexOf(x) === i);
    return /united states/i.test(full) ? alts : [full, t].filter((x, i, a) => a.indexOf(x) === i);
  }

  // The filename used ONLY when attaching the resume to an application form:
  // "firstname_lastname_resume.<ext>". The original file extension is preserved so a
  // .docx is never mislabeled as .pdf. Falls back to "resume.<ext>" when the name is
  // missing. The stored resume keeps its original fileName everywhere else.
  function uploadResumeName(bio, originalName) {
    const extMatch = String(originalName || "").match(/\.[a-z0-9]+$/i);
    const ext = extMatch ? extMatch[0].toLowerCase() : ".pdf";
    const clean = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    const parts = [clean(bio && bio.firstName), clean(bio && bio.lastName)].filter(Boolean);
    const base = parts.length ? parts.join("_") + "_resume" : "resume";
    return base + ext;
  }

  // Bio fields where a freshly-parsed resume carries a value that differs from the
  // current Bio — so the options page can ALWAYS offer to update (filling empties
  // AND replacing existing values), not only when a field is blank.
  function bioUpdateCandidates(bio, parsed) {
    bio = bio || {}; parsed = parsed || {};
    const shape = emptyBio();
    const out = [];
    Object.keys(parsed).forEach((k) => {
      if (!(k in shape)) return;                       // ignore non-bio keys
      const to = parsed[k] == null ? "" : String(parsed[k]).trim();
      const from = bio[k] == null ? "" : String(bio[k]).trim();
      if (to && to !== from) out.push({ key: k, from, to, isEmpty: !from });
    });
    return out;
  }

  // Turn a skills string OR array (often a comma/blob mess from PDF extraction)
  // into clean, de-duplicated individual skills. Splits on commas, semicolons,
  // pipes, bullets, middots, tabs, newlines, and the SPACED forms of slash /
  // ampersand / "and" — the spacing protects skills that legitimately contain
  // those characters ("CI/CD", "R&D", "and/or").
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

  JAF.schema = { FIELDS, MATCHERS, SENSITIVE, LABELS, emptyBio, emptyResume, buildFillValues, stateCandidates, countryCandidates, uploadResumeName, bioUpdateCandidates, splitSkills };
})();
