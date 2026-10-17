package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.domain.sub.PersonalSubscriptionChange;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.repository.sub.PlanRetirementRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.personal.PersonalBasket;
import com.dossier.api.service.billing.personal.SubscriptionChangeApplier;
import com.dossier.api.service.billing.personal.SubscriptionChangeService;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.retirement.SuccessorAdvisor.Evaluation;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * What happens on the day (docs/subscriptions/11-plan-retirement.md sections 7 and 9; stories K10.5 and K10.8). Every 15 minutes, in this order, each step idempotent:
 *
 * <ol>
 *   <li><b>Cancel lead (D-1).</b> An undecided subscriber whose date is within {@code billing.retirement.cancel_lead_hours} (36) is told to Stripe as "end at the period end",
 *       once, so no new invoice is ever created for a retiring plan. Only the undecided: someone who chose a switch keeps the schedule they chose.</li>
 *   <li><b>Migrations.</b> For a retirement whose default outcome is MIGRATE_AT_RENEWAL, each undecided subscriber gets their schedule to the rank-1 successor (key
 *       {@code ret-{id}-{sub}-sched}) as soon as the retirement is running; a price that is now higher is never scheduled.</li>
 *   <li><b>Effective date.</b> An item whose date has come (and that a renewal has not pushed later: the date only moves later) is applied: a scheduled switch takes effect in
 *       Kiwiply, a MIGRATE moves them to the successor, and everyone else falls back to Free with the read-only lock (11 section 7): the live Free version, the add-on lines
 *       ended, a {@code service_lock} row for every service they held that Free does not include, a {@code FALLBACK_FREE} change with the previous version, the "what changed"
 *       flag and the confirmation notice. <b>Nothing is deleted</b>: no resume, version, message, match or transcript is touched, and over-cap data stays whole.</li>
 *   <li><b>Complete.</b> A retirement with nobody left is completed and the plan reaches RETIRED.</li>
 * </ol>
 * Nothing in the first two steps changes what any subscriber can use; the third happens only on or after their own date. A failure on one subscriber is logged and retried on
 * the next run (the same keys replay, never charge twice) and does not stop the others.
 */
@Component
public class RetirementJob {

    private static final Logger LOG = LoggerFactory.getLogger(RetirementJob.class);

    private final PlanRetirementRepository retirements;
    private final PlanRetirementItemRepository itemRepo;
    private final SubscriptionRepository subscriptions;
    private final PersonalSubscriptionChangeRepository changes;
    private final RetirementService retirementService;
    private final RetirementEffectiveDateService dates;
    private final RetirementStripeApplier stripe;
    private final RetirementSuggestionService suggestions;
    private final RetirementNoticeService notices;
    private final RetirementQuoteService quotes;
    private final ServiceLockService locks;
    private final SubscriptionChangeService changeService;
    private final SubscriptionChangeApplier changeApplier;
    private final SuccessorAdvisor advisor;
    private final PersonalBasket basket;
    private final SubscriptionOwners owners;
    private final SettingsService settings;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public RetirementJob(
        PlanRetirementRepository retirements,
        PlanRetirementItemRepository itemRepo,
        SubscriptionRepository subscriptions,
        PersonalSubscriptionChangeRepository changes,
        RetirementService retirementService,
        RetirementEffectiveDateService dates,
        RetirementStripeApplier stripe,
        RetirementSuggestionService suggestions,
        RetirementNoticeService notices,
        RetirementQuoteService quotes,
        ServiceLockService locks,
        SubscriptionChangeService changeService,
        SubscriptionChangeApplier changeApplier,
        SuccessorAdvisor advisor,
        PersonalBasket basket,
        SubscriptionOwners owners,
        SettingsService settings,
        JdbcTemplate jdbc,
        ObjectMapper json,
        PlatformTransactionManager transactionManager
    ) {
        this.retirements = retirements;
        this.itemRepo = itemRepo;
        this.subscriptions = subscriptions;
        this.changes = changes;
        this.retirementService = retirementService;
        this.dates = dates;
        this.stripe = stripe;
        this.suggestions = suggestions;
        this.notices = notices;
        this.quotes = quotes;
        this.locks = locks;
        this.changeService = changeService;
        this.changeApplier = changeApplier;
        this.advisor = advisor;
        this.basket = basket;
        this.owners = owners;
        this.settings = settings;
        this.jdbc = jdbc;
        this.json = json;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** What one run did, for the log and the tests. */
    public record Result(int cancelLead, int scheduled, int applied, int completed) {}

    @Scheduled(fixedDelay = 900_000L, initialDelay = 300_000L)
    public void scheduled() {
        try {
            Result r = run(Instant.now());
            if (r.cancelLead() + r.scheduled() + r.applied() + r.completed() > 0) {
                LOG.info("retirement job: cancel-lead {}, scheduled {}, applied {}, completed {}", r.cancelLead(), r.scheduled(), r.applied(), r.completed());
            }
        } catch (RuntimeException e) {
            LOG.warn("retirement job failed: {}", e.toString());
        }
    }

    /** One pass at {@code now}. Public so a test can drive the clock. */
    public Result run(Instant now) {
        int lead = cancelLeadPass(now);
        int sched = migrationPass(now);
        int applied = effectivePass(now);
        int completed = 0;
        for (PlanRetirement r : retirements.findByStatusInOrderByIdAsc(List.of(PlanRetirement.NOTICING, PlanRetirement.COMPLETING))) {
            try {
                if (retirementService.completeIfDone(r.getId())) completed++;
            } catch (RuntimeException e) {
                LOG.warn("retirement {} could not be completed: {}", r.getId(), e.toString());
            }
        }
        return new Result(lead, sched, applied, completed);
    }

    // ---- 1. the D-1 pass --------------------------------------------------------------------------------------------------------

    int cancelLeadPass(Instant now) {
        int hours = settings.getInt(BillingSettingKeys.RETIREMENT_CANCEL_LEAD_HOURS);
        int n = 0;
        for (PlanRetirementItem i : itemRepo.findForCancelLead(now, now.plus(hours, ChronoUnit.HOURS))) {
            try {
                if (Boolean.TRUE.equals(tx.execute(s -> cancelLead(i.getId(), now)))) n++;
            } catch (StripeGatewayException | BillingException e) {
                LOG.warn("retirement item {}: could not set the cancel at period end yet ({}); the next run tries again", i.getId(), e.getMessage());
            } catch (RuntimeException e) {
                LOG.warn("retirement item {}: cancel lead failed: {}", i.getId(), e.toString());
            }
        }
        return n;
    }

    private boolean cancelLead(Long itemId, Instant now) {
        PlanRetirementItem item = itemRepo.findById(itemId).orElse(null);
        if (item == null || item.getCancelSetAt() != null || !PlanRetirementItem.PENDING.equals(item.getStatus())) return false;
        PlanRetirement r = retirements.findById(item.getRetirementId()).orElse(null);
        Subscription sub = subscriptions.findById(item.getSubscriptionId()).orElse(null);
        if (r == null || sub == null || PlanRetirement.KIND_ADDON.equals(r.getKind())) return false; // an add-on retirement ends one line, never the subscription
        if (sub.getStripeSubscriptionId() == null || !stripe.enabled()) return false;
        if (!sub.isCancelAtPeriodEnd()) stripe.cancelAtPeriodEnd(r.getId(), sub, true, "d1");
        item.setCancelSetAt(now);
        itemRepo.save(item);
        return true;
    }

    // ---- 2. migrate at renewal ----------------------------------------------------------------------------------------------------

    int migrationPass(Instant now) {
        int n = 0;
        for (PlanRetirement r : retirements.findByStatusInOrderByIdAsc(List.of(PlanRetirement.NOTICING, PlanRetirement.COMPLETING))) {
            if (!PlanRetirement.OUTCOME_MIGRATE.equals(r.getDefaultOutcome()) || PlanRetirement.KIND_ADDON.equals(r.getKind())) continue;
            for (PlanRetirementItem i : itemRepo.findPending(r.getId())) {
                if (i.getStripeRef() != null || i.getDecidedChangeId() != null) continue;
                try {
                    if (Boolean.TRUE.equals(tx.execute(s -> scheduleMigration(r.getId(), i.getId(), now)))) n++;
                } catch (StripeGatewayException | BillingException e) {
                    LOG.warn("retirement item {}: migration not scheduled yet ({})", i.getId(), e.getMessage());
                } catch (RuntimeException e) {
                    LOG.warn("retirement item {}: migration scheduling failed: {}", i.getId(), e.toString());
                }
            }
        }
        return n;
    }

    private boolean scheduleMigration(Long retirementId, Long itemId, Instant now) {
        PlanRetirement r = retirements.findById(retirementId).orElseThrow();
        PlanRetirementItem item = itemRepo.findById(itemId).orElseThrow();
        Subscription sub = subscriptions.findById(item.getSubscriptionId()).orElseThrow();
        Evaluation ev = suggestions.refresh(r, item, now);
        if (ev == null || ev.best() == null || ev.best().priced() == null) return false;
        SuccessorAdvisor.Scored best = ev.best();
        if (best.suggestion().deltaMinor() > 0) {
            item.setNote("a higher price is never scheduled without consent");
            itemRepo.save(item);
            return false; // NoSilentReprice: this subscriber falls back to Free on their date unless they choose
        }
        if (!stripe.enabled() || sub.getStripeSubscriptionId() == null) return false;
        String basePrice = baseStripePriceId(best);
        String scheduleId = stripe.schedule(r.getId(), sub, stripe.targetItems(sub, basePrice, now), item.getRetireEffectiveAt(), "mig");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("successor", best.plan().getPlanKey());
        payload.put("baseStripePriceId", basePrice);
        payload.put("deltaMinor", best.suggestion().deltaMinor());
        payload.put("choice", "MIGRATE_AT_RENEWAL");
        Long userId = owners.of(sub).userId();
        PersonalSubscriptionChange c = changeService.recordRetirement(
            sub.getId(), userId, SubscriptionChangeService.RETIREMENT_SWITCH, item.getSuggestedQuoteId(), deterministicBatch("mig", itemId), sub.getPlanVersionId(), best.version().getId(),
            sub.getBillingInterval(), sub.getBillingInterval(), item.getRetireEffectiveAt(), "PENDING", scheduleId, payload
        );
        item.setStripeRef(scheduleId);
        item.setDecidedChangeId(c.getId());
        item.setChoiceKind("MIGRATE_AT_RENEWAL"); // chosen by the retirement, not by the subscriber: decidedAt stays empty and the notices continue
        itemRepo.save(item);
        return true;
    }

    // ---- 3. the effective date ----------------------------------------------------------------------------------------------------

    int effectivePass(Instant now) {
        int n = 0;
        for (PlanRetirementItem i : itemRepo.findDue(now)) {
            try {
                if (Boolean.TRUE.equals(tx.execute(s -> applyDue(i.getId(), now)))) n++;
            } catch (RuntimeException e) {
                LOG.warn("retirement item {}: could not be applied yet, the next run tries again: {}", i.getId(), e.toString());
            }
        }
        return n;
    }

    private boolean applyDue(Long itemId, Instant now) {
        PlanRetirementItem item = itemRepo.findById(itemId).orElse(null);
        if (item == null || item.getAppliedAt() != null) return false;
        PlanRetirement r = retirements.findById(item.getRetirementId()).orElse(null);
        Subscription sub = subscriptions.findById(item.getSubscriptionId()).orElse(null);
        if (r == null || sub == null || !r.isLive()) return false;
        // the date only ever moves later: a renewal that happened before the subscriber decided pushes it to the new period end
        Instant moved = dates.moveLater(item.getRetireEffectiveAt(), sub);
        if (moved.isAfter(item.getRetireEffectiveAt())) {
            item.setRetireEffectiveAt(moved.truncatedTo(ChronoUnit.MILLIS));
            itemRepo.save(item);
            if (moved.isAfter(now)) return false;
        }
        if (PlanRetirement.KIND_ADDON.equals(r.getKind())) return endAddonLine(r, item, sub, now);
        if (item.getDecidedChangeId() != null && item.getStripeRef() != null && !PlanRetirementItem.CANCELLED.equals(item.getStatus())) return applyScheduledSwitch(r, item, sub, now);
        return fallbackFree(r, item, sub, now);
    }

    /** A scheduled switch (the subscriber's, or a MIGRATE of the retirement) takes effect in Kiwiply; Stripe's schedule has already moved the items. */
    private boolean applyScheduledSwitch(PlanRetirement r, PlanRetirementItem item, Subscription sub, Instant now) {
        PersonalSubscriptionChange c = changes.findById(item.getDecidedChangeId()).orElse(null);
        if (c == null || c.getPlanVersionTo() == null) return fallbackFree(r, item, sub, now);
        String basePrice = payloadString(c, "baseStripePriceId");
        sub.setPlanVersionId(c.getPlanVersionTo());
        if (basePrice != null) sub.setPriceId(basePrice);
        sub.setUpdatedAt(now);
        subscriptions.save(sub);
        changeService.markRetirementChange(c.getId(), "APPLIED", now);
        boolean migrated = "MIGRATE_AT_RENEWAL".equals(item.getChoiceKind()) && item.getDecidedAt() == null;
        if (migrated) item.setStatus(PlanRetirementItem.MIGRATED);
        item.setAppliedAt(now);
        itemRepo.save(item);
        return true;
    }

    /** The default outcome (S-19): Free, read-only lock, nothing deleted. */
    private boolean fallbackFree(PlanRetirement r, PlanRetirementItem item, Subscription sub, Instant now) {
        Long freeVersion = retirementService.freeVersionId();
        if (freeVersion == null) {
            LOG.error("retirement {}: there is no live Free version, item {} cannot fall back", r.getId(), item.getId());
            return false;
        }
        Long userId = owners.of(sub).userId();
        Long previous = item.getPreviousVersionId() != null ? item.getPreviousVersionId() : sub.getPlanVersionId();
        // 1. the services held now that Free does not include (before anything changes)
        Set<String> held = new LinkedHashSet<>(advisor.includedKeys(previous));
        for (PersonalBasket.Held h : basket.held(sub.getId(), now)) if (h.effectiveQuantity() > 0) held.add(h.featureKey());
        held.removeAll(advisor.freeIncluded());
        // 2. Stripe must stop billing the old plan: set it now if the D-1 pass did not (a failure here is logged, never blocks the fallback, and the reconciler reports it)
        endStripe(r, item, sub);
        // 3. Kiwiply
        locks.lock(userId, held, previous, r.getId(), now);
        changeService.endAddons(sub.getId(), now);
        sub.setPlanVersionId(freeVersion);
        sub.setBillingInterval(null);
        sub.setUpdatedAt(now);
        subscriptions.save(sub);
        jdbc.update("UPDATE subscription SET lapse_notice_pending = TRUE WHERE id = ?", sub.getId());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("previousPlanVersionId", previous);
        payload.put("retirementId", r.getId());
        payload.put("outcome", r.getDefaultOutcome());
        payload.put("lockedFeatures", new ArrayList<>(held));
        PersonalSubscriptionChange c = changeService.recordRetirement(
            sub.getId(), userId, SubscriptionChangeService.FALLBACK_FREE, null, deterministicBatch("fall", item.getId()), previous, freeVersion, item.getBillingInterval(), null, now, "APPLIED", null, payload
        );
        item.setStatus(PlanRetirementItem.FELL_BACK);
        item.setAppliedAt(now);
        item.setDecidedChangeId(c.getId());
        itemRepo.save(item);
        // 4. the confirmation (its own dedupe key: a rerun sends nothing)
        try {
            notices.sendApplied(r, item, new ArrayList<>(held));
        } catch (RuntimeException e) {
            LOG.warn("retirement item {}: the confirmation notice could not be sent: {}", item.getId(), e.toString());
        }
        return true;
    }

    private void endStripe(PlanRetirement r, PlanRetirementItem item, Subscription sub) {
        if (item.getCancelSetAt() != null || sub.isCancelAtPeriodEnd() || sub.getStripeSubscriptionId() == null || !stripe.enabled()) return;
        try {
            stripe.cancelAtPeriodEnd(r.getId(), sub, true, "fb");
            item.setCancelSetAt(Instant.now());
        } catch (StripeGatewayException | BillingException e) {
            LOG.warn("retirement {} item {}: Stripe was not told to end the old plan ({}); check the reconciler", r.getId(), item.getId(), e.getMessage());
        }
    }

    /** An add-on retirement: the line ends on its date (Stripe first), the service locks when the plan does not include it, nothing else changes. */
    private boolean endAddonLine(PlanRetirement r, PlanRetirementItem item, Subscription sub, Instant now) {
        String feature = r.getFeatureKey();
        Long userId = owners.of(sub).userId();
        boolean held = basket.held(sub.getId(), now).stream().anyMatch(h -> h.featureKey().equals(feature) && h.effectiveQuantity() > 0);
        if (held && sub.getStripeSubscriptionId() != null && stripe.enabled()) {
            try {
                changeApplier.setItems(sub, Map.of(feature, 0), IdempotencyKey.of("ret", r.getId(), sub.getId(), "addon"));
            } catch (StripeGatewayException e) {
                LOG.warn("retirement {} item {}: the add-on item was not removed in Stripe yet ({})", r.getId(), item.getId(), e.getKind());
                throw e; // retried next run with the same key
            }
        }
        Long version = sub.getPlanVersionId();
        if (held && !advisor.includedKeys(version).contains(feature) && !advisor.freeIncluded().contains(feature)) {
            locks.lock(userId, List.of(feature), version, r.getId(), now);
        }
        changeService.endAddonLine(sub.getId(), feature, now);
        item.setStatus(PlanRetirementItem.FELL_BACK);
        item.setAppliedAt(now);
        itemRepo.save(item);
        return true;
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------------

    private String baseStripePriceId(SuccessorAdvisor.Scored scored) {
        return jdbc
            .queryForList(
                "SELECT pp.stripe_price_id FROM product_price pp WHERE pp.id = ?",
                String.class,
                Long.valueOf(
                    scored.priced().group(com.dossier.api.service.pricing.PricingInputs.PLAN_GROUP).lines().stream().filter(l -> SuccessorAdvisor.BASE_LINE.equals(l.lineKey())).findFirst().orElseThrow().priceId()
                )
            )
            .stream()
            .findFirst()
            .orElse(null);
    }

    private String payloadString(PersonalSubscriptionChange c, String field) {
        try {
            JsonNode n = json.readTree(c.getPayloadJson() == null ? "{}" : c.getPayloadJson());
            return n.hasNonNull(field) ? n.get(field).asText() : null;
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /** A stable batch id for a change the system itself makes, so a rerun finds the same row. */
    static String deterministicBatch(String step, Long itemId) {
        return UUID.nameUUIDFromBytes(("retirement-" + step + "-" + itemId).getBytes(StandardCharsets.UTF_8)).toString();
    }
}
