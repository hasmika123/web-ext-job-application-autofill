package com.dossier.api.service;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.FillEventRepository;
import com.dossier.api.repository.FillQualityRow;
import com.dossier.api.repository.RefreshTokenRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.billing.StripeProperties;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Business-analytics aggregates for the admin overview (Phase 9.A3). All read-only DB counts.
 *
 * Note on "active users": there is no dedicated login-event table, so this uses session activity
 * (distinct users with a refresh token issued in the window) as the proxy — labelled as such in
 * the UI. The web app rotates refresh tokens while a user is active, so recent token activity
 * tracks real usage reasonably well.
 */
@Service
@Transactional(readOnly = true)
public class AdminAnalyticsService {

    /** Acquisition → activation → setup → applied. Each value is a user count. */
    public record Funnel(long signedUp, long activated, long withProfile, long startedApplying, long applied) {}

    /**
     * Fill quality for one ATS family over the last {@link #FILL_WINDOW_DAYS} days (Phase 10.1).
     *
     * @param fillRatePct       of the fields the engine found, how many it filled
     * @param gapRatePct        fills that left at least one REQUIRED field empty — the failure a
     *                          user actually feels, so the panel ranks by it
     * @param correctionRatePct of the fields filled, how many the user changed afterwards
     * @param genericPct        fills handled by the generic scanner, i.e. no dedicated adapter
     */
    public record FillQuality(
        String ats,
        long fills,
        int fillRatePct,
        int gapRatePct,
        int correctionRatePct,
        int genericPct,
        long fieldsFailed
    ) {}

    static final int FILL_WINDOW_DAYS = 30;

    /** Stripe's status for a subscription whose latest charge failed and is being retried. */
    private static final String STATUS_PAST_DUE = "past_due";

    /**
     * Revenue, from the {@code subscription} mirror (Phase 12.5).
     *
     * <p>{@code activePro} uses the same rule the product gates on, so this card can never claim
     * revenue from someone who is being served Free. {@code monthlyCount + threeMonthCount} can be
     * less than {@code activePro} when a row carries a price we no longer recognise (an old price,
     * or a subscription created before these ids were configured); those contribute nothing to
     * MRR, and the gap is shown rather than hidden.
     *
     * @param mrr normalised monthly revenue — the 3-month plan counts as a third of its price
     */
    public record Billing(
        long activePro,
        long monthlyCount,
        long threeMonthCount,
        BigDecimal mrr,
        long newThisMonth,
        long churnedThisMonth,
        long pastDue
    ) {}

    public record AnalyticsOverview(
        long totalUsers,
        long activatedUsers,
        int activationRatePct,
        long signups7d,
        long signups30d,
        long activeUsers7d,
        long activeUsers30d,
        long totalResumes,
        long totalApplications,
        Funnel funnel,
        Map<String, Long> applicationsByStatus,
        Billing billing,
        List<FillQuality> fillQuality
    ) {}

    private final UserRepository userRepository;
    private final BioRepository bioRepository;
    private final ResumeRepository resumeRepository;
    private final ApplicationRepository applicationRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final StripeProperties stripeProperties;
    private final FillEventRepository fillEventRepository;

    public AdminAnalyticsService(
        UserRepository userRepository,
        BioRepository bioRepository,
        ResumeRepository resumeRepository,
        ApplicationRepository applicationRepository,
        RefreshTokenRepository refreshTokenRepository,
        SubscriptionRepository subscriptionRepository,
        StripeProperties stripeProperties,
        FillEventRepository fillEventRepository
    ) {
        this.userRepository = userRepository;
        this.bioRepository = bioRepository;
        this.resumeRepository = resumeRepository;
        this.applicationRepository = applicationRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.stripeProperties = stripeProperties;
        this.fillEventRepository = fillEventRepository;
    }

    public AnalyticsOverview overview() {
        Instant now = Instant.now();
        Instant d7 = now.minus(7, ChronoUnit.DAYS);
        Instant d30 = now.minus(30, ChronoUnit.DAYS);

        long total = userRepository.count();
        long activated = userRepository.countByActivatedIsTrue();
        int activationRate = total == 0 ? 0 : (int) Math.round((activated * 100.0) / total);

        long withProfile = bioRepository.count(); // unique user_id ⇒ one bio per user
        long startedApplying = applicationRepository.countDistinctUsers();
        long applied = applicationRepository.countDistinctUsersByStatus(ApplicationStatus.APPLIED);

        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (ApplicationStatus s : ApplicationStatus.values()) {
            byStatus.put(s.name(), applicationRepository.countByStatus(s));
        }

        return new AnalyticsOverview(
            total,
            activated,
            activationRate,
            userRepository.countByCreatedDateAfter(d7),
            userRepository.countByCreatedDateAfter(d30),
            refreshTokenRepository.countDistinctActiveUsersSince(d7),
            refreshTokenRepository.countDistinctActiveUsersSince(d30),
            resumeRepository.count(),
            applicationRepository.count(),
            new Funnel(total, activated, withProfile, startedApplying, applied),
            byStatus,
            billing(now),
            fillQuality(now)
        );
    }

    /**
     * Fill quality per ATS, worst first (Phase 10.1) — the list 10.4's adapter work is taken from.
     * Ranked by how often a fill leaves a required field empty, then by fill rate, then by volume
     * so a bad ATS that many people use outranks an equally bad one that nobody does.
     */
    private List<FillQuality> fillQuality(Instant now) {
        Instant since = now.minus(FILL_WINDOW_DAYS, ChronoUnit.DAYS);
        return fillEventRepository
            .qualityByAtsSince(since)
            .stream()
            .map(AdminAnalyticsService::toFillQuality)
            .sorted(
                Comparator.comparingInt(FillQuality::gapRatePct)
                    .reversed()
                    .thenComparingInt(FillQuality::fillRatePct)
                    .thenComparing(Comparator.comparingLong(FillQuality::fills).reversed())
            )
            .toList();
    }

    static FillQuality toFillQuality(FillQualityRow r) {
        long fills = nz(r.fills());
        return new FillQuality(
            r.ats(),
            fills,
            pct(nz(r.fieldsFilled()), nz(r.fieldsFound())),
            pct(nz(r.fillsWithRequiredGaps()), fills),
            pct(nz(r.userCorrected()), nz(r.fieldsFilled())),
            pct(nz(r.fillsOnGenericAdapter()), fills),
            nz(r.fieldsFailed())
        );
    }

    private static long nz(Long n) {
        return n == null ? 0L : n;
    }

    /** Whole-number percentage; 0 when there is nothing to divide by. */
    private static int pct(long part, long whole) {
        return whole <= 0 ? 0 : (int) Math.round((part * 100.0) / whole);
    }

    /**
     * Revenue from the subscription mirror.
     *
     * <p>Loaded and folded in memory rather than split across five aggregate queries: there is one
     * row per paying user, the Pro rule is a Java predicate that must not be duplicated in SQL, and
     * the whole table is smaller than a single page of applications. If that stops being true, this
     * is the place to notice.
     */
    private Billing billing(Instant now) {
        String monthlyPrice = stripeProperties.getPriceMonthly();
        String threeMonthPrice = stripeProperties.getPrice3mo();
        // Start of the current calendar month, UTC — the same clock the rest of this class uses.
        Instant monthStart = YearMonth.now(ZoneOffset.UTC).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);

        List<Subscription> all = subscriptionRepository.findAll();
        long activePro = 0;
        long monthly = 0;
        long threeMonth = 0;
        long newThisMonth = 0;
        long churnedThisMonth = 0;
        long pastDue = 0;

        for (Subscription sub : all) {
            boolean pro = EntitlementService.isProFor(sub.getStatus(), sub.getCurrentPeriodEnd(), now);
            if (pro) {
                activePro++;
                if (matches(sub.getPriceId(), monthlyPrice)) monthly++;
                else if (matches(sub.getPriceId(), threeMonthPrice)) threeMonth++;
            } else if (endedThisMonth(sub.getCurrentPeriodEnd(), monthStart, now)) {
                // Churn = the paid-for period ran out this month and they are Free now. Cancelling
                // in March for a period that ends in May is not a March loss, and counting it as one
                // would show churn before the revenue had actually stopped.
                churnedThisMonth++;
            }
            if (sub.getCreatedAt() != null && !sub.getCreatedAt().isBefore(monthStart)) newThisMonth++;
            if (STATUS_PAST_DUE.equalsIgnoreCase(trim(sub.getStatus()))) pastDue++;
        }

        BigDecimal mrr = stripeProperties
            .getAmountMonthly()
            .multiply(BigDecimal.valueOf(monthly))
            // A 3-month plan is a third of its price per month. HALF_UP at 2dp because this is
            // money on a dashboard, not an accounting ledger.
            .add(stripeProperties.getAmount3mo().multiply(BigDecimal.valueOf(threeMonth)).divide(BigDecimal.valueOf(3), 2, RoundingMode.HALF_UP))
            .setScale(2, RoundingMode.HALF_UP);

        return new Billing(activePro, monthly, threeMonth, mrr, newThisMonth, churnedThisMonth, pastDue);
    }

    /** A configured price id matches only if it is actually configured — blank matches nothing. */
    private static boolean matches(String priceId, String configured) {
        return configured != null && !configured.isBlank() && configured.equals(priceId);
    }

    private static boolean endedThisMonth(Instant periodEnd, Instant monthStart, Instant now) {
        return periodEnd != null && !periodEnd.isBefore(monthStart) && !periodEnd.isAfter(now);
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
