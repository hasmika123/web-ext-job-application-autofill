package com.dossier.api.service.dto.ent;

/**
 * The organization's Resume Builder policy as the org admin sees it. {@code consultantShareLinks} is the value in force (the organization's own
 * override, else the platform value, else off); {@code overridden} says whether the organization has set it itself. {@code activeConsultantLinks} is
 * how many live share links and named-person grants sit on the resumes the organization links into its directory: what switching sharing off pauses
 * right away (they come back when it is switched on again). Nothing here is personal data.
 */
public record OrgResumePolicyDTO(boolean consultantShareLinks, boolean overridden, long activeConsultantLinks) {
    /** Body of the PUT: the new value. */
    public record Update(Boolean consultantShareLinks) {}
}
