package com.dossier.api.service.dto.org;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Body of {@code PATCH /api/orgs/{orgId}}. A missing (null) field is left alone; an empty string clears an optional
 * text field. {@code settings} is a PARTIAL object merged over the stored settings and validated as an
 * {@link OrgSettings}: unknown keys are refused. The slug is not patchable here (it is chosen once at creation).
 */
public record OrgPatchRequest(
    String name,
    String website,
    String sizeBand,
    String country,
    String timezone,
    String billingEmail,
    JsonNode settings
) {}
