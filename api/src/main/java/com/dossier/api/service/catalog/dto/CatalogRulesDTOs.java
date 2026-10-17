package com.dossier.api.service.catalog.dto;

import java.time.Instant;
import java.util.List;

/** Request and response shapes of the catalog rule tables of docs/enterprise-v2/21-feature-catalog.md (dependencies, presets, volume tiers). */
public final class CatalogRulesDTOs {

    private CatalogRulesDTOs() {}

    /** One dependency of a service: it needs {@code requiresFeatureKey} (or {@code any:consumes_ai}) under {@code kind}. */
    public record DependencyDTO(String requiresFeatureKey, String kind, String note, Boolean active) {}

    /** The full replacement of a service's dependencies; {@code reason} is optional (recorded in the change and audit rows). */
    public record DependenciesRequest(List<DependencyDTO> dependencies, String reason) {}

    public record PresetDTO(
        String key,
        String name,
        String description,
        List<String> featureKeys,
        String mirrorsProductCode,
        String planKey,
        Boolean active,
        Integer sortOrder,
        Integer catalogVersion
    ) {}

    /** Create ({@code key} required) or replace ({@code key} must match the path) a preset. A preset has no price (ADR-012). */
    public record PresetRequest(
        String key,
        String name,
        String description,
        List<String> featureKeys,
        String mirrorsProductCode,
        String planKey,
        Boolean active,
        Integer sortOrder,
        String reason
    ) {}

    public record VolumeTierDTO(
        Long id,
        Long productId,
        Integer minLicensedConsultants,
        Integer pctOffBp,
        Boolean active,
        Instant effectiveFrom,
        Instant effectiveUntil,
        Integer catalogVersion
    ) {}

    public record VolumeTierRequest(
        Long productId,
        Integer minLicensedConsultants,
        Integer pctOffBp,
        Boolean active,
        Instant effectiveFrom,
        Instant effectiveUntil,
        String reason
    ) {}
}
