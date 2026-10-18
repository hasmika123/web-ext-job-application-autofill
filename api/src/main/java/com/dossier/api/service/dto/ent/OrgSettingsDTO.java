package com.dossier.api.service.dto.ent;

import java.util.List;

/**
 * The Organization Settings page (X2.9): the General and Security sections. {@code general.legalName} is read-only (it is the name on the contract; it is
 * changed through Kiwiply support). {@code security} values are the organization's own choice or {@code null} for the platform behaviour; {@code bounds}
 * and {@code reasonMinChars} come from the admin settings registry. No secret and no personal data.
 */
public record OrgSettingsDTO(General general, Security security, List<String> locales) {
    public record General(String legalName, String displayName, String timeZone, String locale, String contactEmail) {}

    public record Bounds(int sessionTimeoutMin, int sessionTimeoutMax, int passwordMinFloor, int passwordMinCeiling) {}

    public record Security(Integer sessionTimeoutMinutes, Integer passwordMinLength, Bounds bounds, int reasonMinChars) {}
}
