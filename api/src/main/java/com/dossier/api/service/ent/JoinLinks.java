package com.dossier.api.service.ent;

/**
 * Builds the absolute link an organization's invite mail carries (X1.8, 10-domain-routing.md section 6). A seam, not logic:
 * X2.10's {@code TenantUrls.joinLink(orgId, token)} has exactly this signature, so when that class is merged it declares
 * {@code implements JoinLinks} and {@link HostnameJoinLinks} is deleted. The base is chosen ONLY from the organization's stored
 * hostnames, never from the request that triggered the mail, so a forged Host header cannot redirect an invite.
 */
public interface JoinLinks {
    /** {@code https://<host>/join/t/<token>} on the organization's live host, else the platform base. Never throws. */
    String joinLink(Long orgId, String token);
}
