package com.dossier.api.service.billing.reconcile;

import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.repository.sub.BillingDriftAdminRepository;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.BillingWebhookService;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.dossier.api.security.SecurityUtils;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What a platform admin does about billing drift and missed webhooks (story K8.5): read the drift rows and the attention counts, resolve a row with a
 * reason, replay a Stripe event through the webhook handler. Both writes are HIGH: they need a reason of at least ten characters and leave an
 * {@code admin_audit_event}. None of it moves money: a replay only re-runs the handler that mirrors Stripe's own state into Kiwiply.
 */
@Service
public class BillingOpsService {

    public static final int REASON_MIN_LENGTH = 10;
    private static final Pattern EVENT_ID = Pattern.compile("^evt_[A-Za-z0-9_]{3,120}$");

    private final BillingDriftAdminRepository drifts;
    private final StripeGateway gateway;
    private final BillingWebhookService webhook;
    private final AdminAuditService audit;

    public BillingOpsService(BillingDriftAdminRepository drifts, StripeGateway gateway, BillingWebhookService webhook, AdminAuditService audit) {
        this.drifts = drifts;
        this.gateway = gateway;
        this.webhook = webhook;
        this.audit = audit;
    }

    /** One drift row as the admin sees it. */
    public record DriftDTO(
        Long id,
        String kind,
        String code,
        String subject,
        String expectedJson,
        String actualJson,
        Instant detectedAt,
        Instant resolvedAt,
        String resolvedBy,
        String note
    ) {
        static DriftDTO of(BillingDrift d) {
            return new DriftDTO(d.getId(), d.getKind(), d.getCode(), d.getSubject(), d.getExpectedJson(), d.getActualJson(), d.getDetectedAt(), d.getResolvedAt(), d.getResolvedBy(), d.getNote());
        }
    }

    /** The attention badge: open rows in total and per kind (CATALOG, PERSONAL, ORG, RETIREMENT). */
    public record Attention(long open, Map<String, Long> byKind) {}

    public record DriftPage(Attention attention, long total, int page, int size, List<DriftDTO> items) {}

    /** {@code POST /events/{id}/replay}: the row that records the replay, the event it re-applied and the status. */
    public record ReplayDTO(String replayEventId, String originalEventId, String type, String scope, String status) {}

    @Transactional(readOnly = true)
    public Attention attention() {
        Map<String, Long> by = new LinkedHashMap<>();
        long total = 0;
        for (Object[] r : drifts.openByKind()) {
            long n = ((Number) r[1]).longValue();
            by.put(String.valueOf(r[0]), n);
            total += n;
        }
        return new Attention(total, by);
    }

    @Transactional(readOnly = true)
    public DriftPage list(String kind, String state, int page, int size) {
        String st = state == null || state.isBlank() ? "open" : state.trim().toLowerCase();
        if (!List.of("open", "resolved", "all").contains(st)) throw new BillingException(400, "INVALID_VALUE", "state must be open, resolved or all");
        String k = kind == null || kind.isBlank() ? null : kind.trim().toUpperCase();
        int p = Math.max(0, page);
        int s = Math.max(1, Math.min(size, 200));
        List<DriftDTO> items = drifts.search(k, st, PageRequest.of(p, s)).stream().map(DriftDTO::of).toList();
        return new DriftPage(attention(), drifts.countSearch(k, st), p, s, items);
    }

    /** Resolve an open row by hand (HIGH): the reason is the audit trail of why the difference is acceptable or was fixed elsewhere. */
    @Transactional
    public DriftDTO resolve(Long id, String reason, String note) {
        String why = requireReason(reason, "Resolving a drift row");
        BillingDrift d = drifts.findById(id).orElseThrow(() -> new BillingException(404, "DRIFT_NOT_FOUND", "No such drift row"));
        if (d.getResolvedAt() != null) throw new BillingException(409, "DRIFT_RESOLVED", "This drift row is already resolved");
        d.setResolvedAt(Instant.now());
        d.setResolvedBy(SecurityUtils.getCurrentUserLogin().orElse("system"));
        String text = (note == null || note.isBlank() ? why : why + " - " + note.trim());
        d.setNote(text.length() > 500 ? text.substring(0, 500) : text);
        drifts.save(d);
        audit.record(AdminAuditService.BILLING_DRIFT_RESOLVE, AdminAuditService.TARGET_BILLING, "drift:" + id, why, "risk=HIGH kind=" + d.getKind() + " code=" + d.getCode());
        return DriftDTO.of(d);
    }

    /**
     * Fetch the event from Stripe by id and run it through the webhook handler again (HIGH). Billing off: 503 BILLING_DISABLED. Unknown id (or older than
     * Stripe's 30 days): 404 EVENT_NOT_FOUND. A handler failure: 500 REPLAY_FAILED, recorded on the replay row.
     */
    public ReplayDTO replay(String eventId, String reason) {
        String why = requireReason(reason, "Replaying an event");
        if (eventId == null || !EVENT_ID.matcher(eventId).matches()) throw new BillingException(400, "INVALID_VALUE", "Not a Stripe event id");
        if (!gateway.isEnabled()) throw BillingException.disabled();
        StripeWebhookEvent event;
        try {
            event = gateway.retrieveEvent(eventId);
        } catch (StripeGatewayException e) {
            if (e.getKind() == StripeGatewayException.Kind.NOT_ENABLED) throw BillingException.disabled();
            if ("resource_missing".equals(e.getStripeCode())) throw new BillingException(404, "EVENT_NOT_FOUND", "Stripe has no event with this id (events are kept for 30 days)");
            throw new BillingException(502, BillingException.CODE_STRIPE_ERROR, "Stripe could not be read");
        }
        String actor = SecurityUtils.getCurrentUserLogin().orElse("system");
        BillingWebhookService.ReplayResult result;
        try {
            result = webhook.replay(event, actor);
        } catch (RuntimeException e) {
            audit.record(AdminAuditService.BILLING_EVENT_REPLAY, AdminAuditService.TARGET_BILLING, eventId, why, "risk=HIGH type=" + event.type() + " outcome=failed");
            throw new BillingException(500, "REPLAY_FAILED", "The event was fetched but applying it failed; see the replay row in the event log");
        }
        audit.record(
            AdminAuditService.BILLING_EVENT_REPLAY,
            AdminAuditService.TARGET_BILLING,
            eventId,
            why,
            "risk=HIGH type=" + event.type() + " replay=" + result.replayRowId()
        );
        return new ReplayDTO(result.replayRowId(), eventId, event.type(), event.isOrgScoped() ? "org" : "personal", result.status());
    }

    private static String requireReason(String reason, String what) {
        if (reason == null || reason.trim().length() < REASON_MIN_LENGTH) {
            throw new BillingException(422, "REASON_REQUIRED", what + " needs a reason of at least " + REASON_MIN_LENGTH + " characters.");
        }
        return reason.trim();
    }
}
