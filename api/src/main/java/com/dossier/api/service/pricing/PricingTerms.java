package com.dossier.api.service.pricing;

import java.util.List;
import java.util.Set;

/** Commercial terms an ORG quote can carry (docs/enterprise-v2/22 section 2, 23). Individuals never have them. */
public final class PricingTerms {

    private PricingTerms() {}

    /** One row of an org contract: exactly one of the two overrides is set; {@code productCode == null} applies to every product. */
    public record ContractRow(String productCode, Long overrideAmountMinor, Integer overridePctOffBp) {
        public ContractRow {
            if ((overrideAmountMinor == null) == (overridePctOffBp == null)) {
                throw new IllegalArgumentException("exactly one override per contract row");
            }
            if (overrideAmountMinor != null && overrideAmountMinor < 0) {
                throw new IllegalArgumentException("override amount must be >= 0");
            }
        }
    }

    public record ContractTerms(String contractId, int version, String currency, boolean stackable, boolean volumeApplies, List<ContractRow> rows) {
        public ContractTerms {
            rows = rows == null ? List.of() : List.copyOf(rows);
        }
    }

    public enum DiscountKind {
        PERCENT,
        AMOUNT_PER_UNIT,
    }

    /** An eligible promotional org discount (the loader has already checked window, eligibility and cap). Empty scope sets mean "all". */
    public record OrgDiscount(
        long id,
        String name,
        DiscountKind kind,
        int pctOffBp,
        long amountOffMinor,
        String currency,
        Set<String> scopeKinds,
        Set<String> scopeProductCodes
    ) {
        public OrgDiscount {
            scopeKinds = scopeKinds == null ? Set.of() : Set.copyOf(scopeKinds);
            scopeProductCodes = scopeProductCodes == null ? Set.of() : Set.copyOf(scopeProductCodes);
        }

        public boolean appliesTo(PriceRow row) {
            boolean kindOk = scopeKinds.isEmpty() || scopeKinds.contains(row.kind());
            boolean productOk = scopeProductCodes.isEmpty() || scopeProductCodes.contains(row.productCode());
            return kindOk && productOk;
        }
    }

    /** A volume tier; empty {@code productCodes} means "all products" (a specific product tier beats an all-products one). */
    public record VolumeTier(long id, int minLicensed, int pctOffBp, Set<String> productCodes) {
        public VolumeTier {
            productCodes = productCodes == null ? Set.of() : Set.copyOf(productCodes);
        }
    }
}
