package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

/**
 * The wire shapes of resume sharing (Resume Builder R3.11, DESIGN 9.7). One holder class so the
 * handful of small records live in one place.
 */
public final class ResumeAccessDTOs {

    private ResumeAccessDTOs() {}

    /**
     * One grant. {@code subjectType} is USER or LINK. A USER grant carries the grantee's {@code login} and display
     * {@code name}; a LINK grant carries {@code url} (the address to send) and {@code allowDownload}.
     * {@code expired} marks a grant past its expiry that has not been removed yet (it opens nothing). {@code paused} marks a live grant
     * that an organization's "consultant share links" switch (off) currently keeps from opening anything.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AccessGrantDTO(
        Long id,
        String subjectType,
        String login,
        String name,
        String role,
        String label,
        Boolean allowDownload,
        Instant expiresAt,
        boolean expired,
        Instant createdAt,
        int viewCount,
        Instant lastViewedAt,
        String url,
        @Schema(description = "True while the owner's organization has consultant sharing off: the grant is kept but opens nothing (it can still be revoked) and works again when sharing is back on.") boolean paused
    ) {}

    /** The organisation row of Resume settings; the whole object is null when the org area is not there or the owner has no org. */
    public record OrgAccessDTO(
        @Schema(description = "NONE | SUMMARY | FULL: what the member lets their organisation see.") String scope,
        @Schema(description = "The paired marketer / coach, when there is one.") String pairedWith,
        @Schema(description = "This resume's 'include with my organisation' switch.") boolean shareWithOrg
    ) {}

    /** {@code GET /api/profile/resumes/{id}/access}. */
    public record ResumeAccessOverviewDTO(OrgAccessDTO org, List<AccessGrantDTO> grants, List<AccessGrantDTO> links, long viewers) {}

    /** One row of the "who viewed it" list. {@code viewerKind}: ORG | USER | LINK; {@code what}: PAGE | PDF. */
    public record ResumeViewDTO(String viewerKind, String viewerLabel, String what, Instant viewedAt) {}

    /** A resume someone shared with me. {@code via}: USER | ORG. */
    public record SharedResumeDTO(Long resumeId, String name, String owner, String role, String via) {}

    /**
     * What a share link opens: the page and nothing else. The document is scrubbed of everything a template does not
     * draw (storage keys, targets, the master it was tailored from).
     */
    public record PublicResumeDTO(
        String name,
        JsonNode doc,
        String templateId,
        JsonNode theme,
        boolean allowDownload,
        @Schema(description = "The stored PDF is current; with allowDownload the Download button can be offered.") boolean pdfReady
    ) {}
}
