package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.UsageCounter;
import com.dossier.api.domain.ent.consultantws.CwsMatchView;
import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.ent.billing.UsageCounterRepository;
import com.dossier.api.repository.ent.consultantws.CwsMatchViewRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepSessionRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.AiBudgetService;
import com.dossier.api.service.ent.licenses.OrgLicenseGate;
import com.dossier.api.service.ent.licenses.OrgLicenseService;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Feature Usage (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1a, OBL-04 reads): what each licensed consultant really used in a month. The counts
 * come from the same rows as the consultant's own My Features page: job-match views, interview-prep sessions, applications tracked. The AI budget
 * is shown as a percent and never in dollars, for the current month only, where the licence carries AI. Where {@code usage_counter} has rows
 * (the demo seed), they are listed as well. Read-only; the {@code billing} module and {@code usage.view} gate it.
 */
@Service
public class OrgUsageReadService {

    public static final String VIEW = "usage.view";
    static final int MAX_MONTHS = 12;

    public static final String MATCH_VIEWS = "match_views";
    public static final String PREP_SESSIONS = "prep_sessions";
    public static final String APPLICATIONS = "applications";

    public record Counter(String featureKey, String label, long used, Long allowance) {}

    public record ConsultantUsage(Long consultantId, String name, Integer aiBudgetPercent, int matchViews, int prepSessions, int applications, List<Counter> counters) {}

    public record FeatureTotal(String key, String label, long used, Long allowance, int consultants) {}

    public record Usage(String period, boolean current, LocalDate resetsOn, List<ConsultantUsage> consultants, List<FeatureTotal> features) {}

    public record Month(String period, int matchViews, int prepSessions, int applications, long counted) {}

    public record History(List<Month> months) {}

    private final OrgBillingReadService billing;
    private final OrgLicenseService licenseRows;
    private final OrgLicenseGate licenseGate;
    private final ConsultantProfileRepository consultants;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final CwsMatchViewRepository matchViews;
    private final CwsPrepSessionRepository prepSessions;
    private final TalentApplicationRepository applications;
    private final UsageCounterRepository counters;
    private final FeatureDefinitionRepository definitions;
    private final AiBudgetService aiBudget;
    private Clock clock = Clock.systemUTC();

    public OrgUsageReadService(
        OrgBillingReadService billing,
        OrgLicenseService licenseRows,
        OrgLicenseGate licenseGate,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        UserRepository users,
        CwsMatchViewRepository matchViews,
        CwsPrepSessionRepository prepSessions,
        TalentApplicationRepository applications,
        UsageCounterRepository counters,
        FeatureDefinitionRepository definitions,
        AiBudgetService aiBudget
    ) {
        this.billing = billing;
        this.licenseRows = licenseRows;
        this.licenseGate = licenseGate;
        this.consultants = consultants;
        this.members = members;
        this.users = users;
        this.matchViews = matchViews;
        this.prepSessions = prepSessions;
        this.applications = applications;
        this.counters = counters;
        this.definitions = definitions;
        this.aiBudget = aiBudget;
    }

    /** Tests pin the time. */
    void setClock(Clock clock) {
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Usage usage(OrgMembership me, String period) {
        billing.gate(me, VIEW);
        Long orgId = me.orgId();
        YearMonth now = YearMonth.now(clock.withZone(ZoneOffset.UTC));
        YearMonth month = month(period, now);
        boolean current = month.equals(now);
        Instant from = month.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant to = month.plusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Map<String, String> labels = new LinkedHashMap<>();

        List<ConsultantUsage> rows = new ArrayList<>();
        for (OrgLicenseService.Row r : licenseRows.rowsFor(orgId)) {
            if (r.status() != OrgLicenseService.Status.ACTIVE && r.status() != OrgLicenseService.Status.SUSPENDED && r.status() != OrgLicenseService.Status.ENDING) continue;
            Long cid = r.consultantId();
            int views = count(matchViews.findByOrgIdAndConsultantId(orgId, cid), CwsMatchView::getViewedAt, from, to);
            int prep = count(prepSessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(orgId, cid), CwsPrepSession::getOccurredAt, from, to);
            int apps = count(applications.findByOrgIdAndConsultantId(orgId, cid), TalentApplication::getCreatedAt, from, to);
            List<Counter> cs = new ArrayList<>();
            for (UsageCounter c : counters.findByOrgIdAndConsultantIdAndPeriodKey(orgId, cid, key(month))) {
                cs.add(new Counter(c.getFeatureKey(), label(c.getFeatureKey(), labels), c.getUsed() == null ? 0 : c.getUsed(), c.getAllowance()));
            }
            rows.add(new ConsultantUsage(cid, r.name(), current ? aiPercent(orgId, cid) : null, views, prep, apps, cs));
        }

        List<FeatureTotal> totals = new ArrayList<>();
        totals.add(total(MATCH_VIEWS, "Job-match views", rows, ConsultantUsage::matchViews));
        totals.add(total(PREP_SESSIONS, "Interview-prep sessions", rows, ConsultantUsage::prepSessions));
        totals.add(total(APPLICATIONS, "Applications tracked", rows, ConsultantUsage::applications));
        Map<String, long[]> byKey = new LinkedHashMap<>(); // used, allowance, consultants, allowance seen (1/0)
        for (ConsultantUsage u : rows) {
            for (Counter c : u.counters()) {
                long[] t = byKey.computeIfAbsent(c.featureKey(), k -> new long[4]);
                t[0] += c.used();
                if (c.allowance() != null) {
                    t[1] += c.allowance();
                    t[3] = 1;
                }
                t[2]++;
            }
        }
        byKey.forEach((k, t) -> totals.add(new FeatureTotal(k, labels.getOrDefault(k, k), t[0], t[3] == 1 ? t[1] : null, (int) t[2])));
        return new Usage(key(month), current, month.plusMonths(1).atDay(1), rows, totals);
    }

    /** The organization's totals per month, oldest first, ending with the current month. */
    @Transactional(readOnly = true)
    public History history(OrgMembership me, int months) {
        billing.gate(me, VIEW);
        Long orgId = me.orgId();
        int n = Math.max(1, Math.min(MAX_MONTHS, months));
        YearMonth now = YearMonth.now(clock.withZone(ZoneOffset.UTC));
        YearMonth first = now.minusMonths(n - 1L);
        int[][] counts = new int[n][3];
        long[] counted = new long[n];
        for (OrgLicenseService.Row r : licenseRows.rowsFor(orgId)) {
            if (r.status() == OrgLicenseService.Status.NONE) continue;
            Long cid = r.consultantId();
            bucket(matchViews.findByOrgIdAndConsultantId(orgId, cid), CwsMatchView::getViewedAt, first, n, counts, 0);
            bucket(prepSessions.findByOrgIdAndConsultantIdOrderByOccurredAtDesc(orgId, cid), CwsPrepSession::getOccurredAt, first, n, counts, 1);
            bucket(applications.findByOrgIdAndConsultantId(orgId, cid), TalentApplication::getCreatedAt, first, n, counts, 2);
        }
        for (Object[] t : counters.trend(orgId, key(first), key(now))) {
            int i = index(String.valueOf(t[0]), first, n);
            if (i >= 0) counted[i] += ((Number) t[1]).longValue();
        }
        List<Month> out = new ArrayList<>();
        for (int i = 0; i < n; i++) out.add(new Month(key(first.plusMonths(i)), counts[i][0], counts[i][1], counts[i][2], counted[i]));
        return new History(out);
    }

    // ---------------------------------------------------------------------------------------------- helpers

    /** The consultant's AI budget used this month, in percent; null when their licence carries no AI (or their seat has no sign-in yet). */
    private Integer aiPercent(Long orgId, Long consultantId) {
        if (licenseGate.aiBudgetCents(orgId, consultantId) <= 0) return null;
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, consultantId).orElse(null);
        if (c == null || c.getMemberId() == null) return null;
        String login = members.findByOrgIdAndId(orgId, c.getMemberId()).map(m -> m.getUserId()).flatMap(users::findById).map(u -> u.getLogin()).orElse(null);
        if (login == null) return null;
        AiBudgetService.Usage u = aiBudget.usage(login);
        return "budget".equals(u.metered()) ? u.used() : null;
    }

    private String label(String featureKey, Map<String, String> labels) {
        return labels.computeIfAbsent(featureKey, k -> definitions.findByFeatureKey(k).map(FeatureDefinition::getName).orElse(k));
    }

    private static FeatureTotal total(String key, String label, List<ConsultantUsage> rows, java.util.function.ToIntFunction<ConsultantUsage> of) {
        long used = 0;
        int who = 0;
        for (ConsultantUsage u : rows) {
            int v = of.applyAsInt(u);
            used += v;
            if (v > 0) who++;
        }
        return new FeatureTotal(key, label, used, null, who);
    }

    /** A {@code YYYY-MM} period within the last {@link #MAX_MONTHS} months; anything else (blank, future, malformed) is the current month. */
    static YearMonth month(String period, YearMonth now) {
        if (period == null || period.isBlank()) return now;
        try {
            YearMonth m = YearMonth.parse(period.trim());
            if (m.isAfter(now) || m.isBefore(now.minusMonths(MAX_MONTHS - 1L))) return now;
            return m;
        } catch (DateTimeParseException e) {
            return now;
        }
    }

    static String key(YearMonth m) {
        return String.format("%04d-%02d", m.getYear(), m.getMonthValue());
    }

    private static int index(String key, YearMonth first, int n) {
        try {
            YearMonth m = YearMonth.parse(key);
            long i = java.time.temporal.ChronoUnit.MONTHS.between(first, m);
            return i >= 0 && i < n ? (int) i : -1;
        } catch (DateTimeParseException e) {
            return -1;
        }
    }

    private static <T> int count(List<T> rows, Function<T, Instant> at, Instant from, Instant to) {
        int n = 0;
        for (T r : rows) {
            Instant t = at.apply(r);
            if (t != null && !t.isBefore(from) && t.isBefore(to)) n++;
        }
        return n;
    }

    private static <T> void bucket(List<T> rows, Function<T, Instant> at, YearMonth first, int n, int[][] counts, int col) {
        for (T r : rows) {
            Instant t = at.apply(r);
            if (t == null) continue;
            LocalDate d = t.atZone(ZoneOffset.UTC).toLocalDate();
            long i = java.time.temporal.ChronoUnit.MONTHS.between(first, YearMonth.from(d));
            if (i >= 0 && i < n) counts[(int) i][col]++;
        }
    }
}
