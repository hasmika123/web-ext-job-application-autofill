package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.mapper.ApplicationMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The user-scoped applications sync surface (Phase 3.0) — the tracker that fills
 * itself as the user applies. Everything here is scoped to the authenticated user;
 * unlike the generated {@code ApplicationResource} (raw id-based CRUD, ADMIN-locked),
 * these operations never expose or touch another user's rows.
 *
 * <p>The headline operation is {@link #upsertApplication}: re-filling the same job
 * updates the same entry instead of piling up duplicates. The dedup key is the
 * ATS-native {@code externalJobId} first, then {@code jobUrl} (the pinned 3.2
 * decision: create a DRAFT on every fill, dedup so the board stays clean).
 */
@Service
@Transactional
public class ApplicationSyncService {

    private static final Logger LOG = LoggerFactory.getLogger(ApplicationSyncService.class);

    private final ApplicationRepository applicationRepository;
    private final ResumeRepository resumeRepository;
    private final UserRepository userRepository;
    private final BioRepository bioRepository;
    private final ApplicationMapper applicationMapper;
    private final ObjectMapper objectMapper;

    public ApplicationSyncService(
        ApplicationRepository applicationRepository,
        ResumeRepository resumeRepository,
        UserRepository userRepository,
        BioRepository bioRepository,
        ApplicationMapper applicationMapper,
        ObjectMapper objectMapper
    ) {
        this.applicationRepository = applicationRepository;
        this.resumeRepository = resumeRepository;
        this.userRepository = userRepository;
        this.bioRepository = bioRepository;
        this.applicationMapper = applicationMapper;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<ApplicationDTO> listApplications() {
        return applicationRepository.findByUserIsCurrentUser().stream().map(applicationMapper::toDto).toList();
    }

    /**
     * Create the application, or update the existing one for the same job (dedup on
     * {@code externalJobId}, falling back to {@code jobUrl}). Server-owned fields
     * ({@code createdAt}/{@code updatedAt}/{@code user}) are filled here; the client
     * never sets them. A re-fill never reverts a further-along status back to DRAFT.
     */
    public ApplicationDTO upsertApplication(ApplicationDTO dto) {
        User user = currentUser();
        Application existing = findDedupMatch(dto);
        Application app = existing != null ? existing : new Application();
        Instant now = Instant.now();

        if (existing == null) {
            app.setUser(user);
            app.setCreatedAt(now);
            app.setStatus(dto.getStatus() != null ? dto.getStatus() : ApplicationStatus.DRAFT);
        } else if (dto.getStatus() != null && !isDraftDowngrade(dto.getStatus(), existing.getStatus())) {
            // Honor an explicit status on a re-fill, but don't revert e.g. APPLIED -> DRAFT.
            app.setStatus(dto.getStatus());
        }

        // Captured job fields — refresh with the latest capture when the client sends them.
        if (dto.getCompany() != null) app.setCompany(dto.getCompany());
        if (dto.getRoleTitle() != null) app.setRoleTitle(dto.getRoleTitle());
        if (dto.getJobUrl() != null) app.setJobUrl(dto.getJobUrl());
        if (dto.getLocation() != null) app.setLocation(dto.getLocation());
        if (dto.getJobType() != null) app.setJobType(dto.getJobType());
        if (dto.getJobMode() != null) app.setJobMode(dto.getJobMode());
        if (dto.getEmail() != null) app.setEmail(dto.getEmail());
        if (dto.getSalary() != null) app.setSalary(dto.getSalary());
        if (dto.getStarred() != null) app.setStarred(dto.getStarred());
        if (dto.getArchived() != null) app.setArchived(dto.getArchived());
        if (dto.getExternalJobId() != null) app.setExternalJobId(dto.getExternalJobId());
        if (dto.getAtsPlatform() != null) app.setAtsPlatform(dto.getAtsPlatform());
        if (dto.getJobDescription() != null) app.setJobDescription(dto.getJobDescription());
        if (dto.getSource() != null) app.setSource(dto.getSource());
        if (dto.getSubmissionConfirmed() != null) app.setSubmissionConfirmed(dto.getSubmissionConfirmed());
        if (dto.getAppliedAt() != null) app.setAppliedAt(dto.getAppliedAt());
        if (dto.getResume() != null && dto.getResume().getId() != null) {
            app.setResume(ownedResume(dto.getResume().getId()));
        }

        // Default the application email to the user's profile email on create (when the client
        // didn't supply one). Existing entries keep whatever they already have.
        if (existing == null && isBlank(app.getEmail())) {
            app.setEmail(profileEmail());
        }

        // company + roleTitle are genuinely client-required (NOT NULL); fail friendly.
        if (isBlank(app.getCompany()) || isBlank(app.getRoleTitle())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "company and roleTitle are required");
        }
        app.setUpdatedAt(now);
        return applicationMapper.toDto(applicationRepository.save(app));
    }

    /**
     * Partial update of one of the current user's applications (status changes,
     * confirm-submit, manual edits from the board). A {@code null} field is left
     * as-is. 404 if the application isn't owned by the current user.
     */
    public ApplicationDTO updateApplication(Long id, ApplicationDTO dto) {
        Application app = ownedApplication(id);
        if (dto.getStatus() != null) app.setStatus(dto.getStatus());
        if (dto.getSubmissionConfirmed() != null) app.setSubmissionConfirmed(dto.getSubmissionConfirmed());
        if (dto.getAppliedAt() != null) app.setAppliedAt(dto.getAppliedAt());
        if (dto.getCompany() != null) app.setCompany(dto.getCompany());
        if (dto.getRoleTitle() != null) app.setRoleTitle(dto.getRoleTitle());
        if (dto.getJobUrl() != null) app.setJobUrl(dto.getJobUrl());
        if (dto.getLocation() != null) app.setLocation(dto.getLocation());
        if (dto.getJobType() != null) app.setJobType(dto.getJobType());
        if (dto.getJobMode() != null) app.setJobMode(dto.getJobMode());
        if (dto.getEmail() != null) app.setEmail(dto.getEmail());
        if (dto.getSalary() != null) app.setSalary(dto.getSalary());
        if (dto.getStarred() != null) app.setStarred(dto.getStarred());
        if (dto.getArchived() != null) app.setArchived(dto.getArchived());
        if (dto.getJobDescription() != null) app.setJobDescription(dto.getJobDescription());
        if (dto.getSource() != null) app.setSource(dto.getSource());
        if (dto.getResume() != null && dto.getResume().getId() != null) {
            app.setResume(ownedResume(dto.getResume().getId()));
        }
        app.setUpdatedAt(Instant.now());
        return applicationMapper.toDto(applicationRepository.save(app));
    }

    /** Delete one of the current user's applications (dismiss an abandoned draft). */
    public void deleteApplication(Long id) {
        applicationRepository.delete(ownedApplication(id));
    }

    // ---- helpers -----------------------------------------------------------

    /**
     * A re-fill should not move an entry that's already in the pipeline (APPLIED and
     * beyond) back to DRAFT. SAVED is exempt: it's a bookmark, not a pipeline stage —
     * starting to fill a saved job is exactly how it enters the pipeline as a DRAFT.
     */
    private static boolean isDraftDowngrade(ApplicationStatus incoming, ApplicationStatus existing) {
        return (
            incoming == ApplicationStatus.DRAFT && existing != ApplicationStatus.DRAFT && existing != ApplicationStatus.SAVED
        );
    }

    /**
     * Find the current user's existing entry for this job: by {@code externalJobId}
     * first (ATS-native, most precise), then by {@code jobUrl}. Null = no match =
     * create a new row.
     */
    private Application findDedupMatch(ApplicationDTO dto) {
        String ext = trimToNull(dto.getExternalJobId());
        String url = trimToNull(dto.getJobUrl());
        if (ext == null && url == null) {
            return null;
        }
        List<Application> mine = applicationRepository.findByUserIsCurrentUser();
        if (ext != null) {
            for (Application a : mine) {
                if (ext.equals(a.getExternalJobId())) {
                    return a;
                }
            }
        }
        if (url != null) {
            for (Application a : mine) {
                if (url.equals(a.getJobUrl())) {
                    return a;
                }
            }
        }
        return null;
    }

    /**
     * The current user's profile (bio) email, or {@code null} if there's no bio or no email
     * in it. The bio is stored as an opaque JSON {@code payload} string (see ProfileService),
     * so we parse it here and read the {@code email} field the extension/web write.
     */
    private String profileEmail() {
        Bio bio = bioRepository.findByUserIsCurrentUser().stream().findFirst().orElse(null);
        if (bio == null || isBlank(bio.getPayload())) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(bio.getPayload());
            JsonNode email = node.get("email");
            String value = email != null && email.isTextual() ? email.asText() : null;
            return isBlank(value) ? null : value.trim();
        } catch (Exception e) {
            LOG.debug("Could not read profile email from bio payload", e);
            return null;
        }
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return userRepository.findOneByLogin(login).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found")
        );
    }

    /** Load an application and ensure it belongs to the current user; 404 otherwise (no leak). */
    private Application ownedApplication(Long id) {
        String login = SecurityUtils.getCurrentUserLogin().orElse(null);
        Application app = applicationRepository.findById(id).orElse(null);
        if (app == null || app.getUser() == null || !app.getUser().getLogin().equals(login)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found");
        }
        return app;
    }

    /** Resolve a resume the current user owns, for linking to an application; 404 otherwise. */
    private Resume ownedResume(Long id) {
        String login = SecurityUtils.getCurrentUserLogin().orElse(null);
        Resume resume = resumeRepository.findById(id).orElse(null);
        if (resume == null || resume.getUser() == null || !resume.getUser().getLogin().equals(login)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume not found");
        }
        return resume;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
