package com.dossier.api.service.billing.margin;

import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.Minor;
import java.util.List;

/**
 * 2.9 percent + 30 cents (catalog.stripe.pct_bp, catalog.stripe.fixed_cents); ORG prices add the Stripe Invoicing fee
 * (catalog.stripe.invoicing_bp) because organizations pay by send_invoice. fee_base = mulDiv(p, pct + inv, 10000) + fixed.
 */
public record SimpleFeeModel(int pctBp, long fixedCents, int invoicingBp) implements FeeModel {
    public SimpleFeeModel {
        if (pctBp < 0 || fixedCents < 0 || invoicingBp < 0) {
            throw new IllegalArgumentException("fees must be >= 0");
        }
    }

    @Override
    public FeeModelKind kind() {
        return FeeModelKind.SIMPLE;
    }

    @Override
    public String fingerprint() {
        return "SIMPLE:" + pctBp + "/" + fixedCents + "/" + invoicingBp;
    }

    private long pct(long amountMinor, Audience audience) {
        return Minor.mulDivHalfEven(amountMinor, pctBp + (audience == Audience.ORG ? invoicingBp : 0), 10_000);
    }

    @Override
    public List<FeeLine> baseFees(long amountMinor, Audience audience) {
        return List.of(new FeeLine("card_pct", pct(amountMinor, audience)), new FeeLine("card_fixed", fixedCents));
    }

    @Override
    public List<FeeLine> featureFees(long amountMinor, Audience audience) {
        return List.of(new FeeLine("card_pct", pct(amountMinor, audience)));
    }

    @Override
    public List<FeeLine> oneTimeFees(long amountMinor, Audience audience) {
        return baseFees(amountMinor, audience);
    }
}
