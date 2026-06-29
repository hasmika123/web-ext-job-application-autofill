package com.dossier.api.service;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.RefreshTokenRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
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
        Map<String, Long> applicationsByStatus
    ) {}

    private final UserRepository userRepository;
    private final BioRepository bioRepository;
    private final ResumeRepository resumeRepository;
    private final ApplicationRepository applicationRepository;
    private final RefreshTokenRepository refreshTokenRepository;

    public AdminAnalyticsService(
        UserRepository userRepository,
        BioRepository bioRepository,
        ResumeRepository resumeRepository,
        ApplicationRepository applicationRepository,
        RefreshTokenRepository refreshTokenRepository
    ) {
        this.userRepository = userRepository;
        this.bioRepository = bioRepository;
        this.resumeRepository = resumeRepository;
        this.applicationRepository = applicationRepository;
        this.refreshTokenRepository = refreshTokenRepository;
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
            byStatus
        );
    }
}
