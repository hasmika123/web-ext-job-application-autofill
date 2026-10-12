package com.dossier.api.service;

import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.repository.OnboardingDraftRepository;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.ResumeAccessRepository;
import com.dossier.api.repository.ResumeViewEventRepository;
import com.dossier.api.repository.ResumeAiProposalRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeDocVersionRepository;
import com.dossier.api.service.storage.StoredFileEraser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Account-lifecycle hooks for the Resume Builder tables (R0.1): erase every row a user owns, and
 * export the user's profile items and documents. Version history and AI proposals are erased but
 * not exported - the current document is the user's work; the history is a convenience.
 */
@Service
@Transactional
public class ResumeBuilderDataService {

    private final ProfileItemRepository profileItemRepository;
    private final ResumeDocRepository resumeDocRepository;
    private final ResumeDocVersionRepository resumeDocVersionRepository;
    private final ResumeAiProposalRepository resumeAiProposalRepository;
    private final ResumeAccessRepository resumeAccessRepository;
    private final ResumeViewEventRepository resumeViewEventRepository;
    private final OnboardingDraftRepository onboardingDraftRepository;
    private final StoredFileEraser storedFileEraser;
    private final ObjectMapper om = new ObjectMapper();

    public ResumeBuilderDataService(
        ProfileItemRepository profileItemRepository,
        ResumeDocRepository resumeDocRepository,
        ResumeDocVersionRepository resumeDocVersionRepository,
        ResumeAiProposalRepository resumeAiProposalRepository,
        ResumeAccessRepository resumeAccessRepository,
        ResumeViewEventRepository resumeViewEventRepository,
        OnboardingDraftRepository onboardingDraftRepository,
        StoredFileEraser storedFileEraser
    ) {
        this.onboardingDraftRepository = onboardingDraftRepository;
        this.storedFileEraser = storedFileEraser;
        this.resumeAccessRepository = resumeAccessRepository;
        this.resumeViewEventRepository = resumeViewEventRepository;
        this.profileItemRepository = profileItemRepository;
        this.resumeDocRepository = resumeDocRepository;
        this.resumeDocVersionRepository = resumeDocVersionRepository;
        this.resumeAiProposalRepository = resumeAiProposalRepository;
    }

    /**
     * Everything the builder stored for a user (account deletion): first every file they own in object
     * storage - resume uploads and rendered PDFs, kept-aside originals, photos, thumbnails and application
     * attachments, all found by prefix (see {@code StorageKeys.userPrefixes}) - then the rows. Blobs go first,
     * inside the deleting transaction, so a storage failure rolls the whole erasure back.
     */
    public void deleteAllForUser(Long userId) {
        storedFileEraser.deleteUserFiles(userId);
        // Sharing (R3.11): the grants and view events of the user's own resumes (the FK cascade would do it
        // too; explicit so the erasure is self-contained).
        resumeViewEventRepository.deleteAllByOwner(userId);
        resumeAccessRepository.deleteAllByOwner(userId);
        resumeAiProposalRepository.deleteAllByUserId(userId);
        resumeDocVersionRepository.deleteAllByUserId(userId);
        resumeDocRepository.deleteAllByUserId(userId);
        profileItemRepository.deleteAllByUserId(userId);
        deleteOnboardingDraft(userId);
    }

    /** The user's unfinished setup draft (Onboarding v2): erased with the account (the FK cascade would too; explicit like the rest). */
    public void deleteOnboardingDraft(Long userId) {
        onboardingDraftRepository.deleteByUserId(userId);
    }

    /**
     * The user's setup draft for the account export, or {@code null} when there is none. It is their own unconfirmed
     * data (the cards parsed from their resume and what they decided), so it is included; an expired row is not.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> exportOnboardingDraft(Long userId) {
        return onboardingDraftRepository
            .findByUserId(userId)
            .filter(d -> d.getExpiresAt().isAfter(java.time.Instant.now()))
            .map(d -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("step", d.getStep());
                m.put("persona", d.getPersona());
                m.put("stepsDone", d.getStepsDone());
                m.put("stepsTotal", d.getStepsTotal());
                m.put("state", json(d.getStateJson()));
                m.put("createdAt", d.getCreatedAt());
                m.put("updatedAt", d.getUpdatedAt());
                m.put("expiresAt", d.getExpiresAt());
                return m;
            })
            .orElse(null);
    }

    /**
     * The sharing traces a user leaves on OTHER people's resumes (R3.11): grants made to them and views that
     * name them. Their own resumes' rows go in {@link #deleteAllForUser}.
     */
    public void deleteSharingAsViewer(String login) {
        resumeAccessRepository.deleteGrantsTo(login);
        resumeViewEventRepository.deleteByViewer(login);
    }

    /** The user's live profile items, for the account export. Soft-deleted items are not included. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> exportProfileItems(Long userId) {
        return profileItemRepository
            .findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(userId)
            .stream()
            .map(this::toExport)
            .toList();
    }

    /** The user's builder documents, for the account export. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> exportResumeDocs(Long userId) {
        return resumeDocRepository.findByUserId(userId).stream().map(this::toExport).toList();
    }

    /** The user's grants and links on their resumes (R3.11), without the link tokens. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> exportResumeShares(Long userId) {
        return resumeAccessRepository
            .findByOwnerUserIdOrderByIdAsc(userId)
            .stream()
            .map(a -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("resumeId", a.getResumeId());
                m.put("subjectType", a.getSubjectType());
                m.put("subjectLogin", a.getSubjectLogin());
                m.put("role", a.getRole());
                m.put("label", a.getLabel());
                m.put("allowDownload", a.isAllowDownload());
                m.put("expiresAt", a.getExpiresAt());
                m.put("revokedAt", a.getRevokedAt());
                m.put("createdAt", a.getCreatedAt());
                m.put("viewCount", a.getViewCount());
                return m;
            })
            .toList();
    }

    private Map<String, Object> toExport(ProfileItem p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", p.getId());
        m.put("section", p.getSection().name());
        m.put("position", p.getPosition());
        m.put("data", json(p.getDataJson()));
        m.put("provenance", p.getProvenance().name());
        m.put("hidden", p.isHidden());
        m.put("createdAt", p.getCreatedAt());
        m.put("updatedAt", p.getUpdatedAt());
        return m;
    }

    private Map<String, Object> toExport(ResumeDoc d) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("resumeId", d.getResumeId());
        m.put("templateId", d.getTemplateId());
        m.put("doc", json(d.getDocJson()));
        m.put("theme", json(d.getThemeJson()));
        m.put("docVersion", d.getDocVersion());
        m.put("createdAt", d.getCreatedAt());
        m.put("updatedAt", d.getUpdatedAt());
        return m;
    }

    /** Embed stored JSON as JSON rather than as an escaped string; fall back to the raw text. */
    private Object json(String raw) {
        if (raw == null) {
            return null;
        }
        try {
            JsonNode n = om.readTree(raw);
            return n;
        } catch (JsonProcessingException e) {
            return raw;
        }
    }
}
