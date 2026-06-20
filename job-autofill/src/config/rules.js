/* rules.js — the bundled, versioned field-mapping RULESET (data, not behavior).
 *
 *  This is the single most rot-prone part of the extension: which DOM signals map
 *  to which canonical field on each ATS. Vendors change their markup, so instead
 *  of compiling these into the adapters we keep them here as data, and the
 *  ruleStore (rules-store.js) can replace this whole object at runtime with a
 *  newer version fetched from a hosted file — no extension re-release required.
 *
 *  Shape of a "rule" (matched against an element's lowercased automation-id
 *  chain or label text):
 *     { any:[substrings], all:[substrings], not:[substrings], regex:"..." }
 *  A rule matches when: every `all` present AND some `any` present (or `regex`
 *  matches) AND no `not` present. See JAF.rules.match().
 *
 *  Bump `version` whenever this changes; the store only adopts a remote ruleset
 *  whose version is strictly higher than the active one.
 */
(function () {
  const JAF = (window.JAF = window.JAF || {});

  JAF.defaultRules = {
    version: 2,
    updatedAt: "2026-06-20",

    // Keyword matchers for the GENERIC (no dedicated adapter) label matcher.
    // Kept in the {field, any, neg} shape that scanGeneric consumes.
    generic: [
      { field: "email", any: ["e-mail", "email"], neg: ["confirm", "verify"] },
      { field: "phone", any: ["phone", "mobile", "telephone", "cell"], neg: ["country code", "phone code", "device", "type", "extension", "ext", "fax"] },
      { field: "linkedin", any: ["linkedin"] },
      { field: "github", any: ["github", "git hub"] },
      { field: "website", any: ["portfolio", "personal website", "website", "personal site", "blog", "url"], neg: ["linkedin", "github"] },
      { field: "firstName", any: ["first name", "given name", "firstname", "forename"], neg: ["company", "school"] },
      { field: "lastName", any: ["last name", "surname", "family name", "lastname"], neg: ["company", "school"] },
      { field: "preferredName", any: ["preferred name", "nickname", "preferred first"] },
      { field: "fullName", any: ["full name", "your name", "name"], neg: ["first", "last", "company", "school", "user", "file", "preferred", "middle"] },
      { field: "addressLine2", any: ["address line 2", "apt", "suite", "unit", "address 2"] },
      { field: "addressLine1", any: ["address line 1", "street address", "address", "address 1"], neg: ["email", "line 2", "city", "website", "postal", "zip", "country", "region", "state", "province", "phone", "subdivision"] },
      { field: "city", any: ["city", "town"], neg: ["capacity"] },
      { field: "state", any: ["state", "province", "region"] },
      { field: "postalCode", any: ["zip", "postal", "post code", "postcode"] },
      { field: "country", any: ["country"], neg: ["code"] },
      { field: "summary", any: ["summary", "about you", "tell us about", "professional summary", "profile"] },
      { field: "coverLetter", any: ["cover letter", "why are you", "why do you want", "additional information", "message to"] },
      { field: "skills", any: ["skills", "technical skills", "key skills"] },
      { field: "authorizedToWork", any: ["authorized to work", "legally authorized", "right to work", "work authorization", "eligible to work", "authorization to work"] },
      { field: "requireSponsorship", any: ["sponsorship", "require visa", "need visa", "visa support", "require sponsorship", "immigration"] },
      { field: "ethnicity", any: ["hispanic", "latino", "latinx", "ethnicity"], neg: ["non-hispanic"] },
      { field: "race", any: ["race", "racial", "ethnic background", "race/ethnicity"], neg: ["embrace", "trace"] },
      { field: "gender", any: ["gender", "what is your sex", "your sex", "gender identity"], neg: ["identity document"] },
      { field: "veteranStatus", any: ["veteran", "protected veteran", "military service"] },
      { field: "disabilityStatus", any: ["disability", "disabled", "differently abled"] },
    ],

    // Per-ATS selector data. Each adapter's behavior lives in code; only these
    // automation-id / keyword signals live here.
    sites: {
      workday: {
        fields: {
          firstName: { any: ["firstname"], not: ["preferred"] },
          preferredName: { all: ["firstname", "preferred"] },
          lastName: { any: ["lastname"], not: ["preferred"] },
          email: { any: ["email"], not: ["verify", "confirm"] },
          phone: { any: ["phone"], not: ["device", "type", "extension", "code"] },
          addressLine1: { any: ["addressline1", "addline1"], regex: "address.*line.?1" },
          addressLine2: { any: ["addressline2", "addline2"], regex: "address.*line.?2" },
          city: { any: ["city", "municipality"] },
          postalCode: { any: ["postal", "zip"] },
          country: { any: ["country"], not: ["countryregion", "region", "subdivision", "code", "dial", "phone"] },
          state: { any: ["countryregion", "subdivision", "region", "state", "province"], not: ["countrycode", "phonecode", "dialcode", "postal", "country code"] },
          skills: { any: ["skill"] },
        },
        exp: {
          anchor: { any: ["jobtitle", "job title"] },
          siblings: ["company", "description", "location", "employer"],
          title: { any: ["jobtitle", "job title"] },
          company: { any: ["company", "employer"] },
          location: { any: ["location"] },
          description: { any: ["roledescription", "description"] },
          currentText: ["current"],
        },
        edu: {
          anchor: { any: ["school", "institution", "university"] },
          siblings: ["degree", "fieldofstudy", "field of study", "gradyear"],
          school: { any: ["school", "institution", "university"] },
          degree: { any: ["degree"] },
          field: { any: ["fieldofstudy", "field of study", "major"] },
        },
        lang: {
          anchor: { any: ["language"], not: ["proficiency"] },
          siblings: ["proficiency", "ability", "fluency", "comprehension"],
          language: { any: ["language"], not: ["proficiency"] },
          proficiency: { any: ["proficiency", "ability", "fluency"] },
        },
        websites: { any: ["webaddress", "web address", "websiteurl"] },
        questions: {
          authorizedToWork: { yesNo: true, any: ["authorizedtowork", "legallyauthorized", "righttowork", "workauthoriz", "eligibletowork", "authorizationtowork"] },
          requireSponsorship: { yesNo: true, any: ["sponsorship", "requirevisa", "visasponsor", "needvisa", "immigration"] },
          gender: { any: ["gender", "_sex", "gender-identity"] },
          ethnicity: { any: ["hispanic", "latino", "ethnicity"] },
          race: { any: ["race", "ethnicbackground", "ethnicity-race"] },
          veteranStatus: { any: ["veteran", "military", "protectedveteran"] },
          disabilityStatus: { any: ["disability", "disabled"] },
        },
        sections: {
          experience: { auto: "workexperience", text: "work experience", exclude: "address|education|skill|website|language|certification|referen" },
          education: { auto: "education", text: "education", exclude: "address|experience|skill|website|language|certification|referen" },
          language: { auto: "language", text: "languages?", exclude: "address|experience|skill|website|education|certification|referen" },
          website: { auto: "website", text: "websites?", exclude: "address|experience|skill|education|language|certification|referen" },
        },
        next: { any: ["next", "continue"], not: ["submit", "previous", "back"] },
      },
    },
  };
})();
