package com.dossier.api.service.billing.reconcile;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.billing.Invoice;
import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.sub.PersonalSubscriptionChange;
import com.dossier.api.domain.sub.SubscriptionAddon;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.repository.sub.InvoiceRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.PriceLookupRepository;
import com.dossier.api.repository.sub.ReconcileSubscriptionRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.InvoiceSummary;
import com.dossier.api.service.billing.StripeGateway.SubscriptionSnapshot;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

/**
 * The nightly personal reconciler (story K8.5, docs/subscriptions/07 section 7): compares what Stripe holds for a subscriber with Kiwiply's mirror and
 * records every difference as a {@code billing_drift} row of kind {@code PERSONAL}. <b>It is read-only twice over</b>: it calls only the gateway's read methods
 * ({@code retrieveSubscription}, {@code listInvoices}) and it writes only drift rows, never {@code subscription}, {@code subscription_addon} or {@code invoice}
 * rows and never anything in Stripe. A human decides what to do (replay an event, fix in the dashboard, resolve with a reason).
 *
 * <p>Which rows: status active, past_due or trialing with a Stripe subscription id whose last webhook is older than 36 hours (or never came), plus a daily
 * sample of one seventh of the rest, so every row is compared at least weekly. Bounded by {@code maxPerRun} and paced by {@code delayMs} between rows.
 *
 * <p>Codes (the drift row's {@code code}; {@code subject} is the Stripe subscription id, with {@code /detail} where one subscription can have several):
 * <ul>
 *   <li>{@code STATUS}: the status or the cancel-at-period-end flag differs, or Stripe has no such subscription ({@code /missing}).</li>
 *   <li>{@code PERIOD}: the current period end (or start) differs by more than two minutes.</li>
 *   <li>{@code PRICE}: the base item's price differs from {@code subscription.price_id}.</li>
 *   <li>{@code QUANTITY}: an add-on's quantity in Stripe differs from the live {@code subscription_addon} row ("Stripe has 2, we have 1"), including an
 *       add-on present on one side only. Features with a Kiwiply change still in flight are left alone (Kiwiply owns the quantity until it settles).</li>
 *   <li>{@code SCHEDULE}: Stripe has a subscription schedule no change of ours accounts for, or a scheduled change of ours points at a schedule Stripe lacks.</li>
 *   <li>{@code INVOICE_MISSING} / {@code INVOICE_STATUS}: an invoice Stripe lists that the mirror lacks, or whose status or amount paid differs.</li>
 * </ul>
 * A difference that stops being true resolves its own drift row on the next run that checks the subscription.
 */
@Service
public class PersonalBillingReconciler {

    private static final Logger LOG = LoggerFactory.getLogger(PersonalBillingReconciler.class);

    public static final String KIND = "PERSONAL";
    static final Duration STALE_AFTER = Duration.ofHours(36);
    static final Duration PERIOD_TOLERANCE = Duration.ofMinutes(2);
    static final int INVOICES_PER_SUBSCRIBER = 10;
    static final int PAGE = 100;
    private static final Set<String> OPEN_CHANGE = Set.of("PENDING", "APPLYING", "FAILED");

    private final StripeGateway gateway;
    private final ReconcileSubscriptionRepository subscriptions;
    private final PriceLookupRepository prices;
    private final ProductRepository products;
    private final SubscriptionAddonRepository addons;
    private final PersonalSubscriptionChangeRepository changes;
    private final InvoiceRepository invoices;
    private final BillingDriftRepository drifts;
    private final ObjectMapper mapper;
    private final long delayMs;
    private final int maxPerRun;

    public PersonalBillingReconciler(
        StripeGateway gateway,
        ReconcileSubscriptionRepository subscriptions,
        PriceLookupRepository prices,
        ProductRepository products,
        SubscriptionAddonRepository addons,
        PersonalSubscriptionChangeRepository changes,
        InvoiceRepository invoices,
        BillingDriftRepository drifts,
        ObjectMapper mapper,
        @Value("${dossier.billing.reconcile.delay-ms:100}") long delayMs,
        @Value("${dossier.billing.reconcile.max-per-run:1000}") int maxPerRun
    ) {
        this.gateway = gateway;
        this.subscriptions = subscriptions;
        this.prices = prices;
        this.products = products;
        this.addons = addons;
        this.changes = changes;
        this.invoices = invoices;
        this.drifts = drifts;
        this.mapper = mapper;
        this.delayMs = delayMs;
        this.maxPerRun = maxPerRun;
    }

    /** What one run did. {@code ran} is false when billing is off. */
    public record Result(boolean ran, int checked, int failed, int opened, int resolved, int open) {}

    /** One thing that differs: the drift code, subject and the two sides. */
    record Finding(String code, String subject, Map<String, Object> expected, Map<String, Object> actual) {}

    public Result run() {
        return run(Instant.now());
    }

    Result run(Instant now) {
        if (!gateway.isEnabled()) return new Result(false, 0, 0, 0, 0, 0);
        Instant cutoff = now.minus(STALE_AFTER);
        int bucket = (int) (LocalDate.ofInstant(now, ZoneOffset.UTC).toEpochDay() % 7);
        int checked = 0;
        int failed = 0;
        int opened = 0;
        int resolved = 0;
        for (int page = 0; checked + failed < maxPerRun; page++) {
            List<Subscription> rows = subscriptions.findDue(cutoff, bucket, PageRequest.of(page, PAGE));
            if (rows.isEmpty()) break;
            for (Subscription row : rows) {
                if (checked + failed >= maxPerRun) break;
                try {
                    int[] r = reconcile(row);
                    opened += r[0];
                    resolved += r[1];
                    checked++;
                } catch (StripeGatewayException e) {
                    // One unreachable subscription must not stop the night; its drift (if any) stays as it was.
                    failed++;
                    LOG.warn("personal reconcile: could not read subscription row {} from Stripe: {}", row.getId(), e.getKind());
                }
                pause();
            }
            if (rows.size() < PAGE) break;
        }
        int open = drifts.findOpen(KIND).size();
        return new Result(true, checked, failed, opened, resolved, open);
    }

    private void pause() {
        if (delayMs <= 0) return;
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Compare one subscriber with Stripe, ignoring the selection rules; returns {opened, resolved}. Throws {@link StripeGatewayException} when Stripe cannot be
     * read. Public so a scenario test can reconcile the subscription it just drove.
     */
    public int[] reconcile(Subscription row) {
        String subId = row.getStripeSubscriptionId();
        SubscriptionSnapshot snap = gateway.retrieveSubscription(subId);
        List<Finding> findings = new ArrayList<>(compareSubscription(row, snap));
        if (snap != null && row.getStripeCustomerId() != null) {
            findings.addAll(compareInvoices(row, gateway.listInvoices(row.getStripeCustomerId(), INVOICES_PER_SUBSCRIBER, null)));
        }
        Set<String> current = new HashSet<>();
        int opened = 0;
        for (Finding f : findings) {
            if (current.add(f.code() + "|" + f.subject())) opened += flag(f);
        }
        int resolved = 0;
        for (BillingDrift d : drifts.findOpen(KIND)) {
            if (d.getSubject() == null || !(d.getSubject().equals(subId) || d.getSubject().startsWith(subId + "/"))) continue;
            if (!current.contains(d.getCode() + "|" + d.getSubject())) {
                d.setResolvedAt(Instant.now());
                d.setResolvedBy("system");
                d.setNote("No longer differs.");
                drifts.save(d);
                resolved++;
            }
        }
        return new int[] { opened, resolved };
    }

    // ---------------------------------------------------------------------------------------------------------------- comparison

    List<Finding> compareSubscription(Subscription row, SubscriptionSnapshot snap) {
        String subId = row.getStripeSubscriptionId();
        List<Finding> out = new ArrayList<>();
        if (snap == null) {
            out.add(new Finding("STATUS", subId + "/missing", map("status", lower(row.getStatus())), map("status", "missing_in_stripe")));
            return out;
        }
        if (!lower(row.getStatus()).equals(lower(snap.status()))) {
            out.add(new Finding("STATUS", subId, map("status", lower(row.getStatus())), map("status", lower(snap.status()))));
        }
        if (row.isCancelAtPeriodEnd() != snap.cancelAtPeriodEnd()) {
            out.add(new Finding("STATUS", subId + "/cancel", map("cancelAtPeriodEnd", row.isCancelAtPeriodEnd()), map("cancelAtPeriodEnd", snap.cancelAtPeriodEnd())));
        }
        if (differs(row.getCurrentPeriodEnd(), snap.periodEnd()) || (row.getCurrentPeriodStart() != null && differs(row.getCurrentPeriodStart(), snap.periodStart()))) {
            out.add(
                new Finding(
                    "PERIOD",
                    subId,
                    map("periodStart", row.getCurrentPeriodStart(), "periodEnd", row.getCurrentPeriodEnd()),
                    map("periodStart", snap.periodStart(), "periodEnd", snap.periodEnd())
                )
            );
        }
        StripeWebhookEvent.Item base = snap.items().isEmpty() ? null : snap.items().get(0);
        if (row.getPriceId() != null && base != null && !row.getPriceId().equals(base.priceId())) {
            out.add(new Finding("PRICE", subId, map("priceId", row.getPriceId()), map("priceId", base.priceId())));
        }
        out.addAll(compareItems(row, snap));
        out.addAll(compareSchedule(row, snap));
        return out;
    }

    private List<Finding> compareItems(Subscription row, SubscriptionSnapshot snap) {
        List<Finding> out = new ArrayList<>();
        if (row.getId() == null) return out;
        String subId = row.getStripeSubscriptionId();
        Map<String, ProductPrice> byStripe = new HashMap<>();
        List<String> ids = snap.items().stream().map(StripeWebhookEvent.Item::priceId).filter(java.util.Objects::nonNull).toList();
        if (!ids.isEmpty()) for (ProductPrice p : prices.findByStripePriceIdIn(ids)) byStripe.put(p.getStripePriceId(), p);
        Map<String, Long> stripeQty = new LinkedHashMap<>();
        for (StripeWebhookEvent.Item item : snap.items()) {
            ProductPrice price = byStripe.get(item.priceId());
            if (price == null) continue; // not a catalog price (the legacy env prices): nothing to compare
            Optional<Product> product = products.findById(price.getProductId());
            if (product.isEmpty() || product.get().getFeatureKey() == null || "SUBSCRIPTION".equals(product.get().getKind())) continue;
            stripeQty.merge(product.get().getFeatureKey(), item.quantity(), Long::sum);
        }
        Map<String, Long> ours = new LinkedHashMap<>();
        for (SubscriptionAddon a : addons.findBySubscriptionIdAndLiveTrueOrderByIdAsc(row.getId())) {
            if (a.getEndsAt() != null) continue; // scheduled for removal: Stripe's item is already out, the customer keeps it to the period end
            ours.merge(a.getFeatureKey(), (long) a.getQuantity(), Long::sum);
        }
        Set<String> inFlight = openChangeFeatures(row.getId());
        Set<String> features = new TreeSet<>(stripeQty.keySet());
        features.addAll(ours.keySet());
        for (String feature : features) {
            if (inFlight.contains(feature)) continue;
            long theirs = stripeQty.getOrDefault(feature, 0L);
            long mine = ours.getOrDefault(feature, 0L);
            if (theirs != mine) {
                out.add(new Finding("QUANTITY", subId + "/" + feature, map("featureKey", feature, "quantity", mine), map("featureKey", feature, "quantity", theirs)));
            }
        }
        return out;
    }

    private Set<String> openChangeFeatures(Long subscriptionId) {
        Set<String> out = new HashSet<>();
        for (PersonalSubscriptionChange c : changes.findBySubscriptionIdAndStatusInOrderByIdAsc(subscriptionId, OPEN_CHANGE)) {
            if (c.getFeatureKey() != null) out.add(c.getFeatureKey());
        }
        return out;
    }

    private List<Finding> compareSchedule(Subscription row, SubscriptionSnapshot snap) {
        List<Finding> out = new ArrayList<>();
        if (row.getId() == null) return out;
        String subId = row.getStripeSubscriptionId();
        List<String> refs = changes
            .findBySubscriptionIdAndStatusInOrderByIdAsc(row.getId(), Set.of("PENDING", "APPLYING"))
            .stream()
            .map(PersonalSubscriptionChange::getStripeRef)
            .filter(r -> r != null && r.startsWith("sub_sched"))
            .toList();
        if (snap.scheduleId() != null && !refs.contains(snap.scheduleId())) {
            out.add(new Finding("SCHEDULE", subId, map("scheduleId", refs.isEmpty() ? null : refs.get(0)), map("scheduleId", snap.scheduleId())));
        } else if (snap.scheduleId() == null && !refs.isEmpty()) {
            out.add(new Finding("SCHEDULE", subId, map("scheduleId", refs.get(0)), map("scheduleId", null)));
        }
        return out;
    }

    List<Finding> compareInvoices(Subscription row, List<InvoiceSummary> stripe) {
        List<Finding> out = new ArrayList<>();
        String subId = row.getStripeSubscriptionId();
        for (InvoiceSummary s : stripe) {
            if (s.id() == null || "draft".equalsIgnoreCase(s.status())) continue;
            if (s.subscriptionId() != null && !s.subscriptionId().equals(subId)) continue;
            Optional<Invoice> mirrored = invoices.findByStripeInvoiceId(s.id());
            if (mirrored.isEmpty()) {
                out.add(new Finding("INVOICE_MISSING", subId + "/" + s.id(), null, map("status", lower(s.status()), "amountPaidMinor", s.amountPaidMinor())));
                continue;
            }
            Invoice m = mirrored.get();
            if (!lower(m.getStatus()).equals(lower(s.status())) || m.getAmountPaidMinor() != s.amountPaidMinor()) {
                out.add(
                    new Finding(
                        "INVOICE_STATUS",
                        subId + "/" + s.id(),
                        map("status", lower(m.getStatus()), "amountPaidMinor", m.getAmountPaidMinor()),
                        map("status", lower(s.status()), "amountPaidMinor", s.amountPaidMinor())
                    )
                );
            }
        }
        return out;
    }

    // ---------------------------------------------------------------------------------------------------------------- drift rows

    private int flag(Finding f) {
        String subject = f.subject().length() > 160 ? f.subject().substring(0, 160) : f.subject();
        if (drifts.findOpenOne(KIND, f.code(), subject).isPresent()) return 0;
        BillingDrift d = new BillingDrift();
        d.setKind(KIND);
        d.setCode(f.code());
        d.setSubject(subject);
        d.setExpectedJson(json(f.expected()));
        d.setActualJson(json(f.actual()));
        d.setDetectedAt(Instant.now());
        drifts.save(d);
        return 1;
    }

    private static boolean differs(Instant a, Instant b) {
        if (a == null && b == null) return false;
        if (a == null || b == null) return true;
        return Duration.between(a, b).abs().compareTo(PERIOD_TOLERANCE) > 0;
    }

    private static String lower(String s) {
        return s == null ? "" : s.trim().toLowerCase();
    }

    /** Alternating key/value pairs; nulls allowed. */
    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put((String) kv[i], kv[i + 1] instanceof Instant t ? t.toString() : kv[i + 1]);
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
