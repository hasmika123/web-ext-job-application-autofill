package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.UsageCounter;
import com.dossier.api.domain.ent.consultantws.CwsMatchView;
import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.ent.billing.UsageCounterRepository;
import com.dossier.api.repository.ent.consultantws.CwsMatchViewRepository;
import com.dossier.api.repository.ent.consultantws.CwsPrepSessionRepository;
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
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Feature Usage (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1a, OBL-04 reads): what each licensed consultant really used in a month. The counts
 * come from the same rows as the consultant's own My Features page: job-match views, interview-prep sessions, applications tracked. The AI budget
 * is shown as a percent and never in dollars, for the current month only, where the licence carries AI: per consultant, and for the whole
 * organization ({@code aiBudgetPercent}: what its enterprise accounts spent this month against the sum of their licences' AI budgets, gap D7). Only
 * enterprise accounts count: a personal login's AI is never the organization's (decision 2026-11-15). Where {@code usage_counter} has rows
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

    public record Usage(String period, boolean current, LocalDate resetsOn, List<ConsultantUsage> consultants, List<FeatureTotal> features, Integer aiBudgetPercent) {
        public Usage(String period, boolean current, LocalDate resetsOn, List<ConsultantUsage> consultants, List<FeatureTotal> features) {
            this(period, current, resetsOn, consultants, features, null);
        }
    }

    public record Month(String period, int matchViews, int prepSessions, int applications, long counted) {}

    public record History(List<Month> months) {}

    private final OrgBillingReadService billing;
    private final OrgLicenseService licenseRows;
    private final OrgLicenseGate licenseGate;
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
        this.members = members;
        this.users = users;
        this.matchViews = matchViews;
        this.prepSessions = prepSessions;
        this.applications = applications;
        this.counters = counters;
        this.definitions = definitions;
        this.aiBudget = aiBudget;
    }

    private com.dossier.api.repository.AiCallRepository aiCalls;

    /** Optional (gap D7): the AI ledger, for the organization's AI spend this month. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setAiCalls(com.dossier.api.repository.AiCallRepository aiCalls) {
        this.aiCalls = aiCalls;
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

        List<OrgLicenseService.UsageRow> licensed = licenseRows.usageRows(orgId);
        List<Long> consultantIds = licensed.stream().map(OrgLicenseService.UsageRow::consultantId).toList();
        Map<Long, Integer> viewCounts = currentCounts(consultantIds.isEmpty() ? List.of() : matchViews.countByOrgIdAndConsultantIdInAndViewedAtBetween(orgId, consultantIds, from, to));
        Map<Long, Integer> prepCounts = currentCounts(consultantIds.isEmpty() ? List.of() : prepSessions.countByOrgIdAndConsultantIdInAndOccurredAtBetween(orgId, consultantIds, from, to));
        Map<Long, Integer> applicationCounts = currentCounts(consultantIds.isEmpty() ? List.of() : applications.countByOrgIdAndConsultantIdInAndCreatedAtBetween(orgId, consultantIds, from, to));
        Map<Long, List<UsageCounter>> countersByConsultant = new HashMap<>();
        if (!consultantIds.isEmpty()) {
            for (UsageCounter c : counters.findByOrgIdAndConsultantIdInAndPeriodKey(orgId, consultantIds, key(month))) {
                countersByConsultant.computeIfAbsent(c.getConsultantId(), ignored -> new ArrayList<>()).add(c);
            }
        }
        Instant nowInstant = Instant.now(clock);
        Map<Long, Long> aiBudgets = aiBudgets(orgId, licensed, current, nowInstant);
        Map<Long, String> logins = current ? enterpriseLogins(orgId, licensed) : Map.of();
        Map<String, Long> aiSpend = current ? aiSpend(logins.values(), from) : Map.of();

        List<ConsultantUsage> rows = new ArrayList<>(licensed.size());
        for (OrgLicenseService.UsageRow r : licensed) {
            Long cid = r.consultantId();
            List<Counter> cs = new ArrayList<>();
            for (UsageCounter c : countersByConsultant.getOrDefault(cid, List.of())) {
                cs.add(new Counter(c.getFeatureKey(), label(c.getFeatureKey(), labels), c.getUsed() == null ? 0 : c.getUsed(), c.getAllowance()));
            }
            Integer aiPercent = current ? aiPercent(r, aiBudgets, logins, aiSpend) : null;
            rows.add(new ConsultantUsage(cid, r.name(), aiPercent, viewCounts.getOrDefault(cid, 0), prepCounts.getOrDefault(cid, 0), applicationCounts.getOrDefault(cid, 0), cs));
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
        return new Usage(key(month), current, month.plusMonths(1).atDay(1), rows, totals, current ? orgAiPercent(orgId, rows, aiBudgets, from) : null);
    }

    /** The organization's AI spend since {@code from} against the sum of its licensed consultants' AI budgets, in percent; null with no AI budget. */
    private Integer orgAiPercent(Long orgId, List<ConsultantUsage> rows, Map<Long, Long> aiBudgets, Instant from) {
        if (aiCalls == null) return null;
        long budgetCents = 0;
        for (ConsultantUsage u : rows) budgetCents += Math.max(0, aiBudgets.getOrDefault(u.consultantId(), 0L));
        if (budgetCents <= 0) return null;
        long spentMicros = aiCalls.orgCostSince(orgId, from);
        return (int) Math.min(100, Math.round(spentMicros * 100.0 / (budgetCents * 10_000.0)));
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
        List<Long> consultantIds = licenseRows.usageRows(orgId).stream().map(OrgLicenseService.UsageRow::consultantId).toList();
        Instant from = first.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant to = now.plusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        if (!consultantIds.isEmpty()) {
            bucket(
                matchViews.findByOrgIdAndConsultantIdInAndViewedAtGreaterThanEqualAndViewedAtLessThan(orgId, consultantIds, from, to),
                CwsMatchView::getViewedAt,
                first,
                n,
                counts,
                0
            );
            bucket(
                prepSessions.findByOrgIdAndConsultantIdInAndOccurredAtGreaterThanEqualAndOccurredAtLessThan(orgId, consultantIds, from, to),
                CwsPrepSession::getOccurredAt,
                first,
                n,
                counts,
                1
            );
            bucket(
                applications.findByOrgIdAndConsultantIdInAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(orgId, consultantIds, from, to),
                TalentApplication::getCreatedAt,
                first,
                n,
                counts,
                2
            );
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

    private Map<Long, Long> aiBudgets(Long orgId, List<OrgLicenseService.UsageRow> licensed, boolean current, Instant now) {
        if (!current || licensed.isEmpty()) return Map.of();
        List<Long> ids = licensed.stream().map(OrgLicenseService.UsageRow::consultantId).toList();
        Map<Long, Long> budgets = licenseGate.aiBudgetCents(orgId, ids, now);
        // Plain unit tests may use an older mock of the gate; retain a deterministic fallback while production uses the batch method.
        if (budgets.size() < ids.size()) {
            Map<Long, Long> complete = new HashMap<>(budgets);
            for (Long id : ids) complete.putIfAbsent(id, Math.max(0, licenseGate.aiBudgetCents(orgId, id)));
            return complete;
        }
        return budgets;
    }

    private Map<Long, String> enterpriseLogins(Long orgId, List<OrgLicenseService.UsageRow> licensed) {
        Set<Long> memberIds = new HashSet<>();
        for (OrgLicenseService.UsageRow row : licensed) if (row.memberId() != null) memberIds.add(row.memberId());
        if (memberIds.isEmpty()) return Map.of();

        Map<Long, Long> userByMember = new HashMap<>();
        for (var member : members.findByOrgIdAndIdIn(orgId, memberIds)) userByMember.put(member.getId(), member.getUserId());
        if (userByMember.isEmpty()) return Map.of();

        Set<Long> userIds = new HashSet<>();
        for (Long userId : userByMember.values()) if (userId != null) userIds.add(userId);
        if (userIds.isEmpty()) return Map.of();
        Map<Long, String> loginByUser = new HashMap<>();
        for (var user : users.findAllById(userIds)) loginByUser.put(user.getId(), user.getLogin());
        Map<Long, String> out = new HashMap<>();
        for (OrgLicenseService.UsageRow row : licensed) {
            Long userId = row.memberId() == null ? null : userByMember.get(row.memberId());
            String login = userId == null ? null : loginByUser.get(userId);
            if (login != null && com.dossier.api.config.Constants.isEnterpriseLogin(login)) out.put(row.consultantId(), login);
        }
        return out;
    }

    private Map<String, Long> aiSpend(Collection<String> logins, Instant from) {
        if (aiCalls == null || logins.isEmpty()) return Map.of();
        Map<String, Long> out = new HashMap<>();
        for (Object[] row : aiCalls.costSinceByLogin(new HashSet<>(logins), from)) out.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        return out;
    }

    /** The consultant's AI budget used this month, in percent; null when their licence carries no AI or the seat is not enterprise-linked. */
    private Integer aiPercent(OrgLicenseService.UsageRow row, Map<Long, Long> budgets, Map<Long, String> logins, Map<String, Long> spend) {
        long budgetCents = Math.max(0, budgets.getOrDefault(row.consultantId(), 0L));
        String login = logins.get(row.consultantId());
        if (budgetCents <= 0 || login == null) return null;
        if (aiCalls != null) return percent(spend.getOrDefault(login, 0L), budgetCents);
        AiBudgetService.Usage u = aiBudget.usage(login);
        return "budget".equals(u.metered()) ? u.used() : null;
    }

    private static int percent(long spentMicros, long budgetCents) {
        long budgetMicros = budgetCents * 10_000L;
        if (budgetMicros <= 0) return 100;
        return (int) Math.min(100L, Math.max(0L, spentMicros * 100L / budgetMicros));
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

    private static Map<Long, Integer> currentCounts(List<Object[]> grouped) {
        Map<Long, Integer> out = new HashMap<>();
        for (Object[] row : grouped) out.put(((Number) row[0]).longValue(), ((Number) row[1]).intValue());
        return out;
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
