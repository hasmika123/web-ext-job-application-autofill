package com.dossier.api.service.ent.resumes;

import com.dossier.api.repository.ent.resumes.ResumeShareLinkQueryRepository;
import java.time.Instant;
import org.springframework.stereotype.Service;

/**
 * Consultant share links are PAUSED, not deleted, while their organization has {@code org.resumes.consultant_share_links} off (user decision
 * 2026-10-15). Nothing is written when the switch moves: a link or named-person grant on a resume the organization links into its directory simply
 * does not resolve while the setting is off, and resolves again the moment it is back on (unless the consultant revoked it or it expired meanwhile).
 * It is decided at resolve time, from the organization's current setting, so no cache and no stale row can keep serving a paused link.
 *
 * <p>A resume linked into several organizations is paused when ANY of them has sharing off (the safe reading). A personal resume, or one no
 * organization links, is never paused.
 */
@Service
public class ConsultantShareLinkPause {

    private final ResumeShareLinkQueryRepository query;
    private final OrgResumePolicy policy;

    public ConsultantShareLinkPause(ResumeShareLinkQueryRepository query, OrgResumePolicy policy) {
        this.query = query;
        this.policy = policy;
    }

    /** Whether this resume's existing share links and grants are paused right now. */
    public boolean isPaused(Long resumeId) {
        for (Long orgId : query.orgIdsLinking(resumeId)) {
            if (!policy.consultantShareLinks(orgId)) return true;
        }
        return false;
    }

    /** How many live share links and named-person grants sit on the resumes {@code orgId} links (what turning sharing off pauses, or turning it on restores). */
    public long liveShares(Long orgId) {
        return query.countLiveShares(orgId, Instant.now());
    }
}
