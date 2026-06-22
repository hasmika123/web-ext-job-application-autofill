package com.dossier.api.service;

import com.dossier.api.domain.Resume;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.repository.ResumeRepository;
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

    public AccountDeletionService(
        BioRepository bioRepository,
        ResumeRepository resumeRepository,
        ApplicationRepository applicationRepository,
        AiAnswerRepository aiAnswerRepository,
        FieldCacheRepository fieldCacheRepository,
        ResumeStorageService storageService,
        UserService userService
    ) {
        this.bioRepository = bioRepository;
        this.resumeRepository = resumeRepository;
        this.applicationRepository = applicationRepository;
        this.aiAnswerRepository = aiAnswerRepository;
        this.fieldCacheRepository = fieldCacheRepository;
        this.storageService = storageService;
        this.userService = userService;
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
        userService.deleteUser(login);

        LOG.info("Deleted account and all data for user: {}", login);
    }
}
