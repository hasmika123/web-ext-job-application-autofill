package com.dossier.api.service.billing.margin;

import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.Minor;
import java.util.ArrayList;
import java.util.List;

/**
 * The B2.1 schedule: card + billing + (Managed Payments, or Stripe Tax at its registered share) + the blended international and FX
 * fee + the dispute allowance + the email cost. Managed Payments replaces tax and dispute fees (the merchant of record carries
 * them). ORG prices add the invoicing fee. Fixed card fee, dispute and email are per invoice, so they sit on the base line only;
 * a one-time charge has no recurring-billing fee and no email.
 */
public record ScheduleFeeModel(FeeSchedule s, int invoicingBp) implements FeeModel {
    public ScheduleFeeModel {
        if (invoicingBp < 0) {
            throw new IllegalArgumentException("invoicingBp must be >= 0");
        }
    }

    @Override
    public FeeModelKind kind() {
        return FeeModelKind.SCHEDULE;
    }

    @Override
    public String fingerprint() {
        return "SCHEDULE:" + s.hashCode() + ":" + invoicingBp;
    }

    private List<FeeLine> percentages(long p, Audience audience, boolean recurring) {
        List<FeeLine> out = new ArrayList<>();
        out.add(new FeeLine("card_pct", Minor.mulDivHalfEven(p, s.cardPctBp(), 10_000)));
        if (audience == Audience.ORG && invoicingBp > 0) {
            out.add(new FeeLine("invoicing_pct", Minor.mulDivHalfEven(p, invoicingBp, 10_000)));
        }
        if (recurring) {
            out.add(new FeeLine("billing_pct", Minor.mulDivHalfEven(p, s.billingPctBp(), 10_000)));
        }
        if (s.morEnabled()) {
            out.add(new FeeLine("mor_pct", Minor.mulDivHalfEven(p, s.morPctBp(), 10_000)));
        } else if (s.taxEnabled()) {
            out.add(new FeeLine("tax_pct", Minor.mulDivHalfEven(p, (long) s.taxPctBp() * s.taxShareBp(), 100_000_000L)));
        }
        out.add(new FeeLine("intl_fx_blend", Minor.mulDivHalfEven(p, (long) s.intlShareBp() * (s.intlPctBp() + s.fxPctBp()), 100_000_000L)));
        return out;
    }

    @Override
    public List<FeeLine> baseFees(long p, Audience audience) {
        List<FeeLine> out = percentages(p, audience, true);
        out.add(new FeeLine("card_fixed", s.cardFixedCents()));
        if (!s.morEnabled()) {
            out.add(new FeeLine("dispute", Minor.mulDivHalfEven(s.disputeCents(), s.disputeRateBp(), 10_000)));
        }
        out.add(new FeeLine("email", s.emailCents()));
        return out;
    }

    @Override
    public List<FeeLine> featureFees(long p, Audience audience) {
        return percentages(p, audience, true);
    }

    @Override
    public List<FeeLine> oneTimeFees(long p, Audience audience) {
        List<FeeLine> out = percentages(p, audience, false);
        out.add(new FeeLine("card_fixed", s.cardFixedCents()));
        if (!s.morEnabled()) {
            out.add(new FeeLine("dispute", Minor.mulDivHalfEven(s.disputeCents(), s.disputeRateBp(), 10_000)));
        }
        return out;
    }
}
