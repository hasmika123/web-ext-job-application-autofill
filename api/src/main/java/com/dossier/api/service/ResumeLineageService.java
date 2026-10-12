package com.dossier.api.service;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.enumeration.ResumeRole;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.service.resume.ResumeDocument;
import com.dossier.api.service.resume.ResumeDocumentCanonical;
import com.dossier.api.service.resume.ResumeDocumentJson;
import com.dossier.api.service.resume.ResumeDocumentUpgrader;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The master to tailored lineage rules that change data (R3.9, DESIGN 8.9): detaching a tailored resume
 * into a master, and detaching all of a master's children before the master is deleted. Reads
 * ({@code lineage}) live in {@link ResumeMetaService}.
 *
 * <p>Detaching clears {@code meta.tailoredFrom}, the {@code parent_*} columns and sets the role to
 * MASTER, keeps the job target (Job Match still works) and writes a {@code DETACH} version row, so the
 * change is visible in the history and restorable.
 */
@Service
@Transactional
public class ResumeLineageService {

    /** {@code resume_doc.source_kind} of a document that was a tailored copy and has been cut loose. */
    static final String SOURCE_COPY = "COPY";

    private final ResumeDocRepository resumeDocRepository;
    private final ResumeDocVersionService versions;

    public ResumeLineageService(ResumeDocRepository resumeDocRepository, ResumeDocVersionService versions) {
        this.resumeDocRepository = resumeDocRepository;
        this.versions = versions;
    }

    /** Turn a tailored resume into a master. The caller has checked that it is tailored. */
    public void detach(ResumeDoc d, String byLogin) {
        Resume resume = d.getResume();
        Instant now = Instant.now();
        JsonNode doc = ResumeDocumentUpgrader.upgrade(ResumeDocument.parse(d.getDocJson()));
        JsonNode meta = doc.get("meta");
        if (meta != null && meta.isObject()) {
            ((ObjectNode) meta).remove("tailoredFrom");
        }
        d.setDocJson(ResumeDocumentJson.write(doc, 0));
        d.setSchemaVersion(ResumeDocument.SCHEMA_VERSION);
        d.setContentHash(ResumeDocumentCanonical.contentHash(doc));
        d.setParentResumeId(null);
        d.setParentHashAtCopy(null);
        d.setSourceKind(SOURCE_COPY);
        d.setUpdatedAt(now);
        resume.setRole(ResumeRole.MASTER);
        resume.setUpdatedByLogin(byLogin);
        resume.setUpdatedAt(now);
        resumeDocRepository.saveAndFlush(d);
        versions.record(d, ResumeDocVersionService.DETACH, null, byLogin);
    }

    /** Detach every derived document of a master (called before the master is deleted). */
    public void detachChildren(Long masterId, Long userId, String byLogin) {
        for (ResumeDoc child : resumeDocRepository.findByUserIdAndParentResumeId(userId, masterId)) {
            // Independent copies keep their parent pointer as history (no foreign key); only tailored ones are cut loose.
            if (child.getResume().getRole() == ResumeRole.TAILORED) {
                detach(child, byLogin);
            }
        }
    }
}
