package com.dossier.api.service.dto.ent;

/**
 * The organization's Resume Builder policy as the org admin sees it. {@code consultantShareLinks} is the value in force (the organization's own
 * override, else the platform value, else off); {@code overridden} says whether the organization has set it itself. Nothing here is personal data.
 */
public record OrgResumePolicyDTO(boolean consultantShareLinks, boolean overridden) {
    /** Body of the PUT: the new value. */
    public record Update(Boolean consultantShareLinks) {}
}
