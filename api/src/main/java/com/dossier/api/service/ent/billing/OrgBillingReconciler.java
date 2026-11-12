package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.privacy.JobLeaseService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Nightly (03:20 UTC, job lease): checks every organization invoice Kiwiply still holds open against Stripe (docs/enterprise-v2/26 s9,
 * ORG-BILLING-BUILD.md step 3b). For each Stripe-billed account, each open {@code source = STRIPE} mirror is read back from Stripe
 * ({@code retrieveInvoice}, read-only):
 * <ul>
 *   <li>a different status or amount paid becomes a {@code billing_drift} row ({@code kind ORG}, code {@code INVOICE_STATUS});</li>
 *   <li>an invoice Stripe no longer has becomes code {@code INVOICE_MISSING}.</li>
 * </ul>
 * One open row per finding (no duplicates night after night). The rows show on the platform admin's billing operations page with the personal ones.
 * <b>It never fixes money or the mirror itself</b>: a person looks and resolves, usually by replaying the webhook. Idle while Stripe is off.
 */
@Component
public class OrgBillingReconciler {

    private static final Logger LOG = LoggerFactory.getLogger(OrgBillingReconciler.class);
    public static final String KIND = "ORG";
    public static final String LEASE = "org-billing-reconcile";
    static final Duration LEASE_TTL = Duration.ofMinutes(30);

    public record Result(int checked, int flagged, int failed) {}

    private final JdbcTemplate jdbc;
    private final OrgInvoiceRepository invoices;
    private final BillingDriftRepository drifts;
    private final StripeGateway stripe;
    private final OrgBillingStartService starts;
    private final JobLeaseService leases;
    private final ObjectMapper mapper;

    public OrgBillingReconciler(
        JdbcTemplate jdbc,
        OrgInvoiceRepository invoices,
        BillingDriftRepository drifts,
        StripeGateway stripe,
        OrgBillingStartService starts,
        JobLeaseService leases,
        ObjectMapper mapper
    ) {
        this.jdbc = jdbc;
        this.invoices = invoices;
        this.drifts = drifts;
        this.stripe = stripe;
        this.starts = starts;
        this.leases = leases;
        this.mapper = mapper;
    }

    @Scheduled(cron = "${dossier.ent.billing-reconcile-cron:0 20 3 * * *}", zone = "UTC")
    public void scheduled() {
        try {
            leases
                .withLease(LEASE, LEASE_TTL, Instant.now(), this::run, r -> "checked=" + r.checked() + " flagged=" + r.flagged() + " failed=" + r.failed())
                .filter(r -> r.flagged() > 0 || r.failed() > 0)
                .ifPresent(r -> LOG.warn("Organization billing reconciler: {} checked, {} drift rows, {} failed", r.checked(), r.flagged(), r.failed()));
        } catch (RuntimeException e) {
            LOG.warn("Organization billing reconciler failed", e); // the next night retries
        }
    }

    /** One pass over every Stripe-billed organization. */
    public Result run() {
        if (!starts.stripeReady()) return new Result(0, 0, 0);
        int checked = 0;
        int flagged = 0;
        int failed = 0;
        for (Long orgId : jdbc.queryForList("select org_id from org_billing_account where stripe_customer_id is not null order by org_id", Long.class)) {
            for (OrgInvoice mine : invoices.findByOrgIdAndSourceAndStatus(orgId, "STRIPE", "OPEN")) {
                if (mine.getStripeInvoiceId() == null || mine.getStripeInvoiceId().isBlank()) continue;
                checked++;
                try {
                    StripeGateway.InvoiceSummary theirs = stripe.retrieveInvoice(mine.getStripeInvoiceId());
                    String status = OrgInvoiceComposer.status(theirs.status());
                    if (!status.equals(mine.getStatus()) || theirs.amountPaidMinor() != (mine.getAmountPaidMinor() == null ? 0L : mine.getAmountPaidMinor())) {
                        flagged += flag(orgId, "INVOICE_STATUS", mine,
                            map("status", mine.getStatus(), "amountPaidMinor", mine.getAmountPaidMinor()),
                            map("status", status, "amountPaidMinor", theirs.amountPaidMinor()));
                    }
                } catch (StripeGatewayException e) {
                    if (e.getKind() == StripeGatewayException.Kind.INVALID_REQUEST) {
                        flagged += flag(orgId, "INVOICE_MISSING", mine, map("stripeInvoiceId", mine.getStripeInvoiceId()), map("error", "not found in Stripe"));
                    } else {
                        failed++;
                        LOG.warn("Could not read invoice {} of organization {} from Stripe ({})", mine.getStripeInvoiceId(), orgId, e.getKind());
                    }
                }
            }
        }
        return new Result(checked, flagged, failed);
    }

    private int flag(Long orgId, String code, OrgInvoice inv, Map<String, Object> expected, Map<String, Object> actual) {
        String subject = ("org " + orgId + " invoice " + inv.getInvoiceNumber() + " (" + inv.getStripeInvoiceId() + ")");
        if (subject.length() > 160) subject = subject.substring(0, 160);
        Optional<BillingDrift> open = drifts.findOpenOne(KIND, code, subject);
        if (open.isPresent()) return 0;
        BillingDrift d = new BillingDrift();
        d.setOrgId(orgId);
        d.setKind(KIND);
        d.setCode(code);
        d.setSubject(subject);
        d.setExpectedJson(json(expected));
        d.setActualJson(json(actual));
        d.setDetectedAt(Instant.now());
        drifts.save(d);
        return 1;
    }

    private static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private String json(Map<String, Object> m) {
        try {
            return mapper.writeValueAsString(m);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /** For the tests: the rows written are those of {@link #KIND}. */
    static List<String> codes() {
        return List.of("INVOICE_STATUS", "INVOICE_MISSING");
    }
}
