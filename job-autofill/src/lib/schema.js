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
    veteranStatus: "veteranStatus",
    disabilityStatus: "disabilityStatus",
  };

  // --- Keyword sets for the GENERIC label matcher ---------------------------
  // For a site without a dedicated adapter, we read each field's visible label
  // and match it against these. Order matters: more specific first.
  // `neg` words veto a match (e.g. "first" should not match "first day").
  const MATCHERS = [
    { field: FIELDS.email, any: ["e-mail", "email"], neg: ["confirm", "verify"] },
    { field: FIELDS.phone, any: ["phone", "mobile", "telephone", "cell"], neg: ["country code", "phone code", "device", "type", "extension", "ext", "fax"] },
    { field: FIELDS.linkedin, any: ["linkedin"] },
    { field: FIELDS.github, any: ["github", "git hub"] },
    { field: FIELDS.website, any: ["portfolio", "personal website", "website", "personal site", "blog", "url"], neg: ["linkedin", "github"] },
    { field: FIELDS.firstName, any: ["first name", "given name", "firstname", "forename"], neg: ["company", "school"] },
    { field: FIELDS.lastName, any: ["last name", "surname", "family name", "lastname"], neg: ["company", "school"] },
    { field: FIELDS.preferredName, any: ["preferred name", "nickname", "preferred first"] },
    { field: FIELDS.fullName, any: ["full name", "your name", "name"], neg: ["first", "last", "company", "school", "user", "file", "preferred", "middle"] },
    { field: FIELDS.addressLine2, any: ["address line 2", "apt", "suite", "unit", "address 2"] },
    { field: FIELDS.addressLine1, any: ["address line 1", "street address", "address", "address 1"], neg: ["email", "line 2", "city", "website", "postal", "zip", "country", "region", "state", "province", "phone", "subdivision"] },
    { field: FIELDS.city, any: ["city", "town"], neg: ["capacity"] },
    { field: FIELDS.state, any: ["state", "province", "region"] },
    { field: FIELDS.postalCode, any: ["zip", "postal", "post code", "postcode"] },
    { field: FIELDS.country, any: ["country"], neg: ["code"] },
    { field: FIELDS.summary, any: ["summary", "about you", "tell us about", "professional summary", "profile"] },
    { field: FIELDS.coverLetter, any: ["cover letter", "why are you", "why do you want", "additional information", "message to"] },
    { field: FIELDS.skills, any: ["skills", "technical skills", "key skills"] },
    { field: FIELDS.authorizedToWork, any: ["authorized to work", "legally authorized", "right to work", "work authorization", "eligible to work"] },
    { field: FIELDS.requireSponsorship, any: ["sponsorship", "require visa", "need visa", "visa support"] },
  ];

  // Fields whose value should be left untouched unless the user opts in.
  const SENSITIVE = [FIELDS.gender, FIELDS.race, FIELDS.veteranStatus, FIELDS.disabilityStatus];

  // Human-readable labels for the confirm overlay.
  const LABELS = {
    firstName: "First name", lastName: "Last name", fullName: "Full name",
    preferredName: "Preferred name", email: "Email", phone: "Phone",
    addressLine1: "Address", addressLine2: "Address line 2", city: "City",
    state: "State / Province", postalCode: "Postal code", country: "Country",
    linkedin: "LinkedIn", github: "GitHub", website: "Website",
    authorizedToWork: "Authorized to work", requireSponsorship: "Needs sponsorship",
    summary: "Summary", skills: "Skills", coverLetter: "Cover letter",
    gender: "Gender", race: "Race / Ethnicity", veteranStatus: "Veteran status",
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
      gender: "", race: "", veteranStatus: "", disabilityStatus: "",
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
    if (opts.includeEEO) {
      [FIELDS.gender, FIELDS.race, FIELDS.veteranStatus, FIELDS.disabilityStatus].forEach((k) => {
        if (bio[k]) v[k] = bio[k];
      });
    }
    // structured experience/education travel alongside for adapters that use them
    v.__experience = resume.experience || [];
    v.__education = resume.education || [];
    v.__languages = Array.isArray(resume.languages) ? resume.languages : [];
    v.__skillsArray = Array.isArray(resume.skills) ? resume.skills : [];
    v.__webCount = [bio.linkedin, bio.github, bio.website].filter(Boolean).length;
    return v;
  }

  JAF.schema = { FIELDS, MATCHERS, SENSITIVE, LABELS, emptyBio, emptyResume, buildFillValues };
})();
