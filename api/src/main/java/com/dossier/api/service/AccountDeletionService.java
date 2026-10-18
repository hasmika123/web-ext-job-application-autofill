package com.dossier.api.service;

import com.dossier.api.domain.privacy.AccountDeletionReport;
import com.dossier.api.repository.privacy.AccountDeletionReportRepository;
import com.dossier.api.service.privacy.ErasureCensus;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.AdminMfaChallengeRepository;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.BugReportRepository;
import com.dossier.api.repository.SalesInquiryRepository;
import com.dossier.api.repository.CustomerNoteRepository;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.StripeEventRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.inbox.InboxService;
import com.dossier.api.service.org.OrgMembershipPrivacyService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    private final FileStorage storageService;
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
    private final StripeEventRepository stripeEventRepository;
    private final CustomerNoteRepository customerNoteRepository;
    private final ResumeBuilderDataService resumeBuilderDataService;
    private final OrgMembershipPrivacyService orgMembershipPrivacyService;
    private final TrackerDataService trackerDataService;
    private final com.dossier.api.service.jobs.JobSearchDataService jobSearchDataService;
    private final com.dossier.api.repository.ExtConnectCodeRepository extConnectCodeRepository;
    private final BugReportRepository bugReportRepository;
    private final SalesInquiryRepository salesInquiryRepository;
    private final AiQuotaOverrideRepository aiQuotaOverrideRepository;
    private final AdminMfaChallengeRepository adminMfaChallengeRepository;
    private final ErasureCensus census;
    private final AccountDeletionReportRepository reports;
    private final ObjectMapper json;

    private com.dossier.api.repository.sub.InvoiceRepository invoiceRepository;
    private com.dossier.api.repository.sub.InvoiceLineRepository invoiceLineRepository;

    private com.dossier.api.service.billing.personal.PersonalBillingErasure personalBillingErasure;

    /** Optional: removes the add-on rows, change records and quotes that hold non-cascading keys to the subscription row (subscription-merge). */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setPersonalBillingErasure(com.dossier.api.service.billing.personal.PersonalBillingErasure erasure) {
        this.personalBillingErasure = erasure;
    }

    /** Optional (K8.3): the invoice mirror's repositories, to pseudonymise a deleted account's invoices. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setInvoiceRepositories(com.dossier.api.repository.sub.InvoiceRepository invoices, com.dossier.api.repository.sub.InvoiceLineRepository lines) {
        this.invoiceRepository = invoices;
        this.invoiceLineRepository = lines;
    }

    @PersistenceContext
    private EntityManager em;

    public AccountDeletionService(
        BioRepository bioRepository,
        ResumeRepository resumeRepository,
        ApplicationRepository applicationRepository,
        AiAnswerRepository aiAnswerRepository,
        FieldCacheRepository fieldCacheRepository,
        FileStorage storageService,
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
        NotificationService notificationService,
        StripeEventRepository stripeEventRepository,
        CustomerNoteRepository customerNoteRepository,
        ResumeBuilderDataService resumeBuilderDataService,
        OrgMembershipPrivacyService orgMembershipPrivacyService,
        TrackerDataService trackerDataService,
        com.dossier.api.service.jobs.JobSearchDataService jobSearchDataService,
        com.dossier.api.repository.ExtConnectCodeRepository extConnectCodeRepository,
        BugReportRepository bugReportRepository,
        SalesInquiryRepository salesInquiryRepository,
        AiQuotaOverrideRepository aiQuotaOverrideRepository,
        AdminMfaChallengeRepository adminMfaChallengeRepository,
        ErasureCensus census,
        AccountDeletionReportRepository reports,
        ObjectMapper json
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
        this.stripeEventRepository = stripeEventRepository;
        this.customerNoteRepository = customerNoteRepository;
        this.resumeBuilderDataService = resumeBuilderDataService;
        this.orgMembershipPrivacyService = orgMembershipPrivacyService;
        this.trackerDataService = trackerDataService;
        this.jobSearchDataService = jobSearchDataService;
        this.extConnectCodeRepository = extConnectCodeRepository;
        this.bugReportRepository = bugReportRepository;
        this.salesInquiryRepository = salesInquiryRepository;
        this.aiQuotaOverrideRepository = aiQuotaOverrideRepository;
        this.adminMfaChallengeRepository = adminMfaChallengeRepository;
        this.census = census;
        this.reports = reports;
        this.json = json;
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
        // Admin notes and the billing timeline (9.C1): notes go with the account; webhook events
        // stay as a record of what Stripe sent but stop pointing at the person.
        customerNoteRepository.deleteAllByUserId(userId);
        // K8.3: invoices are a financial record (kept 7 years): the link to the person is cut (user id becomes 0), the lines and amounts stay
        if (invoiceRepository != null) invoiceRepository.pseudonymise(userId);
        if (invoiceLineRepository != null) invoiceLineRepository.pseudonymise(userId);
        // subscription-merge: add-on rows, change records and quotes hold non-cascading keys to the subscription row, so they go before it; the rest of the
        // personal billing tables (grants, usage ledger, locks, notices, retirement items) cascade from the user row
        if (personalBillingErasure != null) personalBillingErasure.eraseFor(userId);
        String customerId = subscriptionRepository.findOneByUserId(userId).map(Subscription::getStripeCustomerId).orElse(null);
        stripeEventRepository.forget(userId, customerId);
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
     * same login must not inherit them — and the call ledger keeps its spend but loses the login. The other login-keyed rows go here too (see below).
     */
    private void forgetAiUsage(Long userId, String login) {
        aiUsageRepository.deleteByLoginValue(login);
        aiCallRepository.anonymize(login);
        // B2 (T1.3, data map): the rows keyed by login or id with no foreign key, which the map found nobody erased. Bug reports and contact-us
        // messages are the person's own free text; an admin-set AI quota must not be inherited by a new account on the same login; a pending admin
        // sign-in challenge names the account.
        bugReportRepository.deleteByUserLogin(login);
        salesInquiryRepository.deleteByUserLogin(login);
        aiQuotaOverrideRepository.deleteByLoginValue(login);
        if (userId != null) adminMfaChallengeRepository.deleteByUserIdValue(userId);
    }

    /** Erase the current user's data and account. Idempotent per session: a second call
     *  401s because the principal no longer resolves. Immediate, with no undo window; writes a purge report. */
    public void deleteCurrentUserAccount() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        withReport(login, "IMMEDIATE", null, this::eraseCurrentUserNow);
    }

    private void eraseCurrentUserNow() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );

        // Resume Builder rows first (R0.1): documents reference their resume, and clearing them
        // before the resumes load keeps no stale builder entity in the session.
        // That call also removes EVERY stored file the user owns (resume uploads and built PDFs, originals, photos,
        // thumbnails, application attachments) by prefix, before any row goes.
        userRepository.findOneByLogin(login).map(User::getId).ifPresent(resumeBuilderDataService::deleteAllForUser);
        resumeBuilderDataService.deleteSharingAsViewer(login); // grants made to this user + views that name them (R3.11)

        // Resume files live in object storage — delete the blobs BEFORE their rows so a
        // storage failure rolls the whole transaction back (no orphaned bytes, no
        // half-deleted account).
        List<Resume> resumes = resumeRepository.findByUserIsCurrentUser();
        for (Resume resume : resumes) {
            String key = resume.getr2ObjectKey();
            if (key != null && !key.isBlank() && com.dossier.api.service.storage.StorageKeys.isUserKey(resume.getUser() == null ? null : resume.getUser().getId(), key)) { // never delete an object outside this account's own prefixes
                storageService.delete(key);
            }
        }

        // Child rows first (FK user_id), then the user.
        resumeRepository.deleteAll(resumes);
        bioRepository.deleteAll(bioRepository.findByUserIsCurrentUser());
        // The tracker's events, notes and interviews hang off the applications (and the user): erase them first.
        userRepository.findOneByLogin(login).map(User::getId).ifPresent(trackerDataService::deleteAllForUser);
        List<Application> applications = applicationRepository.findByUserIsCurrentUser();
        deleteAttachmentBlobs(applications);
        applicationRepository.deleteAll(applications);
        aiAnswerRepository.deleteAll(aiAnswerRepository.findByUserIsCurrentUser());
        fieldCacheRepository.deleteAll(fieldCacheRepository.findByUserIsCurrentUser());
        // Refresh tokens are keyed by user id (the FK also cascades on user delete, but
        // remove them explicitly so the erasure is deterministic and self-contained).
        userRepository
            .findOneByLogin(login)
            .map(User::getId)
            .ifPresent(id -> {
                refreshTokenService.deleteAllForUser(id);
                extConnectCodeRepository.deleteByUserId(id);
                profileSuggestionService.deleteAllForUser(id);
                resumeMatchService.deleteAllForUser(id);
                jobFitService.deleteAllForUser(id);
                resumeTailorService.deleteAllForUser(id);
                jobMatchService.deleteAllForUser(id);
                jobSearchDataService.deleteAllForUser(id);
                inboxService.deleteAllForUser(id);
                notificationService.deleteAllForUser(id);
                orgMembershipPrivacyService.eraseFor(id, login); // org seats are anonymised before the user row goes (tenant-model.md section 6)
                forgetAiUsage(id, login);
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
        deleteUserAccountByLogin(login, "ADMIN", null);
    }

    /**
     * The same erasure with its provenance for the purge report: {@code source} is SELF or ADMIN (an erasure that waited out its undo window),
     * ADMIN (an administrator's immediate erase) or RETENTION (an enterprise account past its retention); {@code requestedAt} is when it was asked for, or null.
     */
    public void deleteUserAccountByLogin(String login, String source, Instant requestedAt) {
        withReport(login, source, requestedAt, () -> eraseByLoginNow(login));
    }

    private void eraseByLoginNow(String login) {
        User user = userRepository
            .findOneByLogin(login)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
        Long userId = user.getId();

        resumeBuilderDataService.deleteAllForUser(userId); // before the resumes (and removes every stored file): see deleteCurrentUserAccount
        resumeBuilderDataService.deleteSharingAsViewer(login);

        List<Resume> resumes = resumeRepository.findByUserId(userId);
        for (Resume resume : resumes) {
            String key = resume.getr2ObjectKey();
            if (key != null && !key.isBlank() && com.dossier.api.service.storage.StorageKeys.isUserKey(resume.getUser() == null ? null : resume.getUser().getId(), key)) { // never delete an object outside this account's own prefixes
                storageService.delete(key);
            }
        }

        resumeRepository.deleteAll(resumes);
        bioRepository.deleteAll(bioRepository.findByUserId(userId));
        trackerDataService.deleteAllForUser(userId); // events, notes, interviews: before the applications they hang off
        List<Application> applications = applicationRepository.findByUserId(userId);
        deleteAttachmentBlobs(applications);
        applicationRepository.deleteAll(applications);
        aiAnswerRepository.deleteAll(aiAnswerRepository.findByUserId(userId));
        fieldCacheRepository.deleteAll(fieldCacheRepository.findByUserId(userId));
        refreshTokenService.deleteAllForUser(userId);
        extConnectCodeRepository.deleteByUserId(userId);
        profileSuggestionService.deleteAllForUser(userId);
        resumeMatchService.deleteAllForUser(userId);
        jobFitService.deleteAllForUser(userId);
        resumeTailorService.deleteAllForUser(userId);
        jobMatchService.deleteAllForUser(userId);
        jobSearchDataService.deleteAllForUser(userId);
        inboxService.deleteAllForUser(userId);
        notificationService.deleteAllForUser(userId);
        orgMembershipPrivacyService.eraseFor(userId, login);
        forgetAiUsage(userId, login);
        endBilling(userId);
        userService.deleteUser(login);

        LOG.info("Admin deleted account and all data for user: {}", login);
    }

    /**
     * Erases ONE enterprise account of organization {@code orgId} (decision O4, phase S8): the retention job and an administrator's erase request.
     * Same guarantees as {@link #deleteUserAccountByLogin} (it is that path), but the target is named by id AND organization, and the account must
     * really be that organization's enterprise account: a personal account, or one of another organization, is the generic 404 and nothing is touched.
     * Only this account's rows go; a personal account (or another organization's account) with the same email is a different row and stays whole.
     * Returns nothing: the caller has already written its audit row.
     */
    public void deleteEnterpriseAccount(Long orgId, Long userId) {
        User user = userId == null || orgId == null ? null : userRepository.findById(userId).orElse(null);
        if (user == null || !orgId.equals(user.getOrgId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user");
        }
        deleteUserAccountByLogin(user.getLogin(), "RETENTION", null);
    }

    /**
     * Runs one erasure and writes its purge report in the same transaction (so the report exists exactly when the erasure committed). Before the erasure it
     * counts what the account holds, per table of the data map and per file prefix; after it (rows flushed) it counts again. The difference is what was
     * removed; anything still counted is residue, and the report is marked so an administrator looks at it. The report holds counts only, never the
     * login, e-mail or name, and refers to the account by its former numeric id.
     */
    private void withReport(String login, String source, Instant requestedAt, Runnable erase) {
        User user = userRepository.findOneByLogin(login).orElse(null);
        if (user == null) {
            erase.run(); // unknown account: the erasure itself answers (404 / 401) exactly as before
            return;
        }
        Long id = user.getId();
        Long orgId = user.getOrgId();
        Map<String, Long> before = census.take(id, login);
        erase.run();
        em.flush();
        Map<String, Long> after = census.take(id, login);
        Map<String, Long> removed = new LinkedHashMap<>();
        before.forEach((table, n) -> removed.put(table, n - after.getOrDefault(table, 0L)));
        removed.values().removeIf(n -> n <= 0);
        int residue = (int) after.values().stream().mapToLong(Long::longValue).sum();

        Map<String, Object> steps = new LinkedHashMap<>();
        steps.put("removed", removed);
        if (!after.isEmpty()) steps.put("residue", after);
        String text;
        try {
            text = json.writeValueAsString(steps);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            text = "{}";
        }
        AccountDeletionReport report = new AccountDeletionReport();
        report.setSubjectRef(id);
        report.setAccountKind(orgId == null ? "PERSONAL" : "ENTERPRISE");
        report.setOrgId(orgId);
        report.setSource(source);
        report.setStatus(residue == 0 ? AccountDeletionReport.COMPLETE : AccountDeletionReport.RESIDUE);
        report.setRequestedAt(requestedAt);
        report.setExecutedAt(Instant.now());
        report.setResidueCount(residue);
        report.setSteps(text.length() > 4000 ? text.substring(0, 4000) : text);
        reports.save(report);
        if (residue > 0) LOG.warn("Erasure of account {} left {} row(s) behind: {}", id, residue, after);
    }

    /** Application attachments are files too: remove their bytes via the storage seam before the rows go. */
    private void deleteAttachmentBlobs(List<Application> applications) {
        for (Application application : applications) {
            String key = application.getAttachmentObjectKey();
            if (key != null && !key.isBlank()) {
                storageService.delete(key);
            }
        }
    }
}
