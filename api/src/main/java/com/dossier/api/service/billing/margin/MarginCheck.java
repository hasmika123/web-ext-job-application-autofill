package com.dossier.api.service.billing.margin;

import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import java.util.List;

/**
 * One evaluated row: the amounts, the margin in basis points (floor division) against the floor, and the levers. {@code overridable}
 * is false for discount rows (and tier rows): a discount that fails is refused, a reason does not help.
 * {@code code} is the API error code when the check fails (MARGIN_BELOW_FLOOR or TIER_BELOW_FLOOR).
 */
public record MarginCheck(
    String featureKey,
    CheckKind kind,
    BillingInterval interval,
    String currency,
    Audience audience,
    long amountMinor,
    long aiCostMinor,
    long feeMinor,
    List<FeeLine> feeLines,
    long marginBp,
    long floorBp,
    boolean pass,
    boolean overridable,
    String code,
    MarginLevers levers
) {
    public MarginCheck {
        feeLines = feeLines == null ? List.of() : List.copyOf(feeLines);
    }
}
