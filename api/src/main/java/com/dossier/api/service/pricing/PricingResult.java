package com.dossier.api.service.pricing;

import java.util.List;
import java.util.Set;

/** The priced basket: every line with its full chain, group totals (seat_total for an org license), and the totals of 03 section 4. */
public record PricingResult(
    Audience audience,
    String currency,
    BillingInterval interval,
    List<GroupResult> groups,
    long recurringMinor,
    long listTotalMinor,
    long discountTotalMinor,
    long contractDiscountMinor,
    long promotionalDiscountMinor,
    long tierDiscountMinor,
    String appliedDiscountName,
    Long appliedDiscountId,
    Set<Long> appliedTierIds,
    Integer appliedTierMinLicensed,
    long aiMonthlyCents,
    long aiWindowCents
) {
    public enum Applied {
        CONTRACT,
        DISCOUNT,
        TIER,
    }

    public record LineResult(
        String groupKey,
        String lineKey,
        String productCode,
        String priceId,
        int quantity,
        long unitListMinor,
        long unitContractMinor,
        long unitDiscountMinor,
        long unitEffectiveMinor,
        long lineTotalMinor,
        List<Applied> applied,
        int aiBudgetCentsPerWindow
    ) {}

    public record GroupResult(String groupKey, List<LineResult> lines, long totalMinor, long listTotalMinor) {}

    public GroupResult group(String key) {
        return groups.stream().filter(g -> g.groupKey().equals(key)).findFirst().orElseThrow(() -> new IllegalArgumentException("no group " + key));
    }

    public long groupTotal(String key) {
        return group(key).totalMinor();
    }
}
