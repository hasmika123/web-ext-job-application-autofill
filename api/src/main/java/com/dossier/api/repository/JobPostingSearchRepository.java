package com.dossier.api.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Repository;

/**
 * The native half of job search (E2E-U4.0): the one place SQL for {@code job_posting} text search lives. MySQL
 * FULLTEXT ({@code MATCH ... AGAINST} in boolean mode) for the words the index serves, word-start {@code LIKE}
 * for the rest, and the filters, all in one dynamically assembled WHERE whose every value is a bound parameter
 * (only fixed SQL fragments are ever concatenated). Every query also hides what the asking user hid and what
 * they already applied to, so no one's search can show another's choices.
 *
 * <p>It answers ids (and a relevance number) and counts; the columns a result shows come from
 * {@link JobPostingRepository#cards}, so a page never reads descriptions.
 */
@Repository
public class JobPostingSearchRepository {

    /** What to look for: the already-parsed text, in three parts (see {@code JobQueryParser}). */
    public record Terms(String booleanQuery, List<String> likeIncludes, List<String> likeExcludes) {
        public static final Terms NONE = new Terms(null, List.of(), List.of());
    }

    /** The structured filters; a null / empty value means "no filter". {@code remote} is REMOTE, HYBRID or ONSITE. */
    public record Filters(String loc, String remote, Set<String> types, Integer postedDays, String company) {
        public static final Filters NONE = new Filters(null, null, Set.of(), null, null);
    }

    /** One matching posting: its id and the FULLTEXT relevance (0 when the search had no indexed words). */
    public record Hit(long id, double relevance) {}

    private record Where(String sql, Map<String, Object> params) {}

    /** InnoDB-stored employment text, normalised for comparison: "Full-time" / "full_time" / "FullTime" all read "fulltime". */
    private static final String EMP = "LOWER(REPLACE(REPLACE(REPLACE(p.employment_type, '-', ''), ' ', ''), '_', ''))";

    private static final String MATCH = "MATCH(p.title, p.company, p.search_text) AGAINST (:ft IN BOOLEAN MODE)";

    @PersistenceContext
    private EntityManager em;

    /**
     * One page of matching ids. {@code newestFirst} orders by publish time (the caller pages with {@code offset});
     * otherwise by FULLTEXT relevance then recency (the caller re-ranks up to {@code limit} of them in Java).
     */
    public List<Hit> hits(long userId, Terms t, Filters f, Instant now, boolean newestFirst, int offset, int limit) {
        Where w = where(userId, t, f, now, false, false, false);
        // CAST: the driver reports FULLTEXT's float oddly through Hibernate's Double reader; a DECIMAL reads cleanly.
        String rel = t.booleanQuery() != null ? "CAST(" + MATCH + " AS DECIMAL(12, 6))" : "0";
        String order = newestFirst ? "p.published_at DESC, p.id DESC" : "rel DESC, p.published_at DESC, p.id DESC";
        Query q = em.createNativeQuery("SELECT p.id, " + rel + " AS rel FROM job_posting p WHERE " + w.sql() + " ORDER BY " + order + " LIMIT :lim OFFSET :off");
        bind(q, w.params());
        q.setParameter("lim", limit);
        q.setParameter("off", offset);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return rows.stream().map(r -> new Hit(((Number) r[0]).longValue(), r[1] == null ? 0 : ((Number) r[1]).doubleValue())).toList();
    }

    /** How many postings match, counted up to {@code cap} (so a broad search never scans everything to say "lots"). */
    public long count(long userId, Terms t, Filters f, Instant now, int cap) {
        Where w = where(userId, t, f, now, false, false, false);
        Query q = em.createNativeQuery("SELECT COUNT(*) FROM (SELECT 1 FROM job_posting p WHERE " + w.sql() + " LIMIT :cap) x");
        bind(q, w.params());
        q.setParameter("cap", cap);
        return ((Number) q.getSingleResult()).longValue();
    }

    /** Matching postings per workplace type (REMOTE, HYBRID, ONSITE, UNKNOWN), ignoring the remote filter itself. */
    public Map<String, Long> remoteFacet(long userId, Terms t, Filters f, Instant now) {
        Where w = where(userId, t, f, now, true, false, false);
        Query q = em.createNativeQuery(
            "SELECT CASE WHEN p.workplace_type IS NOT NULL THEN p.workplace_type WHEN p.remote = 1 THEN 'REMOTE' ELSE 'UNKNOWN' END AS k, COUNT(*) " +
            "FROM job_posting p WHERE " + w.sql() + " GROUP BY k"
        );
        bind(q, w.params());
        return counts(q);
    }

    /** Matching postings per raw employment-type text, ignoring the type filter itself (the caller normalises). */
    public Map<String, Long> typeFacet(long userId, Terms t, Filters f, Instant now) {
        Where w = where(userId, t, f, now, false, true, false);
        Query q = em.createNativeQuery("SELECT p.employment_type, COUNT(*) FROM job_posting p WHERE " + w.sql() + " AND p.employment_type IS NOT NULL GROUP BY p.employment_type");
        bind(q, w.params());
        return counts(q);
    }

    /** For each of {@code days}: matching postings published within that many days, ignoring the posted filter itself. */
    public Map<Integer, Long> postedFacet(long userId, Terms t, Filters f, Instant now, List<Integer> days) {
        Where w = where(userId, t, f, now, false, false, true);
        StringBuilder cols = new StringBuilder();
        Map<String, Object> params = new LinkedHashMap<>(w.params());
        for (int i = 0; i < days.size(); i++) {
            if (i > 0) cols.append(", ");
            cols.append("COALESCE(SUM(p.published_at >= :d").append(i).append("), 0)");
            params.put("d" + i, now.minusSeconds(days.get(i) * 86_400L)); // config-literal-ok: seconds per day
        }
        Query q = em.createNativeQuery("SELECT " + cols + " FROM job_posting p WHERE " + w.sql());
        bind(q, params);
        Object single = q.getSingleResult();
        Object[] row = single instanceof Object[] a ? a : new Object[] { single };
        Map<Integer, Long> out = new LinkedHashMap<>();
        for (int i = 0; i < days.size(); i++) out.put(days.get(i), ((Number) row[i]).longValue());
        return out;
    }

    // ---- the WHERE ------------------------------------------------------------------------------------

    private Where where(long userId, Terms t, Filters f, Instant now, boolean skipRemote, boolean skipType, boolean skipPosted) {
        StringBuilder sb = new StringBuilder("1 = 1");
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("uid", userId);
        if (t.booleanQuery() != null) {
            sb.append(" AND ").append(MATCH);
            p.put("ft", t.booleanQuery());
        }
        for (int i = 0; i < t.likeIncludes().size(); i++) {
            String s = escape(t.likeIncludes().get(i));
            sb.append(" AND (p.search_text LIKE :li").append(i).append("a OR p.search_text LIKE :li").append(i).append("b)");
            p.put("li" + i + "a", s + "%");
            p.put("li" + i + "b", "% " + s + "%");
        }
        for (int i = 0; i < t.likeExcludes().size(); i++) {
            sb.append(" AND p.search_text NOT LIKE :le").append(i);
            p.put("le" + i, "%" + escape(t.likeExcludes().get(i)) + "%");
        }
        if (f.loc() != null && !f.loc().isBlank()) {
            sb.append(" AND LOWER(p.location) LIKE :loc");
            p.put("loc", "%" + escape(f.loc().toLowerCase()) + "%");
        }
        if (f.company() != null && !f.company().isBlank()) {
            sb.append(" AND LOWER(p.company) LIKE :company");
            p.put("company", escape(f.company().toLowerCase()) + "%");
        }
        if (!skipRemote && f.remote() != null) {
            switch (f.remote()) {
                case "REMOTE" -> sb.append(" AND (p.workplace_type = 'REMOTE' OR (p.workplace_type IS NULL AND p.remote = 1))");
                case "HYBRID" -> sb.append(" AND p.workplace_type = 'HYBRID'");
                case "ONSITE" -> sb.append(" AND p.workplace_type = 'ONSITE'");
                default -> {}
            }
        }
        if (!skipType && f.types() != null && !f.types().isEmpty()) {
            StringBuilder or = new StringBuilder();
            for (String type : f.types()) {
                String clause = switch (type) {
                    case "FULL_TIME" -> EMP + " LIKE 'fulltime%' OR " + EMP + " = 'permanent'";
                    case "PART_TIME" -> EMP + " LIKE 'parttime%'";
                    case "CONTRACT" -> EMP + " LIKE 'contract%' OR " + EMP + " LIKE 'freelance%'";
                    case "INTERNSHIP" -> EMP + " LIKE 'intern%'";
                    default -> null;
                };
                if (clause == null) continue;
                if (or.length() > 0) or.append(" OR ");
                or.append('(').append(clause).append(')');
            }
            if (or.length() > 0) sb.append(" AND (").append(or).append(')');
        }
        if (!skipPosted && f.postedDays() != null) {
            sb.append(" AND p.published_at >= :since");
            p.put("since", now.minusSeconds(f.postedDays() * 86_400L)); // config-literal-ok: seconds per day
        }
        // What this user hid, and what they already applied to, never shows in their results.
        sb.append(
            " AND NOT EXISTS (SELECT 1 FROM job_feedback jf WHERE jf.user_id = :uid AND ((jf.kind = 'HIDE' AND jf.posting_id = p.id)" +
            " OR (jf.kind = 'HIDE_COMPANY' AND jf.company_key = LOWER(TRIM(p.company)))))"
        );
        sb.append(
            " AND NOT EXISTS (SELECT 1 FROM application a WHERE a.user_id = :uid AND a.posting_id = p.id" +
            " AND a.status IN ('APPLIED', 'IN_REVIEW', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'))"
        );
        return new Where(sb.toString(), p);
    }

    private static void bind(Query q, Map<String, Object> params) {
        params.forEach(q::setParameter);
    }

    private static Map<String, Long> counts(Query q) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        Map<String, Long> out = new LinkedHashMap<>();
        for (Object[] r : rows) out.put(String.valueOf(r[0]), ((Number) r[1]).longValue());
        return out;
    }

    /** A LIKE pattern body with its wildcards made literal. */
    public static String escape(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
