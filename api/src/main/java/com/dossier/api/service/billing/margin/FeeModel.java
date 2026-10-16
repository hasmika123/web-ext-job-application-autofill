package com.dossier.api.service.billing.margin;

import com.dossier.api.service.pricing.Audience;
import java.util.List;

/**
 * What it costs to collect a price (docs/subscriptions/03 section 7.2). Pure and deterministic; every component is rounded once
 * (half-even). The base line of an invoice carries the per-invoice fixed fees, a feature line never does (it always sits on an
 * invoice with a base). One-time charges carry no recurring-billing fee.
 */
public interface FeeModel {
    FeeModelKind kind();

    /** Stable text of the model and its numbers, stored with a price so a stored margin can be re-read later (B2.1 D5). */
    String fingerprint();

    List<FeeLine> baseFees(long amountMinor, Audience audience);

    List<FeeLine> featureFees(long amountMinor, Audience audience);

    List<FeeLine> oneTimeFees(long amountMinor, Audience audience);

    default long feeBase(long amountMinor, Audience audience) {
        return sum(baseFees(amountMinor, audience));
    }

    default long feeFeature(long amountMinor, Audience audience) {
        return sum(featureFees(amountMinor, audience));
    }

    default long feeOneTime(long amountMinor, Audience audience) {
        return sum(oneTimeFees(amountMinor, audience));
    }

    static long sum(List<FeeLine> lines) {
        long total = 0;
        for (FeeLine l : lines) {
            total = Math.addExact(total, l.cents());
        }
        return total;
    }
}
