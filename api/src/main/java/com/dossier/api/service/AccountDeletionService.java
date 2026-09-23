package com.dossier.api.service;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.inbox.InboxService;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * GDPR/CCPA "delete my account and all my data" (1.11 pre-launch gate).
 *
 * Removes everything the authenticated user owns — resume files in object storage, then
 * all of their DB rows (resumes, bio, applications, AI answers, field cache), then the
 * user account itself. It runs in a single transaction so the account survives a failure
 * (e.g. object storage unreachable) intact rather than leaving a half-deleted account:
 * blobs are deleted first, so a storage error aborts before any row is removed.
 */
@Service
@Transactional
public class AccountDeletionService {

    private static final Logger LOG = LoggerFactory.getLogger(AccountDeletionService.class);

    private final BioRepository bioRepository;
    private final ResumeRepository resumeRepository;
    private final ApplicationRepository applicationRepository;
    private final AiAnswerRepository aiAnswerRepository;
    private final FieldCacheRepository fieldCacheRepository;
    private final ResumeStorageService storageService;
    private final UserService userService;
    private final UserRepository userRepository;
    private final RefreshTokenService refreshTokenService;
    private final SubscriptionRepository subscriptionRepository;
    private final StripeGateway stripeGateway;
    private final ProfileSuggestionService profileSuggestionService;
    private final AiUsageRepository aiUsageRepository;
    private final AiCallRepository aiCallRepository;
    private final ResumeMatchService resumeMatchService;
    private final JobFitService jobFitService;
    private final ResumeTailorService resumeTailorService;
    private final JobMatchService jobMatchService;
    private final InboxService inboxService;
    private final NotificationService notificationService;

    public AccountDeletionService(
        BioRepository bioRepository,
        ResumeRepository resumeRepository,
        ApplicationRepository applicationRepository,
        AiAnswerRepository aiAnswerRepository,
        FieldCacheRepository fieldCacheRepository,
        ResumeStorageService storageService,
        UserService userService,
        UserRepository userRepository,
        RefreshTokenService refreshTokenService,
        SubscriptionRepository subscriptionRepository,
        StripeGateway stripeGateway,
        ProfileSuggestionService profileSuggestionService,
        AiUsageRepository aiUsageRepository,
        AiCallRepository aiCallRepository,
        ResumeMatchService resumeMatchService,
        JobFitService jobFitService,
        ResumeTailorService resumeTailorService,
        JobMatchService jobMatchService,
        InboxService inboxService,
        NotificationService notificationService
    ) {
        this.bioRepository = bioRepository;
        this.resumeRepository = resumeRepository;
        this.applicationRepository = applicationRepository;
        this.aiAnswerRepository = aiAnswerRepository;
        this.fieldCacheRepository = fieldCacheRepository;
        this.storageService = storageService;
        this.userService = userService;
        this.userRepository = userRepository;
        this.refreshTokenService = refreshTokenService;
        this.subscriptionRepository = subscriptionRepository;
        this.stripeGateway = stripeGateway;
        this.profileSuggestionService = profileSuggestionService;
        this.aiUsageRepository = aiUsageRepository;
        this.aiCallRepository = aiCallRepository;
        this.resumeMatchService = resumeMatchService;
        this.jobFitService = jobFitService;
        this.resumeTailorService = resumeTailorService;
        this.jobMatchService = jobMatchService;
        this.inboxService = inboxService;
        this.notificationService = notificationService;
    }

    /**
     * End the user's billing before their account goes.
     *
     * <p>Two things at once, in this order. <b>Stripe first:</b> a subscription that outlives its
     * account keeps charging someone with no login left to cancel from, so if Stripe refuses,
     * the deletion aborts (this method is inside the deleting transaction) rather than leaving
     * an orphaned subscription billing a ghost. <b>Then our row:</b> {@code subscription.user_id}
     * is a foreign key with no cascade, so without this the user delete itself fails — which is
     * how account deletion was broken for every user who had ever started a checkout
     * (found in the pre-launch review, 2026-09-22).
     *
     * <p>Stripe keeps its own transaction records regardless, which is what the privacy policy
     * says survives a deletion; nothing about the payment history needs to live here.
     */
    private void endBilling(Long userId) {
        subscriptionRepository
            .findOneByUserId(userId)
            .ifPresent(sub -> {
                String subscriptionId = sub.getStripeSubscriptionId();
                if (subscriptionId != null && stripeGateway.isEnabled()) {
                    stripeGateway.cancelSubscription(subscriptionId);
                    LOG.info("Cancelled Stripe subscription {} ahead of deleting user {}", subscriptionId, userId);
                }
                subscriptionRepository.delete(sub);
            });
    }

    /**
     * AI usage is keyed by login, not user id (13.1a). The monthly counts go — a new account on the
     * same login must not inherit them — and the call ledger keeps its spend but loses the login.
     */
    private void forgetAiUsage(String login) {
        aiUsageRepository.deleteByLoginValue(login);
        aiCallRepository.anonymize(login);
    }

    /** Erase the current user's data and account. Idempotent per session: a second call
     *  401s because the principal no longer resolves. */
    public void deleteCurrentUserAccount() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );

        // Resume files live in object storage — delete the blobs BEFORE their rows so a
        // storage failure rolls the whole transaction back (no orphaned bytes, no
        // half-deleted account).
        List<Resume> resumes = resumeRepository.findByUserIsCurrentUser();
        for (Resume resume : resumes) {
            String key = resume.getr2ObjectKey();
            if (key != null && !key.isBlank()) {
                storageService.delete(key);
            }
        }

        // Child rows first (FK user_id), then the user.
        resumeRepository.deleteAll(resumes);
        bioRepository.deleteAll(bioRepository.findByUserIsCurrentUser());
        applicationRepository.deleteAll(applicationRepository.findByUserIsCurrentUser());
        aiAnswerRepository.deleteAll(aiAnswerRepository.findByUserIsCurrentUser());
        fieldCacheRepository.deleteAll(fieldCacheRepository.findByUserIsCurrentUser());
        // Refresh tokens are keyed by user id (the FK also cascades on user delete, but
        // remove them explicitly so the erasure is deterministic and self-contained).
        userRepository
            .findOneByLogin(login)
            .map(User::getId)
            .ifPresent(id -> {
                refreshTokenService.deleteAllForUser(id);
                profileSuggestionService.deleteAllForUser(id);
                resumeMatchService.deleteAllForUser(id);
                jobFitService.deleteAllForUser(id);
                resumeTailorService.deleteAllForUser(id);
                jobMatchService.deleteAllForUser(id);
                inboxService.deleteAllForUser(id);
                notificationService.deleteAllForUser(id);
                forgetAiUsage(login);
                endBilling(id);
            });
        userService.deleteUser(login);

        LOG.info("Deleted account and all data for user: {}", login);
    }

    /**
     * Admin-initiated GDPR erase of a SPECIFIC user (Phase 9.A1.4). Same guarantees as the
     * self-serve path — blobs first so a storage failure rolls everything back — but scoped by
     * the target user's id rather than the security principal. 404 if the login is unknown.
     */
    public void deleteUserAccountByLogin(String login) {
        User user = userRepository
            .findOneByLogin(login)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
        Long userId = user.getId();

        List<Resume> resumes = resumeRepository.findByUserId(userId);
        for (Resume resume : resumes) {
            String key = resume.getr2ObjectKey();
            if (key != null && !key.isBlank()) {
                storageService.delete(key);
            }
        }

        resumeRepository.deleteAll(resumes);
        bioRepository.deleteAll(bioRepository.findByUserId(userId));
        applicationRepository.deleteAll(applicationRepository.findByUserId(userId));
        aiAnswerRepository.deleteAll(aiAnswerRepository.findByUserId(userId));
        fieldCacheRepository.deleteAll(fieldCacheRepository.findByUserId(userId));
        refreshTokenService.deleteAllForUser(userId);
        profileSuggestionService.deleteAllForUser(userId);
        resumeMatchService.deleteAllForUser(userId);
        jobFitService.deleteAllForUser(userId);
        resumeTailorService.deleteAllForUser(userId);
        jobMatchService.deleteAllForUser(userId);
        inboxService.deleteAllForUser(userId);
        notificationService.deleteAllForUser(userId);
        forgetAiUsage(login);
        endBilling(userId);
        userService.deleteUser(login);

        LOG.info("Admin deleted account and all data for user: {}", login);
    }
}
