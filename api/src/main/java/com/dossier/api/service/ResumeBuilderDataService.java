package com.dossier.api.service;

import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.ResumeAiProposalRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeDocVersionRepository;
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
    private final ObjectMapper om = new ObjectMapper();

    public ResumeBuilderDataService(
        ProfileItemRepository profileItemRepository,
        ResumeDocRepository resumeDocRepository,
        ResumeDocVersionRepository resumeDocVersionRepository,
        ResumeAiProposalRepository resumeAiProposalRepository
    ) {
        this.profileItemRepository = profileItemRepository;
        this.resumeDocRepository = resumeDocRepository;
        this.resumeDocVersionRepository = resumeDocVersionRepository;
        this.resumeAiProposalRepository = resumeAiProposalRepository;
    }

    /** Every row of the four builder tables a user owns (account deletion). */
    public void deleteAllForUser(Long userId) {
        resumeAiProposalRepository.deleteAllByUserId(userId);
        resumeDocVersionRepository.deleteAllByUserId(userId);
        resumeDocRepository.deleteAllByUserId(userId);
        profileItemRepository.deleteAllByUserId(userId);
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
