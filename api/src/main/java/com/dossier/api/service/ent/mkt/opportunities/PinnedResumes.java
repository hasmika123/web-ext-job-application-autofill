package com.dossier.api.service.ent.mkt.opportunities;

import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.service.ent.resumes.OrgResumeLinkService;

/**
 * The one answer to "can this resume go with a job, and can Prepare use it yet?" (docs/enterprise-v2/PINNED-RESUME-BUILD.md), shared by the marketer
 * who chooses it, the consultant who sees it and Prepare which attaches it, so the three never disagree.
 *
 * <ul>
 *   <li><b>READY</b>: Prepare attaches it. An approved resume, or one that needs no approval (the consultant's own).</li>
 *   <li><b>NEEDS_APPROVAL</b>: a resume a marketer made or edited that waits for the consultant. It can be chosen, but nothing a marketer wrote is used
 *       until the consultant approves that version (CLAUDE.md, doc 30 section 5).</li>
 *   <li><b>UNUSABLE</b>: sent back by the consultant (REJECTED) or with no file behind it; it cannot be chosen, and a choice that became unusable
 *       falls back to the usual pick.</li>
 * </ul>
 */
public final class PinnedResumes {

    public enum State {
        READY,
        NEEDS_APPROVAL,
        UNUSABLE,
    }

    private PinnedResumes() {}

    public static State state(OrgResume r) {
        if (r == null || r.getResumeId() == null || "REJECTED".equals(r.getApprovalStatus())) return State.UNUSABLE;
        if ("APPROVED".equals(r.getApprovalStatus()) || !OrgResumeLinkService.requiresConsultantApproval(r)) return State.READY;
        if ("PENDING".equals(r.getApprovalStatus())) return State.NEEDS_APPROVAL;
        return State.UNUSABLE;
    }

    /** Whether a marketer may choose it for a job: ready, or waiting for the consultant. */
    public static boolean choosable(OrgResume r) {
        return state(r) != State.UNUSABLE;
    }
}
