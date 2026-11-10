package com.dossier.api.service.privacy;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The never-collected values detector (CLAUDE.md hard rule, DESIGN section 16, T1.1 seam): finds
 * the shapes of an SSN/ITIN, a bank routing / account number or IBAN, a tax id (EIN/VAT),
 * a passport, a visa / I-9 / permit / licence document number and a date of birth in free text, so
 * that every path that accepts text (profile items, resume documents, imports, pastes, uploads)
 * can refuse or strip them before anything is stored, learned, synced or sent to an AI.
 *
 * <p>The library is pure (no I/O, no state) and has a byte-for-byte twin in
 * {@code packages/ui/src/sensitive-patterns.ts}. Both run the same fixture corpus
 * ({@code src/test/resources/sensitive-patterns/corpus.json}); change a rule in one, change the other
 * and the corpus. Patterns avoid every construct whose meaning differs between Java and
 * JavaScript ({@code \b}, {@code \s}, {@code \w}, Unicode case folding): boundaries are explicit
 * lookarounds over ASCII alphanumerics and whitespace is {@code [ \t]}.
 *
 * <p>Two kinds of rule, chosen to keep ordinary resumes (phone numbers, years, ZIP+4, version
 * numbers) out of the net:
 * <ul>
 *   <li><b>Shape-only</b> rules for values that are unmistakable on their own: a dashed
 *       {@code 123-45-6789}, a hyphenated EIN with a valid IRS prefix, an IBAN whose mod-97
 *       check digits are right, a few EU VAT shapes.</li>
 *   <li><b>Label-gated</b> rules for values that are only digits ("Routing number: 021000021",
 *       "Passport no. X1234567", "DOB: 1990-05-12"): the label must immediately precede the value.</li>
 * </ul>
 * A {@link Hit} covers the <em>value</em> only, never its label, so {@link #redact} leaves
 * "Passport number: [removed]" readable. Hits never overlap; the earliest, then longest, wins.
 *
 * <p>Classes are the stable codes {@link #SSN_ITIN}, {@link #ROUTING}, {@link #IBAN},
 * {@link #ACCOUNT_NUMBER}, {@link #TAX_ID}, {@link #PASSPORT}, {@link #VISA_DOC}, {@link #DOB}.
 */
public final class SensitivePatterns {

    public static final String SSN_ITIN = "SSN_ITIN";
    public static final String ROUTING = "ROUTING";
    public static final String IBAN = "IBAN";
    public static final String ACCOUNT_NUMBER = "ACCOUNT_NUMBER";
    public static final String TAX_ID = "TAX_ID";
    public static final String PASSPORT = "PASSPORT";
    public static final String VISA_DOC = "VISA_DOC";
    public static final String DOB = "DOB";

    /** What {@link #redact} puts where a value was. */
    public static final String REDACTED = "[removed]";

    /** One finding: the class and the {@code [start, end)} UTF-16 range of the value. */
    public record Hit(String cls, int start, int end) {}

    private SensitivePatterns() {}

    // ---- shared fragments (twin of sensitive-patterns.ts: keep identical) ---------------------

    private static final String LB = "(?<![A-Za-z0-9])";
    private static final String RB = "(?![A-Za-z0-9])";
    private static final String SEP0 = "[ \\t:#.=\\-\\u2013]*";
    private static final String NUMTAIL = "(?:[ \\t_\\-]*(?:number|num|no|nr|id|#))*\\.?";
    private static final String NUMTAIL_REQUIRED = "[ \\t_\\-]*(?:number|num|no|nr|#)(?:[ \\t_\\-]*(?:number|num|no|nr|id|#))*\\.?";
    private static final String MONTH =
        "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
    private static final String DATE =
        "(?:[0-9]{4}[-/.][0-9]{2}[-/.][0-9]{2}" +
        "|[0-9]{1,2}[-/.][0-9]{1,2}[-/.](?:[0-9]{4}|[0-9]{2})" +
        "|" + MONTH + "\\.?[ \\t]+(?:[0-9]{1,2}(?:st|nd|rd|th)?,?[ \\t]+)?[0-9]{4}" +
        "|[0-9]{1,2}(?:st|nd|rd|th)?[ \\t]+(?:of[ \\t]+)?" + MONTH + "\\.?,?[ \\t]+[0-9]{4})";
    private static final String DOC_VALUE = "((?=[A-Z0-9-]*[0-9])[A-Z0-9][A-Z0-9-]{5,13})" + RB;
    private static final String ACCOUNT_VALUE = "([0-9](?:[ \\t-]?[0-9]){5,16})(?![0-9])";

    /** A rule: its class and a pattern whose group 1 is the value. */
    private record Rule(String cls, Pattern pattern) {}

    private static Rule rule(String cls, String regex, boolean ignoreCase) {
        return new Rule(cls, ignoreCase ? Pattern.compile(regex, Pattern.CASE_INSENSITIVE) : Pattern.compile(regex));
    }

    private static final List<Rule> RULES = List.of(
        // SSN / ITIN: dashed 3-2-4 with non-zero blocks (an ITIN is the same shape, area 9xx) ...
        rule(SSN_ITIN, "(?<![0-9-])((?!000|666)[0-9]{3}-(?!00)[0-9]{2}-(?!0000)[0-9]{4})(?![0-9-])", false),
        // ... or any 9 digits right after its label.
        rule(
            SSN_ITIN,
            LB + "(?:ssn|ss#|itin|social[ \\t]+security(?:[ \\t]+(?:number|num|no|nr))?\\.?)" + SEP0 + "([0-9]{3}[ \\t-]?[0-9]{2}[ \\t-]?[0-9]{4})(?![0-9])",
            true
        ),
        // ABA routing number: 9 digits after its label.
        rule(
            ROUTING,
            LB + "(?:aba|rtn|routing|transit)(?:[ \\t_\\-/]*(?:routing|transit|rtn|number|num|no|nr|id|#))*\\.?" + SEP0 + "([0-9]{9})(?![0-9])",
            true
        ),
        // Bank account number: "bank/checking/savings account ..." or "account number ...".
        rule(
            ACCOUNT_NUMBER,
            LB + "(?:bank|checking|savings|saving|deposit|current)[ \\t_\\-]*(?:account|acct|a/c)" + NUMTAIL + SEP0 + ACCOUNT_VALUE,
            true
        ),
        rule(ACCOUNT_NUMBER, LB + "(?:account|acct|a/c)" + NUMTAIL_REQUIRED + SEP0 + ACCOUNT_VALUE, true),
        // US EIN with a valid IRS prefix, unlabeled ...
        rule(
            TAX_ID,
            "(?<![0-9-])((?:0[1-6]|1[0-6]|2[0-7]|3[0-9]|4[0-8]|5[0-9]|6[0-8]|7[1-7]|8[0-8]|9[0-5]|9[89])-[0-9]{7})(?![0-9-])",
            false
        ),
        // ... a handful of unmistakable EU VAT shapes, unlabeled ...
        rule(
            TAX_ID,
            LB +
            "((?:ATU[0-9]{8}|BE0[0-9]{9}|DE[0-9]{9}|DK[0-9]{8}|ES[A-Z0-9][0-9]{7}[A-Z0-9]|FR[A-Z0-9]{2}[0-9]{9}|GB[0-9]{9}(?:[0-9]{3})?|IT[0-9]{11}|NL[0-9]{9}B[0-9]{2}|PL[0-9]{10}|PT[0-9]{9}|SE[0-9]{12}))" +
            RB,
            false
        ),
        // ... and any tax id after its label (EIN, TIN, VAT, GST, ABN, ...).
        rule(
            TAX_ID,
            LB +
            "(?:ein|fein|tin|tax[ \\t_\\-]*id(?:entification)?|taxpayer[ \\t_\\-]*(?:id(?:entification)?)?|federal[ \\t]+(?:tax[ \\t]+)?id|tax[ \\t]+(?:number|no)|vat|gst|abn|tva|cnpj|cpf|nif)" +
            "(?:[ \\t_\\-]*(?:number|num|no|nr|id|#|reg(?:istration)?))*\\.?" +
            SEP0 +
            "((?!(?:19|20)[0-9]{2}-(?:19|20)[0-9]{2}(?![0-9]))(?=(?:[A-Z.\\-]*[0-9]){8})[A-Z]{0,3}[0-9][0-9A-Z.\\-]{5,16}[0-9A-Z])",
            true
        ),
        // Passport number: 6-9 letters/digits with at least one digit, after "passport".
        rule(
            PASSPORT,
            LB + "passport" + NUMTAIL + SEP0 + "((?=[A-Z0-9]*[0-9])[A-Z0-9]{6,9})" + RB,
            true
        ),
        // Visa / permit / national id / document numbers: these labels need a "number" word ...
        rule(
            VISA_DOC,
            LB +
            "(?:visa|document|permit|work[ \\t]+permit|residence[ \\t]+(?:permit|card)|national[ \\t]+id|id[ \\t]+card)" +
            NUMTAIL_REQUIRED +
            SEP0 +
            DOC_VALUE,
            true
        ),
        // ... these are unambiguous on their own (I-9, I-94, EAD, A-number, USCIS, green card, licence).
        rule(
            VISA_DOC,
            LB +
            "(?:i-?9|i-?94|ead|alien[ \\t]+(?:registration|number)|uscis|a-?number|green[ \\t]+card|driver['\\u2019]?s?[ \\t]+licen[cs]e|driving[ \\t]+licen[cs]e)" +
            "(?:[ \\t_\\-]*(?:number|num|no|nr|id|#|card|document))*\\.?" +
            SEP0 +
            DOC_VALUE,
            true
        ),
        // Date of birth: a full date, or month + year, after a birth label ...
        rule(
            DOB,
            LB +
            "(?:date[ \\t_\\-]*of[ \\t_\\-]*birth|birth[ \\t_\\-]*date|birthday|b-?day|d\\.?o\\.?b\\.?|born(?:[ \\t]+(?:on|in))?)" +
            SEP0 +
            "(" + DATE + ")(?![0-9])",
            true
        ),
        // ... or a bare year after an explicit birth-date label.
        rule(
            DOB,
            LB +
            "(?:date[ \\t_\\-]*of[ \\t_\\-]*birth|year[ \\t_\\-]*of[ \\t_\\-]*birth|birth[ \\t_\\-]*year|dob)" +
            SEP0 +
            "((?:19|20)[0-9]{2})(?![0-9/\\-])",
            true
        )
    );

    private static final Pattern IBAN_CANDIDATE = Pattern.compile(
        "(?<![A-Za-z0-9])([A-Z]{2}[0-9]{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?)(?![A-Za-z0-9])"
    );

    // ---- API ----------------------------------------------------------------------------------

    /** Every sensitive value in {@code text}, ordered by position, never overlapping. Empty for null/blank. */
    public static List<Hit> scan(String text) {
        if (text == null || text.isBlank()) return List.of();
        List<Hit> all = new ArrayList<>();
        for (Rule r : RULES) {
            Matcher m = r.pattern().matcher(text);
            while (m.find()) {
                if (m.start(1) < m.end(1)) all.add(new Hit(r.cls(), m.start(1), m.end(1)));
            }
        }
        Matcher ib = IBAN_CANDIDATE.matcher(text);
        int from = 0;
        while (from <= text.length() && ib.find(from)) {
            if (validIban(ib.group(1))) {
                all.add(new Hit(IBAN, ib.start(1), ib.end(1)));
                from = ib.end(1);
            } else {
                from = ib.start(1) + 1;
            }
        }
        all.sort((a, b) -> a.start() != b.start() ? Integer.compare(a.start(), b.start()) : Integer.compare(b.end(), a.end()));
        List<Hit> kept = new ArrayList<>();
        int lastEnd = 0;
        for (Hit h : all) {
            if (h.start() >= lastEnd) {
                kept.add(h);
                lastEnd = h.end();
            }
        }
        return List.copyOf(kept);
    }

    /**
     * Like {@link #scan} for a value that sits under a JSON key / form-field name: the key is
     * read as the value's label ("passportNumber" + "X1234567" is a passport number). Hit offsets
     * are relative to {@code value}.
     */
    public static List<Hit> scanField(String key, String value) {
        if (value == null || value.isBlank()) return List.of();
        String label = key == null ? "" : labelOf(key);
        if (label.isEmpty()) return scan(value);
        String prefix = label + ": ";
        List<Hit> out = new ArrayList<>();
        for (Hit h : scan(prefix + value)) {
            if (h.start() >= prefix.length()) out.add(new Hit(h.cls(), h.start() - prefix.length(), h.end() - prefix.length()));
        }
        return List.copyOf(out);
    }

    /** {@code text} with every sensitive value replaced by {@link #REDACTED}; the labels stay. */
    public static String redact(String text) {
        List<Hit> hits = scan(text);
        return hits.isEmpty() ? text : replace(text, hits);
    }

    /** As {@link #redact} but for a value under a key (see {@link #scanField}). */
    public static String redactField(String key, String value) {
        List<Hit> hits = scanField(key, value);
        return hits.isEmpty() ? value : replace(value, hits);
    }

    private static String replace(String text, List<Hit> hits) {
        StringBuilder sb = new StringBuilder();
        int pos = 0;
        for (Hit h : hits) {
            sb.append(text, pos, h.start()).append(REDACTED);
            pos = h.end();
        }
        return sb.append(text, pos, text.length()).toString();
    }

    /** A JSON key as words: "bankRoutingNumber" and "bank_routing_number" both read "bank Routing Number". */
    static String labelOf(String key) {
        StringBuilder sb = new StringBuilder();
        char prev = 0;
        for (int i = 0; i < key.length(); i++) {
            char c = key.charAt(i);
            boolean prevLower = prev >= 'a' && prev <= 'z';
            if (c >= 'A' && c <= 'Z' && (prevLower || (prev >= '0' && prev <= '9'))) sb.append(' ');
            sb.append(c == '_' || c == '-' ? ' ' : c);
            prev = c;
        }
        return sb.toString().trim();
    }

    /** ISO 13616: 15-34 characters and the rearranged number is 1 modulo 97. */
    static boolean validIban(String candidate) {
        String s = candidate.replace(" ", "");
        if (s.length() < 15 || s.length() > 34) return false;
        String rearranged = s.substring(4) + s.substring(0, 4);
        StringBuilder digits = new StringBuilder();
        for (int i = 0; i < rearranged.length(); i++) {
            char c = rearranged.charAt(i);
            if (c >= '0' && c <= '9') digits.append(c);
            else if (c >= 'A' && c <= 'Z') digits.append(c - 'A' + 10);
            else return false;
        }
        return new BigInteger(digits.toString()).mod(BigInteger.valueOf(97)).intValue() == 1;
    }
}
