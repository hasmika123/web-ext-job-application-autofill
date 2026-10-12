package com.dossier.api.service.resume;

import java.util.List;
import java.util.Optional;

/**
 * The seam to the organisation area's consent record ({@code data_share}, docs/design/org/consent-data-sharing.md).
 * A member's paired marketer may read their resumes only while the member's scope is {@code FULL} <em>and</em> the
 * resume's "include with my organisation" flag is on (DESIGN 8.7). Consent is the member's alone: this seam only
 * reads it, and a withdrawal takes effect on the next request because nothing is cached here.
 *
 * <p>No implementation exists until the org area ships {@code data_share}; {@code ResumeAccessService} takes it as
 * an optional bean, so without one the org rows stay hidden and no resume is ever readable through an org (the
 * conditional-on-bean rule of DESIGN 21). The implementing bean also owns the {@code org_audit_event} write.
 */
public interface OrgResumeSharing {
    /** The member's current sharing state: scope ({@code NONE | SUMMARY | FULL}) and the paired person's label, if any. */
    record Pairing(String scope, String pairedWith) {
        public boolean isFull() {
            return "FULL".equals(scope);
        }
    }

    /** The owner's org sharing, or empty when they have no organisation. */
    Optional<Pairing> pairingOf(String ownerLogin);

    /** Whether {@code viewerLogin} is the person the owner granted FULL scope to. */
    boolean isFullPairedViewer(String ownerLogin, String viewerLogin);

    /** Logins of the members who granted FULL scope to {@code viewerLogin}. */
    List<String> ownersSharingFullWith(String viewerLogin);

    /** Write the {@code FULL_READ} audit row ({@code details = resume:{id}}) for an org read. */
    void auditFullRead(String ownerLogin, String viewerLogin, Long resumeId);
}
