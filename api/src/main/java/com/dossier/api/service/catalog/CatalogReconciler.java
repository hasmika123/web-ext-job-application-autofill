package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.StripePriceInfo;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Compares the Stripe Prices Kiwiply created with {@code product_price} and records what differs as {@code billing_drift kind=CATALOG}
 * (docs/subscriptions/07 section 3). <b>It never writes money</b>: no Stripe call besides the read, no price row touched. A difference that stops being
 * true resolves its own drift row on the next run.
 *
 * <ul>
 *   <li>{@code UNKNOWN_PRICE}: a Kiwiply Stripe Price no catalog row points at (edited, created by hand, or an orphan of a rolled-back publish).</li>
 *   <li>{@code AMOUNT_MISMATCH}: amount, currency or interval differs from the row.</li>
 *   <li>{@code ACTIVE_MISMATCH}: a retired row whose Stripe Price is still active, or a live row whose Stripe Price was deactivated.</li>
 *   <li>{@code MISSING_IN_STRIPE}: a live row whose Stripe Price id Stripe does not list.</li>
 * </ul>
 */
@Service
public class CatalogReconciler {

    public static final String KIND = "CATALOG";
    private static final int MAX_PRICES = 5000;
    /** The codes this reconciler owns; other CATALOG rows (the snapshot hash check) are resolved by their own job. */
    private static final Set<String> MANAGED = Set.of("UNKNOWN_PRICE", "AMOUNT_MISMATCH", "ACTIVE_MISMATCH", "MISSING_IN_STRIPE");

    private final StripeGateway gateway;
    private final ProductPriceRepository prices;
    private final BillingDriftRepository drifts;
    private final ObjectMapper mapper;

    public CatalogReconciler(StripeGateway gateway, ProductPriceRepository prices, BillingDriftRepository drifts, ObjectMapper mapper) {
        this.gateway = gateway;
        this.prices = prices;
        this.drifts = drifts;
        this.mapper = mapper;
    }

    /** What one run found. */
    public record Result(boolean ran, int checked, int opened, int resolved, int open) {}

    @Transactional
    public Result run() {
        if (!gateway.isEnabled()) return new Result(false, 0, 0, 0, 0);
        List<StripePriceInfo> stripe = gateway.listPrices(MAX_PRICES);
        Map<String, ProductPrice> byStripeId = new LinkedHashMap<>();
        for (ProductPrice p : prices.findAllPublished()) {
            if (p.getStripePriceId() != null) byStripeId.put(p.getStripePriceId(), p);
        }
        Set<String> current = new HashSet<>();
        int opened = 0;
        Set<String> seen = new HashSet<>();
        for (StripePriceInfo sp : stripe) {
            seen.add(sp.id());
            ProductPrice row = byStripeId.get(sp.id());
            if (row == null) {
                opened += flag(current, "UNKNOWN_PRICE", sp.id(), null, actual(sp));
                continue;
            }
            boolean sameInterval = sp.interval().name().equals(row.getBillingInterval());
            if (sp.unitAmountMinor() != row.getAmountMinor() || !row.getCurrency().equalsIgnoreCase(sp.currency()) || !sameInterval) {
                opened += flag(current, "AMOUNT_MISMATCH", sp.id(), expected(row), actual(sp));
            }
            boolean shouldBeActive = row.getRetiredAt() == null;
            if (sp.active() != shouldBeActive) {
                opened += flag(current, "ACTIVE_MISMATCH", sp.id(), expected(row), actual(sp));
            }
        }
        for (Map.Entry<String, ProductPrice> e : byStripeId.entrySet()) {
            if (!seen.contains(e.getKey()) && e.getValue().getRetiredAt() == null) {
                opened += flag(current, "MISSING_IN_STRIPE", e.getKey(), expected(e.getValue()), null);
            }
        }
        int resolved = 0;
        List<BillingDrift> openRows = drifts.findOpen(KIND);
        for (BillingDrift d : openRows) {
            if (MANAGED.contains(d.getCode()) && !current.contains(d.getCode() + "|" + d.getSubject())) {
                d.setResolvedAt(Instant.now());
                d.setResolvedBy("system");
                d.setNote("No longer differs.");
                drifts.save(d);
                resolved++;
            }
        }
        return new Result(true, stripe.size(), opened, resolved, drifts.findOpen(KIND).size());
    }

    private int flag(Set<String> current, String code, String subject, Map<String, Object> expected, Map<String, Object> actual) {
        current.add(code + "|" + subject);
        if (drifts.findOpenOne(KIND, code, subject).isPresent()) return 0;
        BillingDrift d = new BillingDrift();
        d.setKind(KIND);
        d.setCode(code);
        d.setSubject(subject);
        d.setExpectedJson(json(expected));
        d.setActualJson(json(actual));
        d.setDetectedAt(Instant.now());
        drifts.save(d);
        return 1;
    }

    private static Map<String, Object> expected(ProductPrice p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("priceRowId", p.getId());
        m.put("amountMinor", p.getAmountMinor());
        m.put("currency", p.getCurrency());
        m.put("interval", p.getBillingInterval());
        m.put("active", p.getRetiredAt() == null);
        return m;
    }

    private static Map<String, Object> actual(StripePriceInfo s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("stripePriceId", s.id());
        m.put("amountMinor", s.unitAmountMinor());
        m.put("currency", s.currency());
        m.put("interval", s.interval().name());
        m.put("active", s.active());
        return m;
    }

    private String json(Map<String, Object> m) {
        if (m == null) return null;
        try {
            return mapper.writeValueAsString(m);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
