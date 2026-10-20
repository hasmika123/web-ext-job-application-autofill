/* Local stand-in of a Workday application flow (development only; served by web/scripts/demo-ats-server.mjs).
 *
 * Step 1 (My Information) is the real markup captured from Adobe's Workday site on 2026-10-19 (flow.html); the other steps are built here
 * from the same Workday components (class names, data-automation-ids, popups), so the extension meets what it meets on a real tenant:
 * button dropdowns with a [role=listbox] popup, multiselect prompts with selected-item pills, Add rows, month/year date sections, a hidden
 * file input, a Next button that validates the step, and a Review step whose button says Submit. Nothing leaves this page: Submit only
 * shows a confirmation.
 */
(function () {
  "use strict";
  const COMPANY = "Adobe";
  const STEPS = ["My Information", "My Experience", "Application Questions", "Voluntary Disclosures", "Review"];

  const CARET = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="wd-icon-caret-down-small wd-icon" focusable="false" role="presentation" viewBox="0 0 24 24"><g fill-rule="evenodd" class="wd-icon-container"><path d="M12.288 15.866c.117.18.31.177.424 0l4.235-6.538c.116-.18.034-.328-.176-.328H8.229c-.214 0-.29.15-.176.328z" class="wd-icon-fill"></path></g></svg>';
  const PROMPTS = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="wd-icon-prompts wd-icon" focusable="false" role="presentation" viewBox="0 0 24 24"><g fill-rule="evenodd" class="wd-icon-container"><path d="M4 6.505C4 6.226 4.214 6 4.505 6h.99c.279 0 .505.214.505.505v.99A.497.497 0 0 1 5.495 8h-.99A.497.497 0 0 1 4 7.495zm0 5c0-.279.214-.505.505-.505h.99c.279 0 .505.214.505.505v.99a.497.497 0 0 1-.505.505h-.99A.497.497 0 0 1 4 12.495zm0 5c0-.279.214-.505.505-.505h.99c.279 0 .505.214.505.505v.99a.497.497 0 0 1-.505.505h-.99A.497.497 0 0 1 4 17.495zm4-10C8 6.226 8.229 6 8.5 6h11c.276 0 .5.214.5.505v.99a.506.506 0 0 1-.5.505h-11a.495.495 0 0 1-.5-.505zm0 5c0-.279.229-.505.5-.505h11c.276 0 .5.214.5.505v.99a.506.506 0 0 1-.5.505h-11a.495.495 0 0 1-.5-.505zm0 5c0-.279.229-.505.5-.505h11c.276 0 .5.214.5.505v.99a.506.506 0 0 1-.5.505h-11a.495.495 0 0 1-.5-.505z" class="wd-icon-fill"></path></g></svg>';
  const XICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" class="wd-icon-x-small wd-icon" focusable="false" role="presentation" viewBox="0 0 24 24"><g class="wd-icon-container"><path fill-rule="evenodd" d="M12 10.586l3.536-3.536a.5.5 0 0 1 .707 0l.707.707a.5.5 0 0 1 0 .707L13.414 12l3.536 3.536a.5.5 0 0 1 0 .707l-.707.707a.5.5 0 0 1-.707 0L12 13.414 8.464 16.95a.5.5 0 0 1-.707 0l-.707-.707a.5.5 0 0 1 0-.707L10.586 12 7.05 8.464a.5.5 0 0 1 0-.707l.707-.707a.5.5 0 0 1 .707 0L12 10.586z" class="wd-icon-fill"></path></g></svg>';
  const CAL = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="wd-icon-calendar wd-icon" focusable="false" role="presentation" viewBox="0 0 24 24"><g fill-rule="evenodd" class="wd-icon-container"><path d="M7 3.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5V5h6V3.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5V5h1.5A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H7V3.5zM6 10v8h12v-8H6z" class="wd-icon-fill"></path></g></svg>';
  const UPLOAD = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="wd-icon-upload-cloud wd-icon" focusable="false" role="presentation" viewBox="0 0 24 24"><g fill-rule="evenodd" class="wd-icon-container"><path d="M12.354 8.146a.5.5 0 0 0-.708 0l-3.5 3.5a.5.5 0 0 0 0 .708l.708.707a.5.5 0 0 0 .707 0L11 11.62V17.5a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-5.88l1.44 1.44a.5.5 0 0 0 .706 0l.708-.707a.5.5 0 0 0 0-.708l-3.5-3.5zM6.07 9.016A6.002 6.002 0 0 1 17.93 9.016 4.5 4.5 0 0 1 17.5 18h-2v-2h2a2.5 2.5 0 0 0 .21-4.99l-.86-.07-.12-.86a4.001 4.001 0 0 0-7.92 0l-.12.86-.86.07A2.5 2.5 0 0 0 6.5 16h2v2h-2a4.5 4.5 0 0 1-.43-8.984z" class="wd-icon-fill"></path></g></svg>';
  const CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="wd-icon-check-small wd-icon" focusable="false" role="presentation" viewBox="0 0 24 24"><g class="wd-icon-container"><path d="M10.5 15.086l7.044-7.044a.5.5 0 0 1 .707 0l.707.707a.5.5 0 0 1 0 .707l-8.105 8.105a.5.5 0 0 1-.707 0L6.04 13.454a.5.5 0 0 1 0-.707l.707-.707a.5.5 0 0 1 .707 0l3.046 3.046z" class="wd-icon-fill" fill="#fff"></path></g></svg>';

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let uid = 0;
  const nid = (p) => `${p}-${(++uid).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  // ---- option lists ---------------------------------------------------------------------------
  const YES_NO = ["Yes", "No"];
  const STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];
  const COUNTRIES = ["Australia", "Brazil", "Canada", "France", "Germany", "India", "Ireland", "Japan", "Mexico", "Netherlands", "Singapore", "United Kingdom", "United States of America"];
  const SOURCES = ["Adobe Careers Website", "Employee Referral", "Glassdoor", "Indeed", "Job Fair", "LinkedIn", "Recruiter Outreach", "Social Media", "University Recruiting", "Other"];
  const DEGREES = ["High School Diploma or Equivalent", "Associate's Degree", "Bachelor of Arts (BA)", "Bachelor of Science (BS)", "Bachelor of Technology (BTech)", "Bachelor of Engineering (BE)", "Masters of Arts (MA)", "Masters of Science (MS)", "Masters of Business Administration (MBA)", "Doctor of Philosophy (PhD)", "Juris Doctor (JD)", "Other"];
  const FIELDS_OF_STUDY = ["Computer Engineering", "Computer Science", "Computer Science and Engineering", "Data Science", "Electrical Engineering", "Electronics and Communication", "Information Systems", "Information Technology", "Mathematics", "Mechanical Engineering", "Physics", "Software Engineering", "Statistics"];
  const SKILLS = ["Agile Methodologies", "Amazon EC2", "Amazon EKS", "Amazon RDS", "Amazon S3", "Amazon Web Services (AWS)", "Ansible", "Apache Airflow", "Apache Kafka", "Apache Spark", "API Development", "Argo CD", "AWS", "AWS IAM", "AWS Lambda", "Azure", "Bash", "C++", "Chef", "CI/CD", "Cloud Computing", "Data Engineering", "Data Modeling", "Datadog", "dbt", "DevOps", "Docker", "ElasticSearch", "ETL", "GitHub Actions", "Go", "Google Cloud Platform (GCP)", "Grafana", "Helm", "Incident Response", "Java", "JavaScript", "Jenkins", "Kafka", "Kubernetes", "Linux", "Machine Learning", "Microservices", "MongoDB", "MySQL", "Node.js", "PostgreSQL", "Prometheus", "Python", "React", "REST APIs", "Scala", "Site Reliability Engineering", "SLOs", "Snowflake", "Spark", "Spring Boot", "SQL", "Terraform", "TypeScript"];
  const GENDER = ["Female", "Male", "I do not wish to answer"];
  const HISPANIC = ["Yes", "No", "I do not wish to answer"];
  const RACE = ["American Indian or Alaska Native (United States of America)", "Asian (United States of America)", "Black or African American (United States of America)", "Native Hawaiian or Other Pacific Islander (United States of America)", "Two or More Races (United States of America)", "White (United States of America)", "I do not wish to answer"];
  const VETERAN = ["I am not a protected veteran", "I identify as one or more of the classifications of protected veteran", "I do not wish to self-identify"];

  // ---- markup builders (the Workday components, same classes as the captured page) ----------
  const star = (req) => (req ? '<abbr aria-hidden="true" class="css-1fc83zd">*</abbr>' : "");
  const labelHtml = (forId, label, req) => `<label for="${forId}" class="css-1ud5i8o">${req ? `<span>${esc(label)}${star(true)}</span>` : esc(label)}</label>`;
  function wrap(aid, forId, label, req, control, cls) {
    return `<div data-automation-id="${aid}" class="${cls || "css-7t35fz"}" data-wd-field="${esc(label)}"${req ? ' data-wd-required="true"' : ""}>${labelHtml(forId, label, req)}<div class="css-15rz5ap"><div style="width: 100%; max-width: 344px; min-width: 280px;">${control}</div><div class="css-18szrho"></div></div></div>`;
  }
  function textField(aid, label, req) {
    const id = nid(aid);
    return wrap(`formField-${aid}`, id, label, req, `<input type="text" id="${id}" name="${aid}" aria-required="${req ? "true" : "false"}" class="css-1g5l6xc" value="">`);
  }
  function textArea(aid, label, req) {
    const id = nid(aid);
    return `<div data-automation-id="formField-${aid}" class="css-7t35fz" data-wd-field="${esc(label)}"${req ? ' data-wd-required="true"' : ""}>${labelHtml(id, label, req)}<div class="css-15rz5ap"><div style="width: 100%; max-width: 640px; min-width: 280px;"><textarea id="${id}" name="${aid}" rows="5" aria-required="${req ? "true" : "false"}" class="css-1g5l6xc wd-textarea"></textarea></div><div class="css-18szrho"></div></div></div>`;
  }
  function dropdown(aid, label, req, options) {
    const id = nid(aid);
    const ctl = `<div class="css-12zup1l"><button aria-haspopup="listbox" type="button" value="" aria-label="${esc(label)} Select One${req ? " Required" : ""}" name="${aid}" id="${id}" class="css-fdfu7c" data-wd-options="${esc(JSON.stringify(options))}">Select One</button><input type="text" class="css-77hcv" value=""><span class="menu-icon css-gvnnq4">${CARET}</span></div>`;
    return wrap(`formField-${aid}`, id, label, req, ctl);
  }
  function multiselect(aid, label, req, options, opts) {
    const id = nid(aid), cid = nid("ms"), did = nid("d");
    opts = opts || {};
    const ctl = `<div class="css-1sw7cgs"><div dir="ltr" tabindex="-1" data-automation-id="multiSelectContainer" id="${cid}" data-uxi-widget-type="multiselect" class="css-dapbss" data-wd-options="${esc(JSON.stringify(options))}"${opts.multi ? ' data-wd-multi="true"' : ""}${opts.typeahead ? ' data-wd-typeahead="true"' : ""}><div data-automation-id="multiselectInputContainer" dir="ltr" color="#1473E6" class="css-1j0rjec"><div data-automation-hiddensearch="false" class="css-ujzx5o"><input enterkeyhint="search" dir="ltr" placeholder="${opts.typeahead ? "Type to Add Skills" : "Search"}" aria-invalid="false" aria-describedby="${did}" aria-disabled="false" aria-required="${req ? "true" : "false"}" autocomplete="off" tabindex="0" data-uxi-widget-type="selectinput" data-uxi-multiselect-id="${cid}" id="${id}" class="css-1jafa2r" value=""><div data-automation-id="promptSelectionLabel" class="css-6nc22j"></div><div id="${did}" aria-hidden="true" data-automation-id="promptAriaInstruction" class="css-6nc22j">0 items selected</div></div><div tabindex="-1" class="css-14lkp70 wd-pills" hidden><ul role="listbox" tabindex="0" data-automation-id="selectedItemList" aria-label="items selected" class="css-0"></ul></div><span class="css-12ds82q css-1o178hw" data-automation-id="promptIcon" aria-hidden="true" style="--color-system-icon-9f0d45: #7b858f; --accentColor-system-icon-9f0d45: #7b858f; --colorHover-fd51fd: normal;">${PROMPTS}</span></div></div></div>`;
    return `<div data-automation-id="formField-${aid}" class="css-7t35fz" data-wd-field="${esc(label)}"${req ? ' data-wd-required="true"' : ""}>${labelHtml(id, label, req)}<div class="css-15rz5ap"><div>${ctl}</div><div class="css-0"></div></div></div>`;
  }
  function checkbox(aid, label) {
    const id = nid(aid);
    return `<div data-automation-id="formField-${aid}" class="css-7t35fz wd-check" data-wd-field="${esc(label)}"><div class="css-1utp272"><div class="css-d3pjdr"><input id="${id}" type="checkbox" aria-checked="false" data-automation-id="${aid}" class="css-1r7y3ml"><span class="css-15ws53q"></span><div class="css-1ikf28c"><div class="css-wwg2k6">${CHECK}</div></div></div><label for="${id}" class="css-1ifmyht">${esc(label)}</label></div></div>`;
  }
  function dateField(aid, label, req, parts) {
    const id = nid(aid);
    const sect = (p, ph, size) => `<div class="wd-date-sect"><input type="text" role="spinbutton" inputmode="numeric" aria-label="${p}" placeholder="${ph}" maxlength="${size}" data-automation-id="dateSection${p}-input" id="${id}-${p}" class="wd-date-input" value=""></div>`;
    const inner = parts.map((p) => (p === "Month" ? sect("Month", "MM", 2) : p === "Day" ? sect("Day", "DD", 2) : sect("Year", "YYYY", 4))).join('<span class="wd-date-sep">/</span>');
    const ctl = `<div data-automation-id="dateInputWrapper" class="wd-date" role="group" aria-labelledby="${id}-l">${inner}<span class="wd-date-cal" data-automation-id="dateIcon">${CAL}</span></div>`;
    return `<div data-automation-id="formField-${aid}" class="css-7t35fz" data-wd-field="${esc(label)}"${req ? ' data-wd-required="true"' : ""}><label id="${id}-l" for="${id}-${parts[0]}" class="css-1ud5i8o">${req ? `<span>${esc(label)}${star(true)}</span>` : esc(label)}</label><div class="css-15rz5ap">${ctl}<div class="css-18szrho"></div></div></div>`;
  }
  const divider = '<div data-automation-id="smartDivider" data-smart-divider="true" class="css-knnl48"></div>';
  const header = (title, note) => `<h3 tabindex="-1" class="css-1ylcaf3">${esc(title)}</h3>${note === false ? "" : '<div class="css-1qmlawl"><abbr class="css-f40pqd">*</abbr> Indicates a required field</div>'}`;

  // ---- step 2: My Experience ---------------------------------------------------------------------
  function expPanel(n) {
    return `<div role="group" aria-labelledby="Work-Experience-${n}-panel" data-automation-id="workExperience-${n}" class="wd-panel"><div class="wd-panel-head"><h4 id="Work-Experience-${n}-panel" class="css-1c2ie72 wd-panel-title">Work Experience ${n}</h4><button type="button" class="wd-delete" data-automation-id="panel-set-delete-button" aria-label="Delete Work Experience ${n}">Delete</button></div>
      ${textField("jobTitle", "Job Title", true)}${textField("companyName", "Company", true)}${textField("location", "Location", false)}${checkbox("currentlyWorkHere", "I currently work here")}
      ${dateField("startDate", "From", true, ["Month", "Year"])}<div class="wd-enddate">${dateField("endDate", "To", true, ["Month", "Year"])}</div>${textArea("roleDescription", "Role Description", false)}</div>`;
  }
  function eduPanel(n) {
    return `<div role="group" aria-labelledby="Education-${n}-panel" data-automation-id="education-${n}" class="wd-panel"><div class="wd-panel-head"><h4 id="Education-${n}-panel" class="css-1c2ie72 wd-panel-title">Education ${n}</h4><button type="button" class="wd-delete" data-automation-id="panel-set-delete-button" aria-label="Delete Education ${n}">Delete</button></div>
      ${textField("schoolName", "School or University", true)}${dropdown("degree", "Degree", true, DEGREES)}${multiselect("fieldOfStudy", "Field of Study", false, FIELDS_OF_STUDY)}${textField("gradeAverage", "Overall Result (GPA)", false)}
      ${dateField("firstYearAttended", "From", false, ["Year"])}${dateField("lastYearAttended", "To (Actual or Expected)", false, ["Year"])}</div>`;
  }
  function webPanel(n) {
    return `<div role="group" aria-labelledby="Websites-${n}-panel" data-automation-id="websitePanelSet-${n}" class="wd-panel"><div class="wd-panel-head"><h4 id="Websites-${n}-panel" class="css-1c2ie72 wd-panel-title">Websites ${n}</h4><button type="button" class="wd-delete" data-automation-id="panel-set-delete-button" aria-label="Delete Websites ${n}">Delete</button></div>${textField("url", "URL", true)}</div>`;
  }
  function section(aid, title, panelFn, intro) {
    return `<div role="group" aria-labelledby="${aid}-section" data-automation-id="${aid}Section" data-wd-section="${aid}" class="wd-section"><h4 id="${aid}-section" class="css-1c2ie72">${esc(title)}</h4>${intro ? `<p class="wd-intro">${esc(intro)}</p>` : ""}<div class="wd-panels"></div><div class="wd-add-row"><button type="button" data-automation-id="add-button" class="css-rg2sg8 wd-add" aria-label="Add ${esc(title)}">Add</button></div></div>`;
  }
  function buildExperience() {
    return `${header("My Experience")}<div data-automation-id="applyFlowMyExpPage">
      ${section("workExperience", "Work Experience")}${divider}${section("education", "Education")}${divider}
      <div role="group" aria-labelledby="skills-section" class="wd-section"><h4 id="skills-section" class="css-1c2ie72">Skills</h4>${multiselect("skills", "Type to Add Skills", false, SKILLS, { multi: true, typeahead: true })}</div>${divider}
      <div role="group" aria-labelledby="resume-section" class="wd-section"><h4 id="resume-section" class="css-1c2ie72">Resume/CV</h4>
        <div data-automation-id="formField-resumeAttachments" class="css-7t35fz" data-wd-field="Resume/CV" data-wd-required="true" data-wd-file="true"><label class="css-1ud5i8o"><span>Upload a file (5MB max)${star(true)}</span></label>
          <div data-automation-id="file-upload-drop-zone" class="wd-drop">${UPLOAD}<span class="wd-drop-text">Drop file here</span><span class="wd-drop-or">or</span><button type="button" data-automation-id="select-files" class="css-rg2sg8 wd-select-files">Select file</button><input type="file" data-automation-id="file-upload-input-ref" accept=".pdf,.doc,.docx" style="display:none"></div>
          <div class="wd-files" data-automation-id="file-upload-successful"></div></div></div>${divider}
      ${section("websites", "Websites")}
    </div>`;
  }
  // ---- step 3: Application Questions -------------------------------------------------------------
  function buildQuestions() {
    return `${header("Application Questions")}<div data-automation-id="applyFlowPrimaryQuestionsPage"><div data-automation-id="primaryQuestionnaire" class="wd-questionnaire">
      ${dropdown("q-authorized", "Are you legally authorized to work in the country in which you are applying?", true, YES_NO)}
      ${dropdown("q-sponsorship", "Will you now or in the future require sponsorship for employment visa status (e.g., H-1B visa status)?", true, YES_NO)}
      ${dropdown("q-relocate", "This position is based in San Jose, CA. Are you willing to relocate?", true, YES_NO)}
      ${textField("q-salary", "What are your salary expectations for this role?", true)}
      ${textField("q-notice", "If offered this position, how much notice would you need to give your current employer?", true)}
    </div></div>`;
  }
  // ---- step 4: Voluntary Disclosures -------------------------------------------------------------
  function buildDisclosures() {
    return `${header("Voluntary Disclosures")}<div data-automation-id="applyFlowVoluntaryDisclosuresPage">
      <div class="wd-richtext"><p>${COMPANY} is an Equal Employment Opportunity employer. We do not discriminate based on gender, race or color, ethnicity or national origin, age, disability, religion, sexual orientation, gender identity or expression, veteran status, or any other applicable characteristics protected by law.</p><p>Submission of this information is voluntary and refusal to provide it will not subject you to any adverse treatment. The information will be kept confidential and used only in accordance with applicable laws.</p></div>
      ${dropdown("gender", "Gender", true, GENDER)}${dropdown("hispanicOrLatino", "Are you Hispanic or Latino?", true, HISPANIC)}${dropdown("ethnicity", "Please select the ethnicity which most accurately describes how you identify yourself", true, RACE)}${dropdown("veteranStatus", "Veteran Status", true, VETERAN)}
    </div>`;
  }
  // ---- step 5: Review ------------------------------------------------------------------------------
  function valueOf(field) {
    if (field.dataset.wdFile) return Array.from(field.querySelectorAll(".wd-file-name")).map((n) => n.textContent).join(", ");
    const btn = field.querySelector('button[aria-haspopup="listbox"]');
    if (btn) return btn.value ? btn.textContent.trim() : "";
    const ms = field.querySelector('[data-automation-id="multiSelectContainer"]');
    if (ms) return Array.from(ms.querySelectorAll('[data-automation-id="selectedItem"] [data-automation-id="promptOption"]')).map((n) => n.textContent).join(", ");
    const radio = field.querySelector('input[type="radio"]:checked');
    if (field.querySelector('input[type="radio"]')) {
      const lab = radio && field.querySelector(`label[for="${radio.id}"]`);
      return radio ? (lab ? lab.textContent.trim() : radio.value) : "";
    }
    const cb = field.querySelector('input[type="checkbox"]');
    if (cb) return cb.checked ? "Yes" : "";
    const dates = field.querySelectorAll(".wd-date-input");
    if (dates.length) return Array.from(dates).map((d) => d.value).filter(Boolean).join("/");
    const t = field.querySelector("input, textarea");
    return t ? t.value.trim() : "";
  }
  function buildReview() {
    const blocks = pages.slice(0, 4).map((page, i) => {
      const fields = Array.from(page.querySelectorAll("[data-wd-field]")).filter((f) => !f.closest(".wd-enddate.wd-hidden"));
      let lastPanel = null;
      const rows = fields.map((f) => {
        const v = valueOf(f);
        if (!v) return "";
        const panel = f.closest(".wd-panel");
        let head = "";
        if (panel && panel !== lastPanel) { lastPanel = panel; head = `<h5 class="wd-review-sub">${esc(panel.querySelector(".wd-panel-title").textContent)}</h5>`; }
        return `${head}<div class="wd-review-row"><div class="wd-review-label">${esc(f.dataset.wdField)}</div><div class="wd-review-value">${esc(v).replace(/\n/g, "<br>")}</div></div>`;
      }).join("");
      return `<div class="wd-review-block" data-automation-id="reviewSection-${i + 1}"><h4 class="css-1c2ie72">${esc(STEPS[i])}</h4>${rows || '<p class="wd-intro">No information entered.</p>'}</div>`;
    }).join(divider);
    return `${header("Review", false)}<div data-automation-id="applyFlowReviewPage">${blocks}<p class="wd-certify">By clicking Submit, I certify that the information I have provided is true and accurate to the best of my knowledge.</p></div>`;
  }

  // ---- page + navigation -----------------------------------------------------------------------
  const stepHost = document.getElementById("wdStep");
  const progress = document.querySelector('[data-automation-id="progressBar"]');
  const footer = document.querySelector('[data-automation-id="pageFooter"]');
  const pages = [];
  let current = 0;
  {
    const p0 = document.createElement("div");
    p0.className = "wd-page";
    while (stepHost.firstChild) p0.appendChild(stepHost.firstChild);
    // the captured step marks required fields with aria-required / the asterisk; mark the wrappers the same way for validation and review
    p0.querySelectorAll('[data-automation-id^="formField-"]').forEach((f) => {
      const lab = f.querySelector("label");
      f.dataset.wdField = lab ? lab.textContent.replace(/\*$/, "").trim() : "";
      if (f.querySelector('abbr.css-1fc83zd')) f.dataset.wdRequired = "true";
    });
    // the option lists the captured controls open (Workday fetches them when the popup opens)
    const opts = (sel, list) => { const el = p0.querySelector(sel); if (el) el.dataset.wdOptions = JSON.stringify(list); };
    opts("#country--country", COUNTRIES);
    opts("#address--countryRegion", STATES);
    opts("#phoneNumber--phoneType", ["Home", "Mobile", "Work"]);
    p0.querySelectorAll('[data-automation-id="multiSelectContainer"]').forEach((ms) => {
      const input = ms.querySelector("input");
      ms.dataset.wdOptions = JSON.stringify(input && input.id === "source--source" ? SOURCES : ["Canada (+1)", "India (+91)", "United Kingdom (+44)", "United States of America (+1)"]);
      let pills = ms.querySelector(".css-14lkp70");
      if (pills) pills.classList.add("wd-pills");
      else {
        ms.querySelector(".css-ujzx5o").insertAdjacentHTML("afterend", '<div tabindex="-1" class="css-14lkp70 wd-pills" hidden><ul role="listbox" tabindex="0" data-automation-id="selectedItemList" aria-label="items selected" class="css-0"></ul></div>');
      }
    });
    pages[0] = p0;
  }
  const builders = [null, buildExperience, buildQuestions, buildDisclosures, buildReview];

  function renderProgress() {
    progress.innerHTML = STEPS.map((name, i) => {
      const state = i < current ? "Completed" : i === current ? "Active" : "Inactive";
      const left = i === 0 ? '<div color="#1473E6" class="css-klnzhc"></div>' : `<div class="${i <= current ? "wd-line-done" : "css-fkn6a7"}"></div>`;
      const right = i === STEPS.length - 1 ? '<div color="#1473E6" class="css-klnzhc"></div>' : `<div class="${i < current ? "wd-line-done" : "css-fkn6a7"}"></div>`;
      const dot = state === "Active" ? '<div color="#1473E6" class="css-akw9os"></div>' : state === "Completed" ? `<div class="wd-dot-done">${CHECK}</div>` : '<div class="css-1osnbx9"></div>';
      return `<li data-automation-id="progressBar${state}Step" class="css-1dczh83"><div class="css-yjitp2">${left}<div class="css-1rjq8gp">${dot}</div>${right}</div><label aria-live="polite" class="css-vv2f43">${state === "Active" ? "current " : ""}step ${i + 1} of ${STEPS.length}</label><label class="${state === "Active" ? "css-1uso8fp" : "css-1u51z1n"}">${esc(name)}</label></li>`;
    }).join("");
  }
  function renderFooter() {
    const last = current === STEPS.length - 1;
    footer.innerHTML = `<div class="css-b3pn3b wd-footer-row">${current > 0 ? '<button class="css-rg2sg8 wd-back" data-automation-id="pageFooterBackButton" type="button">Back</button>' : ""}<div class="css-b3pn3b"><button class="css-yv3hkp" data-automation-id="pageFooterNextButton" font-size="14" height="40" type="button">${last ? "Submit" : "Next"}</button></div></div>`;
    footer.querySelector('[data-automation-id="pageFooterNextButton"]').onclick = last ? submit : next;
    const back = footer.querySelector('[data-automation-id="pageFooterBackButton"]');
    if (back) back.onclick = () => go(current - 1);
  }
  function go(i) {
    closePopup();
    if (pages[current] && pages[current].parentNode) pages[current].remove();
    current = i;
    if (i === 4 || !pages[i]) {
      const p = document.createElement("div");
      p.className = "wd-page";
      p.innerHTML = builders[i]();
      pages[i] = p;
    }
    stepHost.appendChild(pages[i]);
    renderProgress();
    renderFooter();
    clearErrors();
    window.scrollTo(0, 0);
    try { stepHost.querySelector("h3").focus({ preventScroll: true }); } catch { /* not focusable */ }
  }

  // ---- validation -----------------------------------------------------------------------------
  function clearErrors() {
    document.querySelectorAll(".wd-error-banner").forEach((n) => n.remove());
    document.querySelectorAll(".wd-field-error").forEach((n) => n.remove());
    document.querySelectorAll(".wd-invalid").forEach((n) => n.classList.remove("wd-invalid"));
  }
  function missing(page) {
    return Array.from(page.querySelectorAll('[data-wd-required="true"]')).filter((f) => {
      if (f.closest(".wd-enddate.wd-hidden")) return false;
      return !valueOf(f);
    });
  }
  function showErrors(list) {
    clearErrors();
    const banner = document.createElement("div");
    banner.className = "wd-error-banner";
    banner.setAttribute("data-automation-id", "errorBanner");
    banner.setAttribute("role", "alert");
    banner.innerHTML = `<div class="wd-error-title"><span class="wd-error-icon">!</span>Errors Found<span class="wd-error-count">${list.length}</span></div><ul>${list.map((f) => `<li>The field ${esc(f.dataset.wdField)} is required and must have a value.</li>`).join("")}</ul>`;
    pages[current].insertBefore(banner, pages[current].querySelector("h3").nextSibling);
    list.forEach((f) => {
      f.classList.add("wd-invalid");
      const m = document.createElement("p");
      m.className = "wd-field-error";
      m.setAttribute("data-automation-id", "errorMessage");
      m.innerHTML = `<b>Error:</b> The field ${esc(f.dataset.wdField)} is required and must have a value.`;
      (f.querySelector(".css-15rz5ap") || f).appendChild(m);
    });
    window.scrollTo(0, 0);
  }
  function next() {
    const list = missing(pages[current]);
    if (list.length) { showErrors(list); return; }
    go(current + 1);
  }
  function submit() {
    closePopup();
    document.querySelector('[data-automation-id="applyFlowPage"]').innerHTML = `<div class="wd-done" data-automation-id="applicationSubmitted"><div class="wd-done-icon">${CHECK}</div><h2 class="wd-done-title">Application Submitted</h2><p>Thank you for applying for <b>${esc(document.querySelector('[data-automation-id="jobTitleHeading"]') ? document.querySelector('[data-automation-id="jobTitleHeading"]').textContent : "this position")}</b> at ${COMPANY}.</p><p>We have received your application and will review it shortly. You can check its status at any time from your candidate home.</p></div>`;
    document.title = "Application Submitted";
  }

  // ---- popups: single-select dropdowns and multiselect prompts ------------------------------------
  let popup = null; // { el, owner, kind }
  function closePopup() {
    if (!popup) return;
    popup.el.remove();
    if (popup.owner && popup.owner.setAttribute) popup.owner.setAttribute("aria-expanded", "false");
    popup = null;
  }
  function place(el, anchor) {
    const r = anchor.getBoundingClientRect();
    el.style.top = `${r.bottom + window.scrollY + 4}px`;
    el.style.left = `${r.left + window.scrollX}px`;
    el.style.width = `${Math.max(r.width, 280)}px`;
  }
  function openDropdown(btn) {
    closePopup();
    const opts = JSON.parse(btn.dataset.wdOptions || "[]");
    const el = document.createElement("div");
    el.className = "wd-popup";
    const lid = nid("listbox");
    el.innerHTML = `<ul role="listbox" id="${lid}" data-automation-id="activeListContainer" tabindex="-1">${opts.map((o, i) => `<li role="option" data-automation-id="menuItem" tabindex="-1" aria-selected="${btn.value && btn.textContent.trim() === o ? "true" : "false"}" data-index="${i}"><div class="wd-option" data-automation-id="promptOption" data-automation-label="${esc(o)}">${esc(o)}</div></li>`).join("")}</ul>`;
    document.body.appendChild(el);
    place(el, btn);
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-controls", lid);
    popup = { el, owner: btn, kind: "dropdown" };
    el.addEventListener("click", (e) => {
      const li = e.target.closest('[role="option"]');
      if (!li) return;
      const v = opts[Number(li.dataset.index)];
      btn.textContent = v;
      btn.value = v.toLowerCase().replace(/[^a-z0-9]+/g, "");
      btn.setAttribute("aria-label", `${btn.getAttribute("aria-label").replace(/ (Select One|.+?)( Required)?$/, "")} ${v}`);
      const hidden = btn.parentElement.querySelector(".css-77hcv");
      if (hidden) hidden.value = btn.value;
      btn.dispatchEvent(new Event("change", { bubbles: true }));
      closePopup();
      fieldChanged(btn);
    });
  }
  function msState(ms) {
    return { opts: JSON.parse(ms.dataset.wdOptions || "[]"), multi: ms.dataset.wdMulti === "true", typeahead: ms.dataset.wdTypeahead === "true" };
  }
  function msSelected(ms) { return Array.from(ms.querySelectorAll('[data-automation-id="selectedItem"]')).map((p) => p.querySelector('[data-automation-id="promptOption"]').textContent); }
  function openMulti(ms, query) {
    const { opts, typeahead } = msState(ms);
    const q = String(query || "").trim().toLowerCase();
    const chosen = msSelected(ms);
    let list = opts.filter((o) => !q || o.toLowerCase().includes(q));
    if (typeahead && !q) list = [];
    if (popup && popup.owner === ms) popup.el.remove(); else closePopup();
    const el = document.createElement("div");
    el.className = "wd-popup wd-popup-multi";
    el.innerHTML = list.length
      ? `<div role="listbox" data-automation-id="activeListContainer" aria-multiselectable="true">${list.map((o) => `<div role="option" data-automation-id="menuItem" aria-selected="${chosen.includes(o)}" tabindex="-1"><div class="wd-ms-check${chosen.includes(o) ? " on" : ""}">${CHECK}</div><div data-automation-id="promptOption" data-automation-label="${esc(o)}" class="wd-option">${esc(o)}</div></div>`).join("")}</div>`
      : `<div class="wd-noresults">${q ? "No Items." : "Type to search"}</div>`;
    document.body.appendChild(el);
    place(el, ms.querySelector('[data-automation-id="multiselectInputContainer"]'));
    popup = { el, owner: ms, kind: "multi" };
    el.addEventListener("click", (e) => {
      const opt = e.target.closest('[role="option"]');
      if (!opt) return;
      addPill(ms, opt.querySelector('[data-automation-id="promptOption"]').textContent);
      closePopup();
    });
  }
  function addPill(ms, text) {
    const { multi } = msState(ms);
    const ul = ms.querySelector('[data-automation-id="selectedItemList"]');
    if (msSelected(ms).includes(text)) return;
    if (!multi) ul.innerHTML = "";
    const li = document.createElement("li");
    li.setAttribute("role", "presentation");
    li.setAttribute("data-automation-id", "menuItem");
    li.className = "css-j8lfa5";
    li.innerHTML = `<div class="css-1a8e5v8 css-roynbj" aria-label="${esc(text)}, press delete to clear value." role="option" data-automation-id="selectedItem" dir="ltr" style="--highlightColor-phled: #1473E6;"><div class="css-phlep css-phlet wd-pill-x" data-automation-id="DELETE_charm" role="presentation" aria-hidden="true"><span class="css-1o178hw" style="--size-svg-a30d66: 1.25rem; --color-system-icon-9f0d45: currentColor;">${XICON}</span></div><p class="css-phlev css-phlez" data-automation-id="promptOption" data-automation-label="${esc(text)}">${esc(text)}</p></div>`;
    ul.appendChild(li);
    syncMulti(ms);
  }
  function syncMulti(ms) {
    const sel = msSelected(ms);
    const input = ms.querySelector("input");
    input.value = "";
    input.className = sel.length ? "css-1rwb1er" : "css-1jafa2r";
    ms.querySelector(".wd-pills").hidden = sel.length === 0;
    ms.querySelector('[data-automation-id="promptAriaInstruction"]').textContent = sel.length ? `${sel.length} item${sel.length === 1 ? "" : "s"} selected, ${sel.join(", ")}` : "0 items selected";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    fieldChanged(ms);
  }
  function fieldChanged(el) {
    const f = el.closest("[data-wd-field]");
    if (f && f.classList.contains("wd-invalid") && valueOf(f)) {
      f.classList.remove("wd-invalid");
      f.querySelectorAll(".wd-field-error").forEach((n) => n.remove());
    }
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    const btn = t.closest && t.closest('button[aria-haspopup="listbox"]');
    if (btn && btn.dataset.wdOptions) { e.preventDefault(); if (popup && popup.owner === btn) closePopup(); else openDropdown(btn); return; }
    const del = t.closest && t.closest('[data-automation-id="DELETE_charm"]');
    if (del) { const ms = del.closest('[data-automation-id="multiSelectContainer"]'); del.closest("li").remove(); if (ms) syncMulti(ms); return; }
    const msi = t.closest && t.closest('[data-automation-id="multiselectInputContainer"]');
    if (msi) {
      const ms = msi.closest('[data-automation-id="multiSelectContainer"]');
      if (ms && ms.dataset.wdOptions) { const input = ms.querySelector("input"); if (document.activeElement !== input) input.focus(); if (!(popup && popup.owner === ms)) openMulti(ms, input.value); }
      return;
    }
    const add = t.closest && t.closest('[data-automation-id="add-button"]');
    if (add) { addPanel(add.closest("[data-wd-section]")); return; }
    const delPanel = t.closest && t.closest('[data-automation-id="panel-set-delete-button"]');
    if (delPanel) { const sec = delPanel.closest("[data-wd-section]"); delPanel.closest(".wd-panel").remove(); renumber(sec); return; }
    const pick = t.closest && t.closest('[data-automation-id="select-files"]');
    if (pick) { pick.parentElement.querySelector('input[type="file"]').click(); return; }
    const rmFile = t.closest && t.closest(".wd-file-delete");
    if (rmFile) { rmFile.closest(".wd-file").remove(); return; }
    const backLink = t.closest && t.closest('[data-automation-id="backToJobPosting"]');
    if (backLink) { location.href = location.pathname.replace(/\/apply.*$/, "").replace(/^\/en-US/, ""); return; }
    if (popup && !popup.el.contains(t) && !(popup.owner && popup.owner.contains && popup.owner.contains(t))) closePopup();
  });
  // Options are picked with mousedown in some Workday widgets; a stray mousedown outside an open popup closes it.
  document.addEventListener("mousedown", (e) => {
    if (popup && !popup.el.contains(e.target) && !(popup.owner && popup.owner.contains && popup.owner.contains(e.target))) closePopup();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopup();
    const input = e.target.closest && e.target.closest('[data-uxi-widget-type="selectinput"]');
    if (input && e.key === "Enter") {
      e.preventDefault();
      const ms = input.closest('[data-automation-id="multiSelectContainer"]');
      if (popup && popup.owner === ms) {
        const first = popup.el.querySelector('[role="option"]');
        if (first) { addPill(ms, first.querySelector('[data-automation-id="promptOption"]').textContent); closePopup(); return; }
      }
      openMulti(ms, input.value);
    }
  });
  document.addEventListener("input", (e) => {
    const input = e.target.closest && e.target.closest('[data-uxi-widget-type="selectinput"]');
    if (input) { const ms = input.closest('[data-automation-id="multiSelectContainer"]'); if (ms && ms.dataset.wdOptions) openMulti(ms, input.value); return; }
    fieldChanged(e.target);
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.type === "file") {
      const zone = t.closest("[data-wd-file]");
      const list = zone.querySelector(".wd-files");
      Array.from(t.files || []).forEach((f) => {
        const kb = Math.max(1, Math.round(f.size / 1024));
        const row = document.createElement("div");
        row.className = "wd-file";
        row.setAttribute("data-automation-id", "file-upload-item");
        row.innerHTML = `<div class="wd-file-icon">PDF</div><div class="wd-file-meta"><div class="wd-file-name" data-automation-id="file-upload-item-name">${esc(f.name)}</div><div class="wd-file-ok">${CHECK}<span>Successfully Uploaded!</span><span class="wd-file-size">${kb} KB</span></div></div><button type="button" class="wd-file-delete" data-automation-id="delete-file" aria-label="Delete ${esc(f.name)}">${XICON}</button>`;
        list.innerHTML = "";
        list.appendChild(row);
      });
      fieldChanged(t);
      return;
    }
    if (t.type === "checkbox") {
      t.setAttribute("aria-checked", String(t.checked));
      if (t.getAttribute("data-automation-id") === "currentlyWorkHere") {
        const end = t.closest(".wd-panel").querySelector(".wd-enddate");
        if (end) end.classList.toggle("wd-hidden", t.checked);
      }
    }
    if (t.type === "radio") document.querySelectorAll(`input[name="${t.name}"]`).forEach((r) => r.setAttribute("aria-checked", String(r.checked)));
    fieldChanged(t);
  });
  window.addEventListener("resize", closePopup);

  function addPanel(sec) {
    const kind = sec.dataset.wdSection;
    const panels = sec.querySelector(".wd-panels");
    const n = panels.children.length + 1;
    const html = kind === "workExperience" ? expPanel(n) : kind === "education" ? eduPanel(n) : webPanel(n);
    panels.insertAdjacentHTML("beforeend", html);
    sec.querySelector(".wd-add").textContent = "Add Another";
  }
  function renumber(sec) {
    const name = sec.querySelector("h4").textContent;
    Array.from(sec.querySelectorAll(".wd-panel")).forEach((p, i) => { p.querySelector(".wd-panel-title").textContent = `${name} ${i + 1}`; });
    if (!sec.querySelector(".wd-panel")) sec.querySelector(".wd-add").textContent = "Add";
  }

  renderProgress();
  renderFooter();
  stepHost.appendChild(pages[0]);
})();
