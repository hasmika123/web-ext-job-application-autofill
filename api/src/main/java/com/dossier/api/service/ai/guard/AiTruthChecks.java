package com.dossier.api.service.ai.guard;

import com.dossier.api.service.privacy.SensitivePatterns;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The truth checks every AI-written resume text passes before anyone sees it (guardrails doc, I3.2 shape;
 * Resume Builder DESIGN 13.1). A pure library: {@link #check} returns the {@link Violation}s of one output
 * text, and the caller decides whether to drop the change (tailor, rewrite, summary) or flag it ({@link #flag},
 * cover letters). Extracted from {@code ResumeTailorService.acceptable/numbers}; the tailor rules are the
 * {@link Profile#TAILOR} profile, unchanged.
 *
 * <p>What is checked, per {@link Profile}:
 * <ul>
 *   <li><b>numbers</b> - every number in the output exists in {@link Sources#numbers()}, normalised ({@code 1,200}
 *       = {@code 1200}, {@code 1.2k} = {@code 1200}, {@code 12 %} = {@code 12}); the literal
 *       {@value #PLACEHOLDER} is the one allowed "number" a profile permits, and only that many times;</li>
 *   <li><b>dates</b> - a month and year ({@code March 2020}, {@code 2020-03}) must be one the source has;</li>
 *   <li><b>entities</b> - a capitalised name (employer, school, tool) must be in the source text or an
 *       alias of a term in it ({@code tool-aliases.txt}: Postgres = PostgreSQL), or within Jaro-Winkler 0.92 of one;
 *       a curated tool list is never a licence to add a skill the person does not have;</li>
 *   <li><b>relations</b> - no hiring-company name in a line that did not have it, no promises ("guaranteed
 *       interview"), no age, religion, disability or marital claim the source does not make;</li>
 *   <li><b>length</b> and <b>unchanged</b> - a rewrite must say something different and fit its cap;</li>
 *   <li><b>sensitive</b> - nothing {@link SensitivePatterns} recognises (an SSN, a bank number ...) may come out.</li>
 * </ul>
 */
public final class AiTruthChecks {

    /** The one stand-in a rewrite may use when a stronger line would need a number the original lacks. */
    public static final String PLACEHOLDER = "[add a number]";

    /** What {@link #flag} inserts after a sentence that failed a check. */
    public static final String CHECK_MARK = "[check]";

    /** The longest {@code reason} a change may carry (DESIGN 13.1). */
    public static final int REASON_MAX_CHARS = 160;

    public enum Kind {
        EMPTY,
        NUMBER,
        DATE,
        ENTITY,
        RELATION,
        LENGTH,
        UNCHANGED,
        PLACEHOLDER,
        SENSITIVE,
        URL,
        /** The output repeats an instruction-shaped phrase the source never had: an injection that got through. */
        INSTRUCTION,
    }

    /**
     * What a task is held to. {@code placeholders}: how many {@value #PLACEHOLDER} the output may contain;
     * {@code growthCap}: the tailor rule that a line may not more than double (plus 60 characters, 160 at least);
     * {@code defaultMax}: the hard length cap when {@link Sources#maxChars()} is 0 (0 = none).
     */
    public enum Profile {
        /** One rewritten line or one alternative of it (DESIGN 13.2). */
        REWRITE(1, true, true, true, false, true, 600),
        /** A generated summary: numbers must exist in the document, no new organisations. */
        SUMMARY(0, true, true, true, false, false, 2000),
        /** Tailoring (13.4), behaviour-identical to the checks it was extracted with: numbers, hiring company, size, difference. */
        TAILOR(0, false, false, true, true, true, 0),
        /** A cover letter, checked per sentence; the caller flags rather than drops (apply refuses while a flag remains). */
        COVER(0, true, true, true, false, false, 4000),
        /** A translation: numbers and dates preserved; entity back-checks wait for the cosine check (I9.5). */
        TRANSLATE(0, false, true, true, false, false, 0);

        final int placeholders;
        final boolean entities;
        final boolean dates;
        final boolean relations;
        final boolean growthCap;
        final boolean mustDiffer;
        final int defaultMax;

        Profile(int placeholders, boolean entities, boolean dates, boolean relations, boolean growthCap, boolean mustDiffer, int defaultMax) {
            this.placeholders = placeholders;
            this.entities = entities;
            this.dates = dates;
            this.relations = relations;
            this.growthCap = growthCap;
            this.mustDiffer = mustDiffer;
            this.defaultMax = defaultMax;
        }
    }

    /** One finding: what failed, the offending token and the 0-based sentence of the output it is in. */
    public record Violation(Kind kind, String token, int sentence) {}

    /**
     * What an output is checked against, built once per request. {@code numbers}, {@code dates} and
     * {@code entityDictionary} default to what {@code sourceText} contains; a caller narrows or widens them
     * ({@link #withNumbers}: a rewritten line may only reuse the numbers of the line it replaces).
     *
     * @param sourceText     the plain text the output may draw on (the document's visible content, plus a JD where one is used)
     * @param entityDictionary lower-case words the source contains
     * @param numbers        normalised numbers the output may contain
     * @param dates          {@code yyyy-mm} months the output may name
     * @param before         the text this output replaces, or null (for the "must differ" and company checks)
     * @param hiringCompany  the company being applied to, or null
     * @param maxChars       hard length cap, 0 = the profile's default
     */
    public record Sources(String sourceText, Set<String> entityDictionary, Set<String> numbers, Set<String> dates, String before, String hiringCompany, int maxChars) {
        public Sources {
            sourceText = sourceText == null ? "" : sourceText;
            entityDictionary = entityDictionary == null ? Set.of() : entityDictionary;
            numbers = numbers == null ? Set.of() : numbers;
            dates = dates == null ? Set.of() : dates;
        }

        public Sources(String sourceText, Set<String> entityDictionary, Set<String> numbers, Set<String> dates) {
            this(sourceText, entityDictionary, numbers, dates, null, null, 0);
        }

        /** Sources derived entirely from {@code text}. */
        public static Sources of(String text) {
            String t = text == null ? "" : text;
            return new Sources(t, words(t), AiTruthChecks.numbers(t), AiTruthChecks.dates(t));
        }

        /** Also allow whatever {@code extra} (a job description) contains as entity names. */
        public Sources withExtraEntities(String extra) {
            Set<String> d = new LinkedHashSet<>(entityDictionary);
            d.addAll(words(extra));
            return new Sources(sourceText, d, numbers, dates, before, hiringCompany, maxChars);
        }

        public Sources withNumbers(Set<String> allowed) {
            return new Sources(sourceText, entityDictionary, allowed, dates, before, hiringCompany, maxChars);
        }

        public Sources withBefore(String text) {
            return new Sources(sourceText, entityDictionary, numbers, dates, text, hiringCompany, maxChars);
        }

        public Sources withHiringCompany(String company) {
            return new Sources(sourceText, entityDictionary, numbers, dates, before, company, maxChars);
        }

        public Sources withMaxChars(int max) {
            return new Sources(sourceText, entityDictionary, numbers, dates, before, hiringCompany, max);
        }
    }

    private AiTruthChecks() {}

    // ---- check ---------------------------------------------------------------------------------

    /** All violations of {@code output} against {@code sources} under {@code profile}; empty when it is safe to show. */
    public static List<Violation> check(String output, Sources sources, Profile profile) {
        List<Violation> v = new ArrayList<>();
        if (output == null || output.isBlank()) {
            v.add(new Violation(Kind.EMPTY, "", 0));
            return v;
        }
        String before = sources.before();
        if (profile.mustDiffer && before != null && output.trim().equalsIgnoreCase(before.trim())) {
            v.add(new Violation(Kind.UNCHANGED, "", 0));
        }
        int max = sources.maxChars() > 0 ? sources.maxChars() : profile.defaultMax;
        if (max > 0 && output.length() > max) v.add(new Violation(Kind.LENGTH, String.valueOf(output.length()), 0));
        if (profile.growthCap && before != null && output.length() > Math.max(before.length() * 2 + 60, 160)) {
            v.add(new Violation(Kind.LENGTH, "growth", 0));
        }
        int placeholders = count(output, PLACEHOLDER);
        if (placeholders > profile.placeholders) v.add(new Violation(Kind.PLACEHOLDER, PLACEHOLDER, 0));

        List<String> sentences = sentences(output);
        for (int i = 0; i < sentences.size(); i++) {
            String s = sentences.get(i);
            String plain = s.replace(PLACEHOLDER, " ");
            for (String n : numbers(plain)) {
                if (!sources.numbers().contains(n)) v.add(new Violation(Kind.NUMBER, n, i));
            }
            if (profile.dates) {
                for (String d : dates(plain)) {
                    if (!sources.dates().contains(d)) v.add(new Violation(Kind.DATE, d, i));
                }
            }
            if (profile.entities) {
                for (String e : unknownEntities(s, sources)) v.add(new Violation(Kind.ENTITY, e, i));
            }
            if (profile.relations) {
                relations(s, i, sources, v);
            }
            for (SensitivePatterns.Hit hit : SensitivePatterns.scan(s)) v.add(new Violation(Kind.SENSITIVE, hit.cls(), i));
            Matcher echo = INSTRUCTION_ECHO.matcher(s);
            if (echo.find() && !INSTRUCTION_ECHO.matcher(sources.sourceText()).find()) {
                v.add(new Violation(Kind.INSTRUCTION, echo.group().toLowerCase(Locale.ROOT), i));
            }
        }
        return v;
    }

    /** Violations of a change's one-line explanation: over {@value #REASON_MAX_CHARS} characters, or a URL / e-mail in it. */
    public static List<Violation> checkReason(String reason) {
        List<Violation> v = new ArrayList<>();
        String r = reason == null ? "" : reason;
        if (r.length() > REASON_MAX_CHARS) v.add(new Violation(Kind.LENGTH, "reason", 0));
        if (URL.matcher(r).find()) v.add(new Violation(Kind.URL, "reason", 0));
        return v;
    }

    /** {@code output} with {@value #CHECK_MARK} after every sentence a violation points at (the cover-letter way of showing a problem). */
    public static String flag(String output, List<Violation> violations) {
        if (output == null || violations == null || violations.isEmpty()) return output;
        Set<Integer> bad = new LinkedHashSet<>();
        for (Violation v : violations) bad.add(v.sentence());
        List<String> sentences = sentences(output);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < sentences.size(); i++) {
            if (i > 0) sb.append(' ');
            sb.append(sentences.get(i));
            if (bad.contains(i) && !sentences.get(i).endsWith(CHECK_MARK)) sb.append(' ').append(CHECK_MARK);
        }
        return sb.toString();
    }

    // ---- numbers and dates ----------------------------------------------------------------------

    private static final Pattern NUMBER = Pattern.compile("(\\d+(?:[.,]\\d+)*)([kKmMbB](?![A-Za-z0-9]))?");

    /** Numbers in a text, normalised: "1,200" = "1200" = "1.2k", "05" = "5", "12 %" = "12". */
    public static Set<String> numbers(String text) {
        Set<String> out = new LinkedHashSet<>();
        Matcher m = NUMBER.matcher(text == null ? "" : text);
        while (m.find()) {
            String digits = m.group(1).replace(",", "");
            try {
                BigDecimal n = new BigDecimal(digits);
                if (m.group(2) != null) {
                    n = n.multiply(switch (Character.toLowerCase(m.group(2).charAt(0))) {
                        case 'k' -> BigDecimal.valueOf(1_000L);
                        case 'm' -> BigDecimal.valueOf(1_000_000L);
                        default -> BigDecimal.valueOf(1_000_000_000L);
                    });
                }
                out.add(n.signum() == 0 ? "0" : n.stripTrailingZeros().toPlainString());
            } catch (NumberFormatException e) {
                out.add(digits); // "1.2.3" and other version-like runs compare as written
            }
        }
        return out;
    }

    private static final List<String> MONTHS = List.of("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec");
    private static final Pattern MONTH_YEAR = Pattern.compile(
        "\\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?,?\\s+((?:19|20)\\d{2})\\b",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern ISO_MONTH = Pattern.compile("(?<![0-9])((?:19|20)\\d{2})-(0[1-9]|1[0-2])(?![0-9])");
    private static final Pattern SLASH_MONTH = Pattern.compile("(?<![0-9])(0?[1-9]|1[0-2])/((?:19|20)\\d{2})(?![0-9])");

    /** Months named in a text as {@code yyyy-mm} ("March 2020", "Mar 2020", "2020-03" and "3/2020" all give "2020-03"). */
    public static Set<String> dates(String text) {
        Set<String> out = new LinkedHashSet<>();
        String t = text == null ? "" : text;
        Matcher m = MONTH_YEAR.matcher(t);
        while (m.find()) {
            int month = MONTHS.indexOf(m.group(1).toLowerCase(Locale.ROOT).substring(0, 3)) + 1;
            out.add(m.group(2) + "-" + String.format("%02d", month));
        }
        m = ISO_MONTH.matcher(t);
        while (m.find()) out.add(m.group(1) + "-" + m.group(2));
        m = SLASH_MONTH.matcher(t);
        while (m.find()) out.add(m.group(2) + "-" + String.format("%02d", Integer.parseInt(m.group(1))));
        return out;
    }

    // ---- sentences ------------------------------------------------------------------------------

    private static final Pattern SENTENCE_BREAK = Pattern.compile("(?<=[.!?])\\s+");

    /** Sentences of a text, in order (a text without a full stop is one sentence). */
    static List<String> sentences(String text) {
        List<String> out = new ArrayList<>();
        for (String s : SENTENCE_BREAK.split(text.trim())) {
            if (!s.isBlank()) out.add(s.trim());
        }
        if (out.isEmpty()) out.add(text.trim());
        return out;
    }

    private static int count(String text, String needle) {
        String t = text.toLowerCase(Locale.ROOT);
        String n = needle.toLowerCase(Locale.ROOT);
        int c = 0;
        for (int i = t.indexOf(n); i >= 0; i = t.indexOf(n, i + n.length())) c++;
        return c;
    }

    // ---- entities -------------------------------------------------------------------------------

    private static final Pattern WORD = Pattern.compile("\\p{L}[\\p{L}\\p{N}]*(?:[.+#][\\p{L}\\p{N}+#]+)*(?:\\+\\+|#)?");
    private static final Pattern INSTRUCTION_ECHO = Pattern.compile(
        "(?i)(?:ignore|disregard)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above)\s+instructions|system\s+prompt|as\s+an\s+ai\b|\byou\s+are\s+now\b"
    );
    private static final Pattern URL = Pattern.compile("(?i)(https?://|www\\.|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[a-z]{2,})");

    /** Capitalised words that are not names: weekdays, months, the pronoun, quarters and everyday business abbreviations. */
    private static final Set<String> NOT_ENTITIES = Set.of(
        "i", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
        "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
        "api", "apis", "kpi", "kpis", "okr", "okrs", "roi", "ui", "ux", "sla", "slas", "qa", "ceo", "cto", "cfo", "coo", "vp", "hr", "it",
        "us", "usa", "uk", "eu", "b2b", "b2c", "saas", "pr", "ok", "pdf", "faq", "fy", "ytd", "mvp", "poc", "etl", "cv", "rfp", "rfps", "mba", "phd", "bs", "ba", "ms", "msc"
    );
    private static final Pattern QUARTER = Pattern.compile("(?i)q[1-4]|h[12]|fy\\d{2,4}");
    private static final String SENTENCE_START = ".!?:;—–-(\"“•*[";

    /** Names in {@code sentence} the sources do not contain. */
    static List<String> unknownEntities(String sentence, Sources sources) {
        List<String> unknown = new ArrayList<>();
        Matcher m = WORD.matcher(sentence);
        while (m.find()) {
            String w = m.group();
            if (!isCandidate(w) || startsClause(sentence, m.start()) && !isStrong(w)) continue;
            String lc = w.toLowerCase(Locale.ROOT);
            if (NOT_ENTITIES.contains(lc) || QUARTER.matcher(w).matches() || known(lc, sources)) continue;
            if (!unknown.contains(w)) unknown.add(w);
        }
        return unknown;
    }

    private static boolean isCandidate(String w) {
        if (w.length() < 2) return false;
        if (Character.isUpperCase(w.charAt(0))) return true;
        for (int i = 1; i < w.length(); i++) if (Character.isUpperCase(w.charAt(i))) return true; // iOS, eBay
        return false;
    }

    /** A name even at the start of a clause: CamelCase, an acronym or anything with a digit, not an ordinary verb that opens a bullet. */
    private static boolean isStrong(String w) {
        boolean lower = false;
        boolean upperInside = false;
        boolean digit = false;
        for (int i = 0; i < w.length(); i++) {
            char c = w.charAt(i);
            if (Character.isDigit(c)) digit = true;
            if (Character.isLowerCase(c)) lower = true;
            if (i > 0 && Character.isUpperCase(c)) upperInside = true;
        }
        return digit || upperInside || !lower;
    }

    private static boolean startsClause(String sentence, int at) {
        int i = at - 1;
        while (i >= 0 && Character.isWhitespace(sentence.charAt(i))) i--;
        return i < 0 || SENTENCE_START.indexOf(sentence.charAt(i)) >= 0;
    }

    private static boolean known(String lc, Sources sources) {
        Set<String> dict = sources.entityDictionary();
        if (dict.contains(lc) || lc.endsWith("s") && dict.contains(lc.substring(0, lc.length() - 1)) || dict.contains(lc + "s")) return true;
        if (lc.endsWith("'s") && dict.contains(lc.substring(0, lc.length() - 2))) return true;
        for (String alias : ALIASES.getOrDefault(lc, Set.of())) {
            if (dict.contains(alias)) return true;
        }
        if (lc.length() >= 6) {
            for (String d : dict) {
                if (d.length() >= 6 && d.charAt(0) == lc.charAt(0) && jaroWinkler(lc, d) >= 0.92) return true;
            }
        }
        return false;
    }

    /** Lower-case words of a text (the entity dictionary of a source). */
    static Set<String> words(String text) {
        Set<String> out = new LinkedHashSet<>();
        Matcher m = WORD.matcher(text == null ? "" : text);
        while (m.find()) {
            String w = m.group().toLowerCase(Locale.ROOT);
            out.add(w);
            if (w.endsWith("'s")) out.add(w.substring(0, w.length() - 2));
        }
        return out;
    }

    /** Term to the other spellings of the same tool, from {@code tool-aliases.txt} (one group per line, '|' separated). */
    private static final Map<String, Set<String>> ALIASES = loadAliases();

    private static Map<String, Set<String>> loadAliases() {
        Map<String, Set<String>> out = new HashMap<>();
        try (InputStream in = AiTruthChecks.class.getResourceAsStream("/ai/tool-aliases.txt")) {
            if (in == null) return out;
            BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            for (String line = r.readLine(); line != null; line = r.readLine()) {
                String l = line.trim();
                if (l.isEmpty() || l.startsWith("#")) continue;
                Set<String> group = new LinkedHashSet<>();
                for (String t : l.split("\\|")) group.add(t.trim().toLowerCase(Locale.ROOT));
                for (String t : group) out.computeIfAbsent(t, k -> new LinkedHashSet<>()).addAll(group);
            }
        } catch (java.io.IOException e) {
            throw new IllegalStateException("tool-aliases.txt unreadable", e);
        }
        return out;
    }

    /** Jaro-Winkler similarity, 0 to 1 (the standard prefix scale 0.1, prefix up to 4). */
    static double jaroWinkler(String a, String b) {
        if (a.equals(b)) return 1.0;
        int la = a.length();
        int lb = b.length();
        int window = Math.max(0, Math.max(la, lb) / 2 - 1);
        boolean[] ma = new boolean[la];
        boolean[] mb = new boolean[lb];
        int matches = 0;
        for (int i = 0; i < la; i++) {
            int from = Math.max(0, i - window);
            int to = Math.min(lb - 1, i + window);
            for (int j = from; j <= to; j++) {
                if (!mb[j] && a.charAt(i) == b.charAt(j)) {
                    ma[i] = true;
                    mb[j] = true;
                    matches++;
                    break;
                }
            }
        }
        if (matches == 0) return 0.0;
        int transpositions = 0;
        int k = 0;
        for (int i = 0; i < la; i++) {
            if (!ma[i]) continue;
            while (!mb[k]) k++;
            if (a.charAt(i) != b.charAt(k)) transpositions++;
            k++;
        }
        double jaro = ((double) matches / la + (double) matches / lb + (matches - transpositions / 2.0) / matches) / 3.0;
        int prefix = 0;
        while (prefix < Math.min(4, Math.min(la, lb)) && a.charAt(prefix) == b.charAt(prefix)) prefix++;
        return jaro + prefix * 0.1 * (1 - jaro);
    }

    // ---- relations ------------------------------------------------------------------------------

    private static final Pattern PROMISE = Pattern.compile("(?i)\\bguarantee[sd]?\\b");
    private static final Pattern SELF_ID = Pattern.compile(
        "(?i)\\b(?:\\d{1,2}[- ]years?[- ]old|disabled|disability|pregnant|pregnancy|religion|religious|christian|muslim|jewish|hindu|buddhist|atheist|married|divorced|widowed|nationality)\\b"
    );

    private static void relations(String sentence, int index, Sources sources, List<Violation> out) {
        String lc = sentence.toLowerCase(Locale.ROOT);
        String company = sources.hiringCompany() == null ? "" : sources.hiringCompany().trim().toLowerCase(Locale.ROOT);
        if (!company.isEmpty() && lc.contains(company)) {
            String before = sources.before() == null ? "" : sources.before().toLowerCase(Locale.ROOT);
            if (!before.contains(company)) out.add(new Violation(Kind.RELATION, "hiring company", index));
        }
        String source = sources.sourceText().toLowerCase(Locale.ROOT);
        Matcher m = PROMISE.matcher(sentence);
        if (m.find() && !PROMISE.matcher(source).find()) out.add(new Violation(Kind.RELATION, m.group().toLowerCase(Locale.ROOT), index));
        m = SELF_ID.matcher(sentence);
        while (m.find()) {
            if (!source.contains(m.group().toLowerCase(Locale.ROOT))) out.add(new Violation(Kind.RELATION, m.group().toLowerCase(Locale.ROOT), index));
        }
    }
}
