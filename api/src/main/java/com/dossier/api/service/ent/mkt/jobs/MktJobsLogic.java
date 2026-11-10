package com.dossier.api.service.ent.mkt.jobs;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.service.ent.mkt.jobs.MktJobsDTO.Criteria;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/** The pure rules of the Job Discovery board: filters, sort, rate text and percent change. No I/O, so each is unit-tested on its own. */
final class MktJobsLogic {

    private MktJobsLogic() {}

    static final String DEFAULT_SOURCE = "Client Portal";
    static final String DEFAULT_PRIORITY = "MEDIUM";
    /** A salary is compared to an hourly filter as {@code year / 2080}; only the rate FILTER normalises, the shown rate stays in the job's own unit. */
    static final double HOURS_PER_YEAR = 2080d;

    /** A job joined with the things its row needs. */
    record JobView(ClientRequirement r, String clientName, String source, String priority, String visa, List<String> skills) {}

    /** Percent change {@code (current - previous) / previous}, rounded to a whole percent; null when there is nothing to compare (previous 0). */
    static Double pct(long current, long previous) {
        if (previous <= 0) return null;
        return (double) Math.round((current - previous) * 100d / previous);
    }

    /** "$90 - $110/hr", "$120k - $150k/yr", "$90/hr", "-" when the job has no rate. Always the job's own fields. */
    static String rateLabel(Long min, Long max, String unit, String currency) {
        if (min == null && max == null) return "-";
        boolean year = "YEAR".equalsIgnoreCase(unit);
        String lo = money(min != null ? min : max, year, currency);
        String hi = money(max != null ? max : min, year, currency);
        String suffix = year ? "/yr" : "/hr";
        return lo.equals(hi) ? lo + suffix : lo + " - " + hi + suffix;
    }

    private static String money(long minor, boolean year, String currency) {
        String symbol = currency == null || currency.equalsIgnoreCase("USD") ? "$" : currency.toUpperCase(Locale.ROOT) + " ";
        long major = Math.round(minor / 100d);
        if (year && major >= 1000 && major % 1000 == 0) return symbol + (major / 1000) + "k";
        return symbol + major;
    }

    /** The job's rate bound in dollars per hour (a yearly rate is divided by {@link #HOURS_PER_YEAR}); null when absent. */
    static Double hourly(Long minor, String unit) {
        if (minor == null) return null;
        double major = minor / 100d;
        return "YEAR".equalsIgnoreCase(unit) ? major / HOURS_PER_YEAR : major;
    }

    private static boolean has(String s) {
        return s != null && !s.isBlank();
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
    }

    /** Every filter of the board, AND-ed. Skills match when the job has ANY of the chosen skills. */
    static boolean matches(JobView j, Criteria c) {
        if (c == null) return true;
        if (has(c.q())) {
            String hay = norm(j.r().getTitle() + " " + j.clientName() + " " + String.join(" ", j.skills()) + " " + (j.r().getLocation() == null ? "" : j.r().getLocation()) + " " + (j.r().getDescriptionText() == null ? "" : j.r().getDescriptionText()));
            for (String token : norm(c.q()).split("\\s+")) if (!token.isEmpty() && !hay.contains(token)) return false;
        }
        if (c.skills() != null && !c.skills().isEmpty()) {
            boolean any = false;
            for (String want : c.skills()) {
                for (String have : j.skills()) if (norm(have).equals(norm(want))) any = true;
            }
            if (!any) return false;
        }
        if (has(c.location())) {
            String want = norm(c.location());
            String loc = norm(j.r().getLocation());
            boolean remoteAsked = want.equals("remote");
            boolean ok = loc.contains(want) || (remoteAsked && "REMOTE".equalsIgnoreCase(j.r().getWorkMode()));
            if (!ok) return false;
        }
        if (has(c.workType()) && !c.workType().equalsIgnoreCase(j.r().getWorkMode())) return false;
        if (has(c.visa()) && !c.visa().equalsIgnoreCase(j.visa())) return false;
        if (has(c.source()) && !c.source().equalsIgnoreCase(j.source())) return false;
        if (c.rateMin() != null || c.rateMax() != null) {
            Double lo = hourly(j.r().getRateMinMinor() != null ? j.r().getRateMinMinor() : j.r().getRateMaxMinor(), j.r().getRateUnit());
            Double hi = hourly(j.r().getRateMaxMinor() != null ? j.r().getRateMaxMinor() : j.r().getRateMinMinor(), j.r().getRateUnit());
            if (lo == null || hi == null) return false;
            if (c.rateMin() != null && hi < c.rateMin()) return false;
            if (c.rateMax() != null && lo > c.rateMax()) return false;
        }
        return true;
    }

    static Comparator<JobView> comparator(String sort) {
        Comparator<JobView> newest = Comparator.comparing((JobView j) -> j.r().getPostedAt(), Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(j -> j.r().getId(), Comparator.nullsLast(Comparator.reverseOrder()));
        if (sort == null) return newest;
        return switch (sort) {
            case "posted_asc" -> Comparator.comparing((JobView j) -> j.r().getPostedAt(), Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(j -> j.r().getId(), Comparator.nullsLast(Comparator.naturalOrder()));
            case "rate_desc" -> Comparator.comparing((JobView j) -> hourly(j.r().getRateMaxMinor() != null ? j.r().getRateMaxMinor() : j.r().getRateMinMinor(), j.r().getRateUnit()), Comparator.nullsLast(Comparator.<Double>reverseOrder())).thenComparing(newest);
            case "title_asc" -> Comparator.comparing((JobView j) -> norm(j.r().getTitle())).thenComparing(newest);
            case "client_asc" -> Comparator.comparing((JobView j) -> norm(j.clientName())).thenComparing(newest);
            default -> newest;
        };
    }

    /** Day or week buckets ending at {@code now}: bucket i of n covers {@code [now-(n-i)*step, now-(n-i-1)*step)}; returns how many instants fall in each. */
    static List<Long> buckets(List<Instant> instants, Instant now, long stepSeconds, int n) {
        List<Long> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Instant from = now.minusSeconds((n - i) * stepSeconds);
            Instant to = now.minusSeconds((n - i - 1) * stepSeconds);
            long c = 0;
            for (Instant t : instants) if (t != null && !t.isBefore(from) && t.isBefore(to)) c++;
            out.add(c);
        }
        return out;
    }

    /** Cumulative counts at the end of each of the last {@code n} steps: how many instants are at or before that boundary. */
    static List<Long> cumulative(List<Instant> instants, Instant now, long stepSeconds, int n) {
        List<Long> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Instant end = now.minusSeconds((n - i - 1) * stepSeconds);
            long c = 0;
            for (Instant t : instants) if (t != null && !t.isAfter(end)) c++;
            out.add(c);
        }
        return out;
    }

    /** Priority wire value: HIGH / MEDIUM / LOW, anything else MEDIUM. */
    static String priority(String raw) {
        if (raw == null) return DEFAULT_PRIORITY;
        String p = raw.trim().toUpperCase(Locale.ROOT);
        return p.equals("HIGH") || p.equals("LOW") || p.equals("MEDIUM") ? p : DEFAULT_PRIORITY;
    }
}
