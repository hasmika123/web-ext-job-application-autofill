package com.dossier.api.service;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
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
        Billing billing
    ) {}

    private final UserRepository userRepository;
    private final BioRepository bioRepository;
    private final ResumeRepository resumeRepository;
    private final ApplicationRepository applicationRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final StripeProperties stripeProperties;

    public AdminAnalyticsService(
        UserRepository userRepository,
        BioRepository bioRepository,
        ResumeRepository resumeRepository,
        ApplicationRepository applicationRepository,
        RefreshTokenRepository refreshTokenRepository,
        SubscriptionRepository subscriptionRepository,
        StripeProperties stripeProperties
    ) {
        this.userRepository = userRepository;
        this.bioRepository = bioRepository;
        this.resumeRepository = resumeRepository;
        this.applicationRepository = applicationRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.stripeProperties = stripeProperties;
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
            billing(now)
        );
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
