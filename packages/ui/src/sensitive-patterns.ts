/**
 * The never-collected values detector (CLAUDE.md hard rule, Resume Builder DESIGN section 16, T1.1
 * seam): finds the shapes of an SSN/ITIN, a bank routing / account number or IBAN, a tax id
 * (EIN/VAT), a passport, a visa / I-9 / permit / licence document number and a date of birth in free
 * text, so every path that accepts text can refuse or strip them before anything is stored.
 *
 * This file is the byte-for-byte twin of `api/.../service/privacy/SensitivePatterns.java`; both run
 * the same fixture corpus (`__fixtures__/sensitive-patterns-corpus.json`, copied from
 * `api/src/test/resources/sensitive-patterns/corpus.json`). Change a rule in one, change the other
 * and the corpus. Patterns avoid every construct whose meaning differs between Java and JavaScript
 * (`\b`, `\s`, `\w`, Unicode case folding): boundaries are explicit ASCII lookarounds and
 * whitespace is `[ \t]`.
 *
 * Shape-only rules catch values that are unmistakable on their own (dashed 123-45-6789, an EIN with
 * a valid IRS prefix, an IBAN whose mod-97 check digits are right); label-gated rules catch values
 * that are only digits ("Routing number: 021000021") and need the label right before them. A hit
 * covers the VALUE only, never its label, so `redact` leaves "Passport number: [removed]" readable.
 */

export type SensitiveClass =
  | "SSN_ITIN"
  | "ROUTING"
  | "IBAN"
  | "ACCOUNT_NUMBER"
  | "TAX_ID"
  | "PASSPORT"
  | "VISA_DOC"
  | "DOB";

/** One finding: the class and the `[start, end)` UTF-16 range of the value. */
export interface Hit {
  cls: SensitiveClass;
  start: number;
  end: number;
}

/** What `redact` puts where a value was. */
export const REDACTED = "[removed]";

/** Plain-language name of a class, for messages ("We never store <label>"). */
export const SENSITIVE_LABELS: Record<SensitiveClass, string> = {
  SSN_ITIN: "a Social Security or tax identification number",
  ROUTING: "a bank routing number",
  IBAN: "an IBAN",
  ACCOUNT_NUMBER: "a bank account number",
  TAX_ID: "a tax id (EIN or VAT number)",
  PASSPORT: "a passport number",
  VISA_DOC: "a visa, permit or identity document number",
  DOB: "a date of birth",
};

// ---- shared fragments (twin of SensitivePatterns.java: keep identical) ----------------------

const LB = String.raw`(?<![A-Za-z0-9])`;
const RB = String.raw`(?![A-Za-z0-9])`;
const SEP0 = String.raw`[ \t:#.=\-–]*`;
const NUMTAIL = String.raw`(?:[ \t_\-]*(?:number|num|no|nr|id|#))*\.?`;
const NUMTAIL_REQUIRED = String.raw`[ \t_\-]*(?:number|num|no|nr|#)(?:[ \t_\-]*(?:number|num|no|nr|id|#))*\.?`;
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE =
  String.raw`(?:[0-9]{4}[-/.][0-9]{2}[-/.][0-9]{2}` +
  String.raw`|[0-9]{1,2}[-/.][0-9]{1,2}[-/.](?:[0-9]{4}|[0-9]{2})` +
  "|" + MONTH + String.raw`\.?[ \t]+(?:[0-9]{1,2}(?:st|nd|rd|th)?,?[ \t]+)?[0-9]{4}` +
  String.raw`|[0-9]{1,2}(?:st|nd|rd|th)?[ \t]+(?:of[ \t]+)?` + MONTH + String.raw`\.?,?[ \t]+[0-9]{4})`;
const DOC_VALUE = "((?=[A-Z0-9-]*[0-9])[A-Z0-9][A-Z0-9-]{5,13})" + RB;
const ACCOUNT_VALUE = String.raw`([0-9](?:[ \t-]?[0-9]){5,16})(?![0-9])`;

interface Rule {
  cls: SensitiveClass;
  re: RegExp;
}

function rule(cls: SensitiveClass, source: string, ignoreCase: boolean): Rule {
  return { cls, re: new RegExp(source, ignoreCase ? "gi" : "g") };
}

const RULES: Rule[] = [
  // SSN / ITIN: dashed 3-2-4 with non-zero blocks (an ITIN is the same shape, area 9xx) ...
  rule("SSN_ITIN", String.raw`(?<![0-9-])((?!000|666)[0-9]{3}-(?!00)[0-9]{2}-(?!0000)[0-9]{4})(?![0-9-])`, false),
  // ... or any 9 digits right after its label.
  rule(
    "SSN_ITIN",
    LB +
      String.raw`(?:ssn|ss#|itin|social[ \t]+security(?:[ \t]+(?:number|num|no|nr))?\.?)` +
      SEP0 +
      String.raw`([0-9]{3}[ \t-]?[0-9]{2}[ \t-]?[0-9]{4})(?![0-9])`,
    true,
  ),
  // ABA routing number: 9 digits after its label.
  rule(
    "ROUTING",
    LB +
      String.raw`(?:aba|rtn|routing|transit)(?:[ \t_\-/]*(?:routing|transit|rtn|number|num|no|nr|id|#))*\.?` +
      SEP0 +
      String.raw`([0-9]{9})(?![0-9])`,
    true,
  ),
  // Bank account number: "bank/checking/savings account ..." or "account number ...".
  rule(
    "ACCOUNT_NUMBER",
    LB + String.raw`(?:bank|checking|savings|saving|deposit|current)[ \t_\-]*(?:account|acct|a/c)` + NUMTAIL + SEP0 + ACCOUNT_VALUE,
    true,
  ),
  rule("ACCOUNT_NUMBER", LB + String.raw`(?:account|acct|a/c)` + NUMTAIL_REQUIRED + SEP0 + ACCOUNT_VALUE, true),
  // US EIN with a valid IRS prefix, unlabeled ...
  rule(
    "TAX_ID",
    String.raw`(?<![0-9-])((?:0[1-6]|1[0-6]|2[0-7]|3[0-9]|4[0-8]|5[0-9]|6[0-8]|7[1-7]|8[0-8]|9[0-5]|9[89])-[0-9]{7})(?![0-9-])`,
    false,
  ),
  // ... a handful of unmistakable EU VAT shapes, unlabeled ...
  rule(
    "TAX_ID",
    LB +
      "((?:ATU[0-9]{8}|BE0[0-9]{9}|DE[0-9]{9}|DK[0-9]{8}|ES[A-Z0-9][0-9]{7}[A-Z0-9]|FR[A-Z0-9]{2}[0-9]{9}|GB[0-9]{9}(?:[0-9]{3})?|IT[0-9]{11}|NL[0-9]{9}B[0-9]{2}|PL[0-9]{10}|PT[0-9]{9}|SE[0-9]{12}))" +
      RB,
    false,
  ),
  // ... and any tax id after its label (EIN, TIN, VAT, GST, ABN, ...).
  rule(
    "TAX_ID",
    LB +
      String.raw`(?:ein|fein|tin|tax[ \t_\-]*id(?:entification)?|taxpayer[ \t_\-]*(?:id(?:entification)?)?|federal[ \t]+(?:tax[ \t]+)?id|tax[ \t]+(?:number|no)|vat|gst|abn|tva|cnpj|cpf|nif)` +
      String.raw`(?:[ \t_\-]*(?:number|num|no|nr|id|#|reg(?:istration)?))*\.?` +
      SEP0 +
      String.raw`((?!(?:19|20)[0-9]{2}-(?:19|20)[0-9]{2}(?![0-9]))(?=(?:[A-Z.\-]*[0-9]){8})[A-Z]{0,3}[0-9][0-9A-Z.\-]{5,16}[0-9A-Z])`,
    true,
  ),
  // Passport number: 6-9 letters/digits with at least one digit, after "passport".
  rule("PASSPORT", LB + "passport" + NUMTAIL + SEP0 + "((?=[A-Z0-9]*[0-9])[A-Z0-9]{6,9})" + RB, true),
  // Visa / permit / national id / document numbers: these labels need a "number" word ...
  rule(
    "VISA_DOC",
    LB +
      String.raw`(?:visa|document|permit|work[ \t]+permit|residence[ \t]+(?:permit|card)|national[ \t]+id|id[ \t]+card)` +
      NUMTAIL_REQUIRED +
      SEP0 +
      DOC_VALUE,
    true,
  ),
  // ... these are unambiguous on their own (I-9, I-94, EAD, A-number, USCIS, green card, licence).
  rule(
    "VISA_DOC",
    LB +
      String.raw`(?:i-?9|i-?94|ead|alien[ \t]+(?:registration|number)|uscis|a-?number|green[ \t]+card|driver['’]?s?[ \t]+licen[cs]e|driving[ \t]+licen[cs]e)` +
      String.raw`(?:[ \t_\-]*(?:number|num|no|nr|id|#|card|document))*\.?` +
      SEP0 +
      DOC_VALUE,
    true,
  ),
  // Date of birth: a full date, or month + year, after a birth label ...
  rule(
    "DOB",
    LB +
      String.raw`(?:date[ \t_\-]*of[ \t_\-]*birth|birth[ \t_\-]*date|birthday|b-?day|d\.?o\.?b\.?|born(?:[ \t]+(?:on|in))?)` +
      SEP0 +
      "(" + DATE + ")(?![0-9])",
    true,
  ),
  // ... or a bare year after an explicit birth-date label.
  rule(
    "DOB",
    LB +
      String.raw`(?:date[ \t_\-]*of[ \t_\-]*birth|year[ \t_\-]*of[ \t_\-]*birth|birth[ \t_\-]*year|dob)` +
      SEP0 +
      String.raw`((?:19|20)[0-9]{2})(?![0-9/\-])`,
    true,
  ),
];

const IBAN_CANDIDATE = String.raw`(?<![A-Za-z0-9])([A-Z]{2}[0-9]{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?)(?![A-Za-z0-9])`;

// ---- API ------------------------------------------------------------------------------------

/** Every sensitive value in `text`, ordered by position, never overlapping. Empty for null/blank. */
export function scan(text: string | null | undefined): Hit[] {
  if (text == null || text.trim() === "") return [];
  const all: Hit[] = [];
  for (const r of RULES) {
    const re = new RegExp(r.re.source, r.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === "") {
        re.lastIndex++;
        continue;
      }
      const value = m[1];
      if (value === undefined || value === "") continue;
      // m.index + offset of group 1: every rule puts the value last, after its label, so it ends at m.index + m[0].length
      const end = m.index + m[0].length;
      all.push({ cls: r.cls, start: end - value.length, end });
    }
  }
  const ib = new RegExp(IBAN_CANDIDATE, "g");
  let from = 0;
  while (from <= text.length) {
    ib.lastIndex = from;
    const m = ib.exec(text);
    if (m === null) break;
    const value = m[1];
    const end = m.index + m[0].length;
    const start = end - value.length;
    if (validIban(value)) {
      all.push({ cls: "IBAN", start, end });
      from = end;
    } else {
      from = start + 1;
    }
  }
  all.sort((a, b) => (a.start !== b.start ? a.start - b.start : b.end - a.end));
  const kept: Hit[] = [];
  let lastEnd = 0;
  for (const h of all) {
    if (h.start >= lastEnd) {
      kept.push(h);
      lastEnd = h.end;
    }
  }
  return kept;
}

/**
 * Like `scan` for a value that sits under a JSON key / form-field name: the key is read as the
 * value's label ("passportNumber" + "X1234567" is a passport number). Offsets are relative to `value`.
 */
export function scanField(key: string | null | undefined, value: string | null | undefined): Hit[] {
  if (value == null || value.trim() === "") return [];
  const label = key == null ? "" : labelOf(key);
  if (label === "") return scan(value);
  const prefix = label + ": ";
  return scan(prefix + value)
    .filter((h) => h.start >= prefix.length)
    .map((h) => ({ cls: h.cls, start: h.start - prefix.length, end: h.end - prefix.length }));
}

/** `text` with every sensitive value replaced by `[removed]`; the labels stay. */
export function redact(text: string): string {
  const hits = scan(text);
  return hits.length === 0 ? text : replaceHits(text, hits);
}

/** As `redact` but for a value under a key (see `scanField`). */
export function redactField(key: string | null | undefined, value: string): string {
  const hits = scanField(key, value);
  return hits.length === 0 ? value : replaceHits(value, hits);
}

function replaceHits(text: string, hits: Hit[]): string {
  let out = "";
  let pos = 0;
  for (const h of hits) {
    out += text.slice(pos, h.start) + REDACTED;
    pos = h.end;
  }
  return out + text.slice(pos);
}

/** A JSON key as words: "bankRoutingNumber" and "bank_routing_number" both read "bank Routing Number". */
export function labelOf(key: string): string {
  let out = "";
  let prev = "";
  for (const c of key) {
    const prevLower = prev >= "a" && prev <= "z";
    const prevDigit = prev >= "0" && prev <= "9";
    if (c >= "A" && c <= "Z" && (prevLower || prevDigit)) out += " ";
    out += c === "_" || c === "-" ? " " : c;
    prev = c;
  }
  return out.trim();
}

/** ISO 13616: 15-34 characters and the rearranged number is 1 modulo 97. */
export function validIban(candidate: string): boolean {
  const s = candidate.replace(/ /g, "");
  if (s.length < 15 || s.length > 34) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const c of rearranged) {
    if (c >= "0" && c <= "9") rem = (rem * 10 + (c.charCodeAt(0) - 48)) % 97;
    else if (c >= "A" && c <= "Z") rem = (rem * 100 + (c.charCodeAt(0) - 55)) % 97;
    else return false;
  }
  return rem === 1;
}
