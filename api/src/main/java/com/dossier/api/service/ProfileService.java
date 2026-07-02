package com.dossier.api.service;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.BioDTO;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.mapper.BioMapper;
import com.dossier.api.service.mapper.ResumeMapper;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The sync surface the extension and web app use: everything is scoped to the
 * authenticated user. Unlike the generated {@code BioResource}/{@code ResumeResource}
 * (raw id-based CRUD), these operations never expose or touch another user's data.
 * One Bio per user (the "profile"); many resumes.
 */
@Service
@Transactional
public class ProfileService {

    private static final Logger LOG = LoggerFactory.getLogger(ProfileService.class);

    private final BioRepository bioRepository;
    private final ResumeRepository resumeRepository;
    private final UserRepository userRepository;
    private final ApplicationRepository applicationRepository;
    private final BioMapper bioMapper;
    private final ResumeMapper resumeMapper;
    private final ResumeStorageService storageService;

    public ProfileService(
        BioRepository bioRepository,
        ResumeRepository resumeRepository,
        UserRepository userRepository,
        ApplicationRepository applicationRepository,
        BioMapper bioMapper,
        ResumeMapper resumeMapper,
        ResumeStorageService storageService
    ) {
        this.bioRepository = bioRepository;
        this.resumeRepository = resumeRepository;
        this.userRepository = userRepository;
        this.applicationRepository = applicationRepository;
        this.bioMapper = bioMapper;
        this.resumeMapper = resumeMapper;
        this.storageService = storageService;
    }

    // ---- profile (single bio per user) -------------------------------------

    @Transactional(readOnly = true)
    public Optional<BioDTO> getProfile() {
        return bioRepository.findByUserIsCurrentUser().stream().findFirst().map(bioMapper::toDto);
    }

    /** Create the user's bio if absent, otherwise overwrite its payload (one per user). */
    public BioDTO upsertProfile(String payload) {
        User user = currentUser();
        Bio bio = bioRepository.findByUserIsCurrentUser().stream().findFirst().orElseGet(Bio::new);
        bio.setPayload(payload);
        bio.setUpdatedAt(Instant.now());
        bio.setUser(user);
        return bioMapper.toDto(bioRepository.save(bio));
    }

    // ---- resumes (many per user) -------------------------------------------

    @Transactional(readOnly = true)
    public List<ResumeDTO> listResumes() {
        return resumeRepository.findByUserIsCurrentUser().stream().map(resumeMapper::toDto).toList();
    }

    public ResumeDTO createResume(ResumeDTO dto) {
        Resume resume = resumeMapper.toEntity(dto);
        resume.setId(null);
        resume.setUser(currentUser());
        if (resume.getCreatedAt() == null) {
            resume.setCreatedAt(Instant.now());
        }
        if (resume.getStatus() == null) {
            resume.setStatus(ResumeStatus.NEEDS_REVIEW);
        }
        // The file is uploaded separately (see ResumeFileResource); until then the
        // object key is empty (the column is non-null).
        if (resume.getr2ObjectKey() == null) {
            resume.setr2ObjectKey("");
        }
        // Default/base resume: the user's FIRST resume auto-becomes the default; an explicit
        // request also wins. Either way, unset any prior default first (at most one per user).
        boolean firstResume = resumeRepository.findByUserIsCurrentUser().isEmpty();
        if (Boolean.TRUE.equals(dto.getDefaultResume()) || firstResume) {
            clearDefaultForCurrentUser();
            resume.setDefaultResume(true);
        } else {
            resume.setDefaultResume(false);
        }
        return resumeMapper.toDto(resumeRepository.save(resume));
    }

    /**
     * Partial update (PATCH-like): only fields the client actually sends are written.
     * This lets the web app flip a single flag (e.g. {@code archived}) without having to
     * echo the whole resume back, and is harmless for the extension, which always pushes
     * the full DTO. A {@code null} field means "leave as-is", not "clear".
     */
    public ResumeDTO updateResume(Long id, ResumeDTO dto) {
        Resume resume = ownedResume(id);
        if (dto.getLabel() != null) {
            resume.setLabel(dto.getLabel());
        }
        if (dto.getParsedJson() != null) {
            resume.setParsedJson(dto.getParsedJson());
        }
        if (dto.getStatus() != null) {
            resume.setStatus(dto.getStatus());
        }
        // Only overwrite the stored-file pointer when the client actually sends one.
        if (dto.getr2ObjectKey() != null) {
            resume.setr2ObjectKey(dto.getr2ObjectKey());
        }
        if (dto.getArchived() != null) {
            resume.setArchived(dto.getArchived());
        }
        if (dto.getStarred() != null) {
            resume.setStarred(dto.getStarred());
        }
        // Setting a resume as default clears any other default (one per user); clearing it
        // just unsets this one (the user may then have no default).
        if (dto.getDefaultResume() != null) {
            if (Boolean.TRUE.equals(dto.getDefaultResume())) {
                clearDefaultForCurrentUser();
                resume.setDefaultResume(true);
            } else {
                resume.setDefaultResume(false);
            }
        }
        return resumeMapper.toDto(resumeRepository.save(resume));
    }

    /** Unset the default flag on all of the current user's resumes (before promoting a new default). */
    private void clearDefaultForCurrentUser() {
        for (Resume r : resumeRepository.findByUserIsCurrentUser()) {
            if (Boolean.TRUE.equals(r.getDefaultResume())) {
                r.setDefaultResume(false);
                resumeRepository.save(r);
            }
        }
    }

    public void deleteResume(Long id) {
        Resume resume = ownedResume(id);
        // Archive guard (3.5): never orphan a tracked application's resume reference. If
        // any application points at this resume, block the delete and nudge to archive.
        long refs = applicationRepository.countByResumeId(id);
        if (refs > 0) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "This resume is attached to " + refs + " tracked application" + (refs == 1 ? "" : "s") +
                ". Archive it instead of deleting so those applications keep their resume."
            );
        }
        String key = resume.getr2ObjectKey();
        resumeRepository.delete(resume);
        if (key != null && !key.isBlank()) {
            storageService.delete(key); // avoid orphaning bytes in the blob store
        }
    }

    // ---- helpers -----------------------------------------------------------

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return userRepository.findOneByLogin(login).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found")
        );
    }

    /** Load a resume and ensure it belongs to the current user; 404 otherwise (no leak). */
    private Resume ownedResume(Long id) {
        String login = SecurityUtils.getCurrentUserLogin().orElse(null);
        Resume resume = resumeRepository.findById(id).orElse(null);
        if (resume == null || resume.getUser() == null || !resume.getUser().getLogin().equals(login)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume not found");
        }
        return resume;
    }
}
