package com.dossier.api.service.jobs;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns what a person typed into the three things a search needs (E2E-U4.0): a MySQL boolean-mode FULLTEXT
 * string for the words the index can serve, plain word-start {@code LIKE}s for the ones it cannot (too short,
 * or an InnoDB stop word: "ux", "go", "c++"), and the words to leave out.
 *
 * <p>Syntax a person can use: words are AND-ed ({@code senior designer}), {@code "quoted phrases"} stay
 * together, a leading {@code -} excludes ({@code designer -manager}). Everything else is a plain word; none of
 * MySQL's own operators ({@code + < > ( ) ~ * @}) can reach the query, because tokens are rebuilt from their
 * letters and digits and only the operators added here are emitted. A word with punctuation inside
 * ("node.js", "c++") is looked for as a phrase of its letters or, when those are too short, as written.
 *
 * <p>Pure: no database, no settings (the index's minimum token size is passed in).
 */
public final class JobQueryParser {

    /** One thing the person typed: a word or a quoted phrase, to find or to leave out. */
    public record Token(String text, boolean phrase, boolean exclude) {}

    /**
     * @param tokens in the order typed
     * @param booleanQuery the FULLTEXT boolean string, or null when no word can be served by the index
     * @param likeIncludes words matched at the start of a word in the posting text
     * @param likeExcludes words that must not appear anywhere in the posting text
     */
    public record Parsed(List<Token> tokens, String booleanQuery, List<String> likeIncludes, List<String> likeExcludes) {
        public boolean isEmpty() {
            return tokens.isEmpty();
        }

        /** True when there is at least one word to find (not only words to leave out). */
        public boolean hasPositive() {
            return tokens.stream().anyMatch(t -> !t.exclude());
        }

        /** The same search without its last word to find: the "try fewer words" relaxation; null when that would leave nothing. */
        public String withoutLastTerm() {
            int last = -1;
            for (int i = 0; i < tokens.size(); i++) if (!tokens.get(i).exclude()) last = i;
            if (last < 0) return null;
            List<String> rest = new ArrayList<>();
            boolean anyPositive = false;
            for (int i = 0; i < tokens.size(); i++) {
                if (i == last) continue;
                Token t = tokens.get(i);
                rest.add(render(t));
                anyPositive |= !t.exclude();
            }
            return anyPositive ? String.join(" ", rest) : null;
        }

        private static String render(Token t) {
            String body = t.phrase() ? "\"" + t.text() + "\"" : t.text();
            return t.exclude() ? "-" + body : body;
        }
    }

    /** MySQL InnoDB's default stop words (words the index never stores, so a boolean search for one finds nothing). */
    static final Set<String> STOP_WORDS = Set.of(
        "a", "about", "an", "are", "as", "at", "be", "by", "com", "de", "en", "for", "from", "how", "i", "in", "is", "it", "la", "of",
        "on", "or", "that", "the", "this", "to", "was", "what", "when", "where", "who", "will", "with", "und", "www"
    );

    private static final Pattern TOKEN = Pattern.compile("(-?)\"([^\"]*)\"|(-?)(\\S+)");
    private static final Pattern PART = Pattern.compile("[\\p{L}\\p{N}_]+");

    private JobQueryParser() {}

    /** @param ftMinToken the shortest word the FULLTEXT index holds (InnoDB {@code innodb_ft_min_token_size}, 3 by default) */
    public static Parsed parse(String q, int ftMinToken) {
        List<Token> tokens = new ArrayList<>();
        StringBuilder bool = new StringBuilder();
        List<String> likeIn = new ArrayList<>();
        List<String> likeOut = new ArrayList<>();
        List<String> ftNegatives = new ArrayList<>();
        if (q != null) {
            Matcher m = TOKEN.matcher(q.toLowerCase(Locale.ROOT));
            while (m.find()) {
                boolean quoted = m.group(2) != null;
                boolean exclude = "-".equals(quoted ? m.group(1) : m.group(3));
                String raw = quoted ? m.group(2) : m.group(4);
                List<String> parts = new ArrayList<>();
                Matcher p = PART.matcher(raw);
                while (p.find()) parts.add(p.group());
                if (parts.isEmpty()) continue;
                boolean phrase = quoted ? parts.size() > 1 : false;
                String text = String.join(" ", parts);
                boolean multi = parts.size() > 1;
                tokens.add(new Token(text, phrase || multi, exclude));
                boolean servable = parts.stream().allMatch(w -> w.length() >= ftMinToken && !STOP_WORDS.contains(w));
                if (servable) {
                    String term = multi || phrase ? "\"" + text + "\"" : text + (exclude ? "" : "*");
                    if (exclude) ftNegatives.add("-" + term);
                    else {
                        if (bool.length() > 0) bool.append(' ');
                        bool.append('+').append(term);
                    }
                } else {
                    // As the person wrote it (c++, c#): the letters-only form would match "c" everywhere.
                    String asWritten = raw.trim().replaceAll("^[^\\p{L}\\p{N}+#]+|[^\\p{L}\\p{N}+#]+$", "");
                    (exclude ? likeOut : likeIn).add(quoted ? text : asWritten);
                }
            }
        }
        String booleanQuery = null;
        if (bool.length() > 0) {
            for (String n : ftNegatives) bool.append(' ').append(n);
            booleanQuery = bool.toString();
        } else {
            // Only words to leave out (or none the index can serve): leave them out with LIKE instead.
            for (String n : ftNegatives) likeOut.add(n.substring(1).replace("\"", ""));
        }
        return new Parsed(List.copyOf(tokens), booleanQuery, List.copyOf(likeIn), List.copyOf(likeOut));
    }
}
