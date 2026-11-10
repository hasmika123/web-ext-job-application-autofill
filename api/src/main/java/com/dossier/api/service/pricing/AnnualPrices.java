package com.dossier.api.service.pricing;

/**
 * Annual price derivation (docs/subscriptions/03 section 5.1): YEAR = MONTH x 12 less a discount in basis points, rounded once,
 * half-even. A derived row is a real, immutable price row; the engine never derives at pricing time.
 */
public final class AnnualPrices {

    public static final int MAX_DISCOUNT_BP = 10_000;

    private AnnualPrices() {}

    /** {@code mulDivHalfEven(month * 12, 10000 - discountBp, 10000)}. */
    public static long derive(long monthAmountMinor, int discountBp) {
        if (discountBp < 0 || discountBp > MAX_DISCOUNT_BP) {
            throw new IllegalArgumentException("discountBp out of range: " + discountBp);
        }
        return Minor.mulDivHalfEven(Minor.mul(monthAmountMinor, 12), MAX_DISCOUNT_BP - discountBp, MAX_DISCOUNT_BP);
    }

    /** Precedence: the component discount, else the plan version discount, else the global default (an explicit YEAR row outranks all of them). */
    public static int resolveDiscountBp(Integer componentBp, Integer planBp, int globalDefaultBp) {
        if (componentBp != null) {
            return componentBp;
        }
        return planBp != null ? planBp : globalDefaultBp;
    }

    /** The discount an explicit YEAR price implies against twelve months, in basis points (negative when the year costs more). */
    public static int impliedDiscountBp(long monthAmountMinor, long yearAmountMinor) {
        long span = Minor.mul(monthAmountMinor, 12);
        if (span == 0) {
            return 0;
        }
        return (int) Minor.mulDivHalfEven(span - yearAmountMinor, MAX_DISCOUNT_BP, span);
    }
}
