package com.dossier.api.service.jobs;

import com.dossier.api.domain.JobPosting;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The deterministic half of daily job matching (Phase 13.6b): from a night's fresh postings, the
 * ≤ 50 worth paying a model to score for one user. No AI, so it can be generous — the model does the
 * judging — but it must never send a job the user can't take. Four gates, then a rank:
 *
 * <ol>
 *   <li><b>New to them</b> — not scored before, and not a job they already track.</li>
 *   <li><b>Where they can work</b> — per location segment ("New York, NY; Remote (US)"): a remote
 *       segment in their country (or naming no country), their own city or state, or anywhere in
 *       their country when they'll relocate. With no location on their profile, anywhere passes.</li>
 *   <li><b>The right line of work</b> — the posting's title shares a telling word with one of their
 *       last two titles ("backend", "software", "product"), or a generic one ("engineer", "manager")
 *       plus three of their skills, or names several of their skills outright.</li>
 *   <li><b>The right level</b> — not two or more levels away (a senior engineer isn't sent intern or
 *       director postings). A title that doesn't say passes.</li>
 * </ol>
 *
 * Rank = telling title words × 4 + generic ones + skills named in the posting (≤ 10) + 2 for a local
 * or matching-remote posting − 1 for a level one step away.
 */
public final class JobPrefilter {

    public static final int MAX_CANDIDATES = 50;

    public record Candidate(JobPosting posting, int rank) {}

    /** Words that say nothing about the line of work. */
    private static final Set<String> STOP = Set.of(
        "a", "an", "and", "the", "of", "for", "to", "in", "at", "on", "with", "or", "i", "ii", "iii", "iv", "1", "2", "3", "4",
        "senior", "sr", "junior", "jr", "staff", "principal", "lead", "intern", "internship", "associate", "entry", "level",
        "head", "director", "vp", "chief", "new", "grad", "graduate", "remote", "hybrid", "contract", "contractor",
        "temporary", "part", "time", "full", "team", "us", "usa", "uk", "emea", "apac", "global"
    );

    /**
     * Title words that name a kind of job but not the field — "Technical Support Engineer" and
     * "Software Engineer" share only "engineer". On their own they need the skills to back them up.
     */
    private static final Set<String> GENERIC = Set.of(
        "engineer", "engineering", "manager", "management", "specialist", "analyst", "representative", "consultant",
        "coordinator", "administrator", "officer", "technician", "operations", "support", "program", "project"
    );

    private static final Map<String, String> SAME_WORD = Map.of(
        "developer", "engineer",
        "dev", "engineer",
        "swe", "engineer",
        "sde", "engineer",
        "programmer", "engineer",
        "mgr", "manager",
        "eng", "engineering"
    );

    private JobPrefilter() {}

    public static List<Candidate> select(MatchPreferences p, List<JobPosting> postings, Set<Long> alreadyScored, Set<String> tracked, int limit) {
        Set<String> titleWords = new HashSet<>();
        for (String t : p.titles()) titleWords.addAll(words(t));
        List<Pattern> skillRes = new ArrayList<>();
        for (String s : p.skills()) skillRes.add(Pattern.compile("(?<![\\p{L}\\p{N}])" + Pattern.quote(s.toLowerCase(Locale.ROOT)) + "(?![\\p{L}\\p{N}])"));
        Place home = Place.of(p.city(), p.state(), p.country());

        List<Candidate> out = new ArrayList<>();
        for (JobPosting j : postings) {
            if (j.getId() != null && alreadyScored.contains(j.getId())) continue;
            if (tracked.contains(trackedKey(j.getCompany(), j.getTitle())) || (j.getUrl() != null && tracked.contains(j.getUrl()))) continue;

            int where = home.fit(j, p.workPreference(), p.relocate());
            if (where < 0) continue;

            int telling = 0, generic = 0;
            for (String w : words(j.getTitle())) {
                if (!titleWords.contains(w)) continue;
                if (GENERIC.contains(w)) generic++;
                else telling++;
            }
            String text = (j.getTitle() + "\n" + (j.getDescriptionText() == null ? "" : j.getDescriptionText())).toLowerCase(Locale.ROOT);
            int skillHits = 0;
            for (Pattern re : skillRes) {
                if (skillHits >= 10) break;
                if (re.matcher(text).find()) skillHits++;
            }
            boolean lineOfWork = telling > 0 || (generic > 0 && skillHits >= 3) || (titleWords.isEmpty() ? skillHits >= 4 : skillHits >= 6);
            if (!lineOfWork) continue;

            int level = MatchPreferences.Seniority.of(j.getTitle());
            int gap = level == MatchPreferences.Seniority.UNKNOWN || p.seniority() == MatchPreferences.Seniority.UNKNOWN
                ? 0
                : Math.abs(level - p.seniority());
            if (gap >= 2) continue;

            out.add(new Candidate(j, telling * 4 + generic + skillHits + where - (gap == 1 ? 1 : 0)));
        }
        out.sort(
            Comparator.comparingInt(Candidate::rank)
                .reversed()
                .thenComparing(c -> c.posting().getPublishedAt(), Comparator.nullsLast(Comparator.reverseOrder()))
        );
        return out.size() > limit ? out.subList(0, limit) : out;
    }

    /** How a tracked application is recognised among postings: company + title, normalised. */
    public static String trackedKey(String company, String title) {
        return norm(company) + "|" + norm(title);
    }

    static Set<String> words(String title) {
        Set<String> out = new HashSet<>();
        for (String w : norm(title).split(" ")) {
            if (w.length() < 2 && !w.equals("c")) continue;
            String v = SAME_WORD.getOrDefault(w, w);
            if (!STOP.contains(v)) out.add(v);
        }
        return out;
    }

    private static String norm(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replace("front-end", "frontend").replace("back-end", "backend")
            .replace("full-stack", "fullstack").replaceAll("[^\\p{L}\\p{N}+#]+", " ").trim();
    }

    /**
     * Where a user is, and whether a posting's locations suit them. Countries are compared as
     * canonical names; a US state (name or two-letter code) implies the US.
     */
    static final class Place {

        private static final Map<String, String> US_STATES = new HashMap<>();
        private static final Map<String, String> COUNTRY_ALIASES = new HashMap<>();
        private static final Map<String, Set<String>> REGIONS = new HashMap<>();

        static {
            String[][] states = {
                { "al", "alabama" }, { "ak", "alaska" }, { "az", "arizona" }, { "ar", "arkansas" }, { "ca", "california" },
                { "co", "colorado" }, { "ct", "connecticut" }, { "de", "delaware" }, { "fl", "florida" }, { "ga", "georgia" },
                { "hi", "hawaii" }, { "id", "idaho" }, { "il", "illinois" }, { "in", "indiana" }, { "ia", "iowa" },
                { "ks", "kansas" }, { "ky", "kentucky" }, { "la", "louisiana" }, { "me", "maine" }, { "md", "maryland" },
                { "ma", "massachusetts" }, { "mi", "michigan" }, { "mn", "minnesota" }, { "ms", "mississippi" },
                { "mo", "missouri" }, { "mt", "montana" }, { "ne", "nebraska" }, { "nv", "nevada" }, { "nh", "new hampshire" },
                { "nj", "new jersey" }, { "nm", "new mexico" }, { "ny", "new york" }, { "nc", "north carolina" },
                { "nd", "north dakota" }, { "oh", "ohio" }, { "ok", "oklahoma" }, { "or", "oregon" }, { "pa", "pennsylvania" },
                { "ri", "rhode island" }, { "sc", "south carolina" }, { "sd", "south dakota" }, { "tn", "tennessee" },
                { "tx", "texas" }, { "ut", "utah" }, { "vt", "vermont" }, { "va", "virginia" }, { "wa", "washington" },
                { "wv", "west virginia" }, { "wi", "wisconsin" }, { "wy", "wyoming" }, { "dc", "district of columbia" },
            };
            for (String[] s : states) US_STATES.put(s[0], s[1]);
            String[][] countries = {
                { "united states", "united states", "united states of america", "usa", "us", "u s", "u s a", "america" },
                { "canada", "canada" }, // not "ca": that's California
                { "united kingdom", "united kingdom", "uk", "u k", "england", "scotland", "wales", "great britain", "britain", "gb" },
                { "ireland", "ireland" },
                { "germany", "germany", "deutschland" }, // not "de": that's Delaware
                { "france", "france" },
                { "netherlands", "netherlands", "the netherlands", "holland" },
                { "spain", "spain" },
                { "portugal", "portugal" },
                { "italy", "italy" },
                { "poland", "poland" },
                { "sweden", "sweden" },
                { "denmark", "denmark" },
                { "norway", "norway" },
                { "finland", "finland" },
                { "switzerland", "switzerland" },
                { "austria", "austria" },
                { "belgium", "belgium" },
                { "czech republic", "czech republic", "czechia" },
                { "romania", "romania" },
                { "estonia", "estonia" },
                { "lithuania", "lithuania" },
                { "ukraine", "ukraine" },
                { "israel", "israel" },
                { "turkey", "turkey", "turkiye" },
                { "india", "india" },
                { "singapore", "singapore" },
                { "japan", "japan" },
                { "south korea", "south korea", "korea" },
                { "china", "china" },
                { "hong kong", "hong kong" },
                { "taiwan", "taiwan" },
                { "philippines", "philippines" },
                { "australia", "australia" },
                { "new zealand", "new zealand" },
                { "united arab emirates", "united arab emirates", "uae" },
                { "brazil", "brazil", "brasil" },
                { "mexico", "mexico" },
                { "argentina", "argentina" },
                { "colombia", "colombia" },
                { "chile", "chile" },
                { "south africa", "south africa" },
                { "nigeria", "nigeria" },
                { "kenya", "kenya" },
            };
            for (String[] c : countries) for (int i = 1; i < c.length; i++) COUNTRY_ALIASES.put(c[i], c[0]);
            Set<String> europe = Set.of(
                "united kingdom", "ireland", "germany", "france", "netherlands", "spain", "portugal", "italy", "poland", "sweden",
                "denmark", "norway", "finland", "switzerland", "austria", "belgium", "czech republic", "romania", "estonia",
                "lithuania", "ukraine"
            );
            Set<String> emea = new HashSet<>(europe);
            emea.addAll(Set.of("israel", "turkey", "united arab emirates", "south africa", "nigeria", "kenya"));
            Set<String> latam = Set.of("brazil", "mexico", "argentina", "colombia", "chile");
            Set<String> americas = new HashSet<>(latam);
            americas.addAll(Set.of("united states", "canada"));
            REGIONS.put("europe", europe);
            REGIONS.put("eu", europe);
            REGIONS.put("emea", emea);
            REGIONS.put("latam", latam);
            REGIONS.put("north america", Set.of("united states", "canada", "mexico"));
            REGIONS.put("americas", americas);
            REGIONS.put(
                "apac",
                Set.of("india", "singapore", "japan", "south korea", "china", "hong kong", "taiwan", "philippines", "australia", "new zealand")
            );
        }

        private final String city;
        private final String stateName;
        private final String stateCode;
        private final String country;

        private Place(String city, String stateName, String stateCode, String country) {
            this.city = city;
            this.stateName = stateName;
            this.stateCode = stateCode;
            this.country = country;
        }

        static Place of(String city, String state, String country) {
            String c = city == null ? null : norm(city);
            String st = state == null ? null : norm(state);
            String code = null, name = null;
            if (st != null && !st.isEmpty()) {
                if (US_STATES.containsKey(st)) {
                    code = st;
                    name = US_STATES.get(st);
                } else {
                    name = st;
                    for (Map.Entry<String, String> e : US_STATES.entrySet()) if (e.getValue().equals(st)) code = e.getKey();
                }
            }
            String ctry = country == null ? null : COUNTRY_ALIASES.getOrDefault(norm(country), norm(country));
            if (ctry == null && code != null) ctry = "united states";
            return new Place(c == null || c.isEmpty() ? null : c, name, code, ctry == null || ctry.isEmpty() ? null : ctry);
        }

        boolean known() {
            return city != null || stateName != null || country != null;
        }

        /**
         * How a posting's locations suit this user: −1 no, 0 yes, 2 yes and it's local or a remote
         * job they asked for. Any one location segment is enough.
         */
        int fit(JobPosting j, String workPreference, boolean relocate) {
            if (!known()) return 0;
            String loc = j.getLocation() == null ? "" : j.getLocation();
            String[] segments = loc.isBlank() ? new String[] { "" } : loc.split(";");
            // A stated workplace type outranks the remote flag (Ashby flags hybrid jobs remote too).
            String wt = j.getWorkplaceType();
            boolean postingRemote = "REMOTE".equals(wt) || (wt == null && Boolean.TRUE.equals(j.getRemote()));
            int best = -1;
            for (String raw : segments) {
                String seg = " " + norm(raw) + " ";
                boolean remote = seg.contains(" remote ") || seg.contains(" anywhere ") || (segments.length == 1 && postingRemote);
                Set<String> named = countriesIn(seg);
                boolean countryOk = named.isEmpty() || country == null || named.contains(country);
                boolean local = isLocal(seg);
                if (local) best = Math.max(best, 2);
                else if (remote && countryOk) best = Math.max(best, "REMOTE".equals(workPreference) ? 2 : 0);
                else if (relocate && country != null && named.contains(country)) best = Math.max(best, 0);
                else if (raw.isBlank() && !postingRemote) best = Math.max(best, 0); // no location given: let the model judge
            }
            return best;
        }

        private boolean isLocal(String seg) {
            if (city != null && seg.contains(" " + city + " ")) return true;
            if (stateName != null && seg.contains(" " + stateName + " ")) return true;
            // "New York, NY" — a two-letter code only counts as a whole word next to other text.
            return stateCode != null && "united states".equals(country) && seg.matches(".*\\w+ " + stateCode + " .*");
        }

        static Set<String> countriesIn(String seg) {
            Set<String> out = new HashSet<>();
            for (Map.Entry<String, String> e : COUNTRY_ALIASES.entrySet()) {
                String alias = e.getKey();
                // Two-letter aliases (us, uk, gb) only count inside brackets-turned-spaces at the
                // end of a segment — "Remote (US)", "London, UK" — never as ordinary words.
                if (alias.length() <= 2) {
                    if (seg.trim().endsWith(" " + alias) || seg.trim().equals(alias)) out.add(e.getValue());
                } else if (seg.contains(" " + alias + " ")) out.add(e.getValue());
            }
            for (Map.Entry<String, Set<String>> r : REGIONS.entrySet()) if (seg.contains(" " + r.getKey() + " ")) out.addAll(r.getValue());
            // A US state name or "City, ST" implies the US.
            for (Map.Entry<String, String> s : US_STATES.entrySet()) {
                if (seg.contains(" " + s.getValue() + " ") || seg.trim().endsWith(" " + s.getKey())) {
                    out.add("united states");
                    break;
                }
            }
            return out;
        }
    }
}
