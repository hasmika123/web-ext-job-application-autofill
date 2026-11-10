package com.dossier.api.service.ent.consultantws;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Wire shapes of the Consultant workspace My Features page (docs/enterprise-v2/page-consultant-features.md). The consultant sees only their own
 * entitlements and usage: never a price, a margin or a billing figure.
 */
public final class ConsultantFeaturesDTO {

    private ConsultantFeaturesDTO() {}

    /**
     * One feature. {@code allowance} is null for "unlimited". {@code used} is null when the product has no metered action for the feature yet
     * (the page then says usage tracking is not available yet instead of a number). {@code status} is ENABLED, DISABLED or NOT_AVAILABLE.
     * {@code resetsOn} is the next reset of a metered allowance. {@code sample} is true when the status and allowance are demo stand-ins for the
     * admin catalog (the real value comes from EntitlementService once the admin catalog and the consultant role merge).
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Feature(
        String key,
        String title,
        String description,
        String tone,
        String icon,
        String status,
        boolean premium,
        Integer allowance,
        Integer used,
        Integer usedLastMonth,
        String unit,
        String usedNote,
        LocalDate resetsOn,
        String href,
        String actionLabel,
        boolean overview,
        boolean sample
    ) {}

    /** The five tiles. Plain numbers; the sample flags mark the ones that depend on the demo entitlement stand-ins. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Tiles(
        long active,
        boolean activeSample,
        Long creditsLeft,
        Integer creditsTotal,
        boolean creditsSample,
        long usedThisMonth,
        Double usedDeltaPct,
        long premium,
        boolean premiumSample,
        long expiringSoon,
        LocalDate renewsOn,
        boolean expiringSample
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Response(Long orgId, Instant generatedAt, String name, boolean entitlementsSample, Tiles tiles, List<Feature> features) {}
}
