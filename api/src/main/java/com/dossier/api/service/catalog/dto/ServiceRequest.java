package com.dossier.api.service.catalog.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * The body of {@code POST /api/admin/catalog/services} and {@code PUT /api/admin/catalog/services/{key}}. A PUT replaces every editable field;
 * the key is immutable (a body {@code key} that differs from the path is refused). {@code defaultAllowance} is required (nothing is unlimited);
 * 0 is accepted only for {@code usageUnit = none}. Omitted optional fields take the safe default of the column.
 */
public record ServiceRequest(
    String key,
    String name,
    String description,
    String usageType,
    String usageUnit,
    Long defaultAllowance,
    String allowancePeriod,
    String audience,
    String category,
    String poolMode,
    Integer aiBudgetCents,
    Boolean consumesAi,
    Integer reserveTtlSeconds,
    Boolean stackable,
    Integer maxQuantity,
    Boolean additive,
    JsonNode eligibility,
    List<String> entitlementKeys,
    String limitKey,
    String visibility,
    Integer sortOrder,
    String iconKey,
    String reason
) {}
