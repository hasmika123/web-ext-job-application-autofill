package com.dossier.api.service.catalog.dto;

import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * One catalog service as the admin API shows it (docs/subscriptions/02-unified-product-model.md section 2.1): a {@code feature_definition} row,
 * for individuals or organizations. There is no price here: prices are {@code product_price} rows. Additive: later stories add members (limits,
 * dependencies), never rename these.
 */
public record ServiceDTO(
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
    Boolean active,
    Integer sortOrder,
    String iconKey,
    Boolean demoData,
    Integer catalogVersion,
    Instant createdAt,
    Instant updatedAt,
    String updatedBy
) {
    public static ServiceDTO from(FeatureDefinition d, ObjectMapper mapper) {
        return new ServiceDTO(
            d.getFeatureKey(),
            d.getName(),
            d.getDescription(),
            d.getUsageType(),
            d.getUsageUnit(),
            d.getDefaultAllowance(),
            d.getAllowancePeriod(),
            d.getAudience(),
            d.getCategory(),
            d.getPoolMode(),
            d.getAiBudgetCents(),
            d.getConsumesAi(),
            d.getReserveTtlSeconds(),
            d.getStackable(),
            d.getMaxQuantity(),
            d.getAdditive(),
            tree(d.getEligibilityJson(), mapper),
            keys(d.getEntitlementKeysJson(), mapper),
            d.getLimitKey(),
            d.getVisibility(),
            d.getActive(),
            d.getSortOrder(),
            d.getIconKey(),
            d.getDemoData(),
            d.getCatalogVersion(),
            d.getCreatedAt(),
            d.getUpdatedAt(),
            d.getUpdatedBy()
        );
    }

    private static JsonNode tree(String json, ObjectMapper mapper) {
        if (json == null || json.isBlank()) return null;
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    private static List<String> keys(String json, ObjectMapper mapper) {
        JsonNode n = tree(json, mapper);
        List<String> out = new ArrayList<>();
        if (n != null && n.isArray()) n.forEach(e -> out.add(e.asText()));
        return out;
    }
}
