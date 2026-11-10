package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.repository.ResumeDocRepository;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * X7.4: the approved text is pinned. When a resume is approved the row records the content fingerprint ({@code resume_doc.content_hash}) and the
 * version number of the text that was approved. A resume is STALE when its status still reads APPROVED but the document no longer matches that pin
 * (someone other than the consultant changed it and the status was not reopened, e.g. a refresh that failed): it must be treated as awaiting
 * approval again. A row with no pin (approved before pinning, or a directory record with no builder document) is never stale: there is nothing to
 * compare. The consultant's own edits move the pin with them (they attest their own words). Never blocks the consultant; submits nothing.
 */
@Component
public class OrgResumeApproval {

    private final ResumeDocRepository docs;

    @Autowired
    public OrgResumeApproval(ResumeDocRepository docs) {
        this.docs = docs;
    }

    /** The fingerprint of the builder document behind a row; null when there is none. */
    public String currentHash(OrgResume r) {
        if (docs == null || r == null || r.getResumeId() == null) return null;
        return docs.findContentHashByResumeId(r.getResumeId()).orElse(null);
    }

    /** Records what is being approved now: the current version number and (with a builder document) its fingerprint. */
    public void pin(OrgResume r) {
        pin(r, currentHash(r));
    }

    public static void pin(OrgResume r, String hash) {
        r.setApprovedContentHash(hash);
        r.setApprovedVersionNo(r.getVersionNo() == null ? 1 : r.getVersionNo());
    }

    /** True when the row reads APPROVED, is pinned, and the document's current fingerprint differs from the pin. */
    public static boolean isStale(OrgResume r, String currentHash) {
        return r != null && "APPROVED".equals(r.getApprovalStatus()) && r.getApprovedContentHash() != null && currentHash != null && !r.getApprovedContentHash().equals(currentHash);
    }

    public boolean isStale(OrgResume r) {
        return isStale(r, currentHash(r));
    }

    /** APPROVED and not stale: the only state in which the resume may be assigned or submitted. */
    public boolean isUsable(OrgResume r) {
        return r != null && "APPROVED".equals(r.getApprovalStatus()) && !isStale(r);
    }

    /** True when the version a submission was prepared with is the version that was approved (and the row is still approved and not stale). */
    public boolean usesApprovedVersion(OrgResume r, Integer submissionVersion) {
        if (!isUsable(r)) return false;
        Integer approved = r.getApprovedVersionNo();
        // an unpinned (older) approval: the live version number is all there is to compare
        return Objects.equals(submissionVersion, approved != null ? approved : r.getVersionNo());
    }
}
