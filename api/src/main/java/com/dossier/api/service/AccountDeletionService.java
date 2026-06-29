package com.dossier.api.service;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.repository.ResumeRepository;
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

    public AccountDeletionService(
        BioRepository bioRepository,
        ResumeRepository resumeRepository,
        ApplicationRepository applicationRepository,
        AiAnswerRepository aiAnswerRepository,
        FieldCacheRepository fieldCacheRepository,
        ResumeStorageService storageService,
        UserService userService,
        UserRepository userRepository,
        RefreshTokenService refreshTokenService
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
        userRepository.findOneByLogin(login).map(User::getId).ifPresent(refreshTokenService::deleteAllForUser);
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
        userService.deleteUser(login);

        LOG.info("Admin deleted account and all data for user: {}", login);
    }
}
