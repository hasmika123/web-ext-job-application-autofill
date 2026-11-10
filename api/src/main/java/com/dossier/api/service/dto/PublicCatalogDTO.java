package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.util.List;
import java.util.Map;

/**
 * The public catalog (docs/subscriptions/09-apis.md section 2; story K5.1): what the pricing page renders. Money is {@code *Minor} longs in {@code currency}.
 * {@code totals[planKey][interval][basketKey]} is the server-priced recurring total of a basket, where {@code basketKey} is the add-ons sorted by feature key as
 * {@code featureKey:quantity} joined with a comma (for example {@code ai.credits_extra:2,resumes.extra_10:1}); it is precomputed for one add-on at quantity 1
 * or 2 and for every pair at quantity 1. A basket outside that set is priced by an anonymous quote ({@code POST /api/billing/quotes}).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PublicCatalogDTO(
    int catalogVersion,
    String currency,
    List<String> intervals,
    boolean annualEnabled,
    String consentText,
    List<Plan> plans,
    Map<String, Map<String, Map<String, Long>>> totals
) implements Serializable {
    /** One price at one interval; the monthly-equivalent and savings fields are present on QUARTER and YEAR only. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Price(long amountMinor, Long monthlyEquivalentMinor, Long savingsMinor, Integer savingsBp) implements Serializable {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Included(String featureKey, String name, String description, Long allowance, String unit) implements Serializable {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Addon(String featureKey, String name, String description, Integer maxQuantity, Map<String, Price> prices) implements Serializable {}

    /** A plan with no base product (Free) has empty {@code prices} and {@code intervals}. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Plan(
        String planKey,
        String name,
        String badge,
        String description,
        List<String> intervals,
        Map<String, Price> prices,
        List<Included> included,
        List<Addon> optional,
        boolean sunset
    ) implements Serializable {}
}
