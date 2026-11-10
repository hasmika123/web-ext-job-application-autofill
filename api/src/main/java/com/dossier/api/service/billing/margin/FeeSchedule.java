package com.dossier.api.service.billing.margin;

/**
 * The B2.1 fee schedule in basis points (docs/design/pay/fee-model-and-margin-guard.md section 2, F2). Every number is a runtime setting.
 * Worst case = every variable cost spent at the blended-international fee: intlShareBp of payments carry intl + fx on top.
 */
public record FeeSchedule(
    int cardPctBp,
    long cardFixedCents,
    int billingPctBp,
    boolean morEnabled,
    int morPctBp,
    boolean taxEnabled,
    int taxPctBp,
    int taxShareBp,
    int intlPctBp,
    int fxPctBp,
    int intlShareBp,
    int disputeRateBp,
    long disputeCents,
    long emailCents
) {
    public static final FeeSchedule DEFAULTS = new FeeSchedule(290, 30, 70, false, 350, false, 50, 3000, 150, 100, 2500, 20, 1500, 2);

    public FeeSchedule {
        if (cardPctBp < 0 || cardFixedCents < 0 || billingPctBp < 0 || morPctBp < 0 || taxPctBp < 0 || intlPctBp < 0 || fxPctBp < 0) {
            throw new IllegalArgumentException("fees must be >= 0");
        }
        if (taxShareBp < 0 || taxShareBp > 10_000 || intlShareBp < 0 || intlShareBp > 10_000 || disputeRateBp < 0 || disputeRateBp > 10_000) {
            throw new IllegalArgumentException("shares must be within 0..10000 bp");
        }
        if (disputeCents < 0 || emailCents < 0) {
            throw new IllegalArgumentException("fees must be >= 0");
        }
    }
}
