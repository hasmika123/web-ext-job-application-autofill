package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.repository.sub.PlanRetirementRepository;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The nightly look at whether the retirement lifecycle is where it should be (docs/subscriptions/11 section 9; story K10.8): it records what is wrong as
 * {@code billing_drift kind=RETIREMENT} rows and never fixes anything (an alert is not a repair, and nothing here writes money). A row resolves itself on the next run when the
 * condition is gone. What it can check from Kiwiply's own records:
 *
 * <ul>
 *   <li>{@code CANCEL_NOT_SET}: an undecided subscriber is within a day of their date and Stripe was never told to end the old plan (the D-1 pass did not succeed): a renewal
 *       invoice could be created for a retiring plan.</li>
 *   <li>{@code SCHEDULE_MISSING}: a switch is scheduled but the item holds no Stripe schedule reference.</li>
 *   <li>{@code NOT_APPLIED}: an item's date passed more than an hour ago and it is still not applied.</li>
 *   <li>{@code STILL_BILLING}: a subscriber fell back to Free more than two days ago but the mirror still shows an active subscription that is not ending: Stripe may still be
 *       charging the old plan.</li>
 * </ul>
 * Comparing against Stripe's own schedules (a schedule deleted in the dashboard) needs a read the gateway does not have yet; it joins the personal reconciler of story K8.5.
 */
@Component
public class RetirementReconciler {

    private static final Logger LOG = LoggerFactory.getLogger(RetirementReconciler.class);
    public static final String KIND = "RETIREMENT";

    /** What a run found. */
    public record Result(int opened, int resolved, int open) {}

    private final PlanRetirementRepository retirements;
    private final PlanRetirementItemRepository itemRepo;
    private final SubscriptionRepository subscriptions;
    private final BillingDriftRepository drifts;
    private final SettingsService settings;
    private final ObjectMapper json;

    public RetirementReconciler(
        PlanRetirementRepository retirements,
        PlanRetirementItemRepository itemRepo,
        SubscriptionRepository subscriptions,
        BillingDriftRepository drifts,
        SettingsService settings,
        ObjectMapper json
    ) {
        this.retirements = retirements;
        this.itemRepo = itemRepo;
        this.subscriptions = subscriptions;
        this.drifts = drifts;
        this.settings = settings;
        this.json = json;
    }

    @Scheduled(cron = "0 50 3 * * *")
    public void scheduled() {
        try {
            Result r = run(Instant.now());
            if (r.opened() + r.resolved() > 0) LOG.info("retirement reconcile: {} opened, {} resolved, {} open", r.opened(), r.resolved(), r.open());
        } catch (RuntimeException e) {
            LOG.warn("retirement reconcile failed: {}", e.toString());
        }
    }

    @Transactional
    public Result run(Instant now) {
        int hours = settings.getInt(BillingSettingKeys.RETIREMENT_CANCEL_LEAD_HOURS);
        List<String[]> found = new ArrayList<>(); // code, subject, expected, actual
        for (PlanRetirement r : retirements.findByStatusInOrderByIdAsc(List.of(PlanRetirement.NOTICING, PlanRetirement.COMPLETING, PlanRetirement.COMPLETED))) {
            for (PlanRetirementItem i : itemRepo.findByRetirementIdOrderByIdAsc(r.getId())) {
                if (PlanRetirementItem.EXCLUDED.equals(i.getStatus()) || i.getSubscriptionId() == null) continue;
                Subscription sub = subscriptions.findById(i.getSubscriptionId()).orElse(null);
                if (sub == null) continue;
                String subject = "item:" + i.getId();
                boolean live = r.isLive();
                if (live && i.getAppliedAt() == null) {
                    boolean stripeBilled = sub.getStripeSubscriptionId() != null;
                    boolean undecided = PlanRetirementItem.PENDING.equals(i.getStatus()) && i.getDecidedChangeId() == null;
                    boolean endsWithFree = PlanRetirement.OUTCOME_FREE.equals(r.getDefaultOutcome()) || PlanRetirement.OUTCOME_CANCEL.equals(r.getDefaultOutcome());
                    if (undecided && endsWithFree && stripeBilled && !sub.isCancelAtPeriodEnd() && i.getCancelSetAt() == null && i.getRetireEffectiveAt().isBefore(now.plus(Math.min(hours, 24), ChronoUnit.HOURS)) && i.getRetireEffectiveAt().isAfter(now)) {
                        found.add(row("CANCEL_NOT_SET", subject, Map.of("cancelAtPeriodEnd", true), Map.of("cancelAtPeriodEnd", false, "effectiveAt", i.getRetireEffectiveAt().toString())));
                    }
                    if (PlanRetirementItem.SWITCH_SCHEDULED.equals(i.getStatus()) && i.getStripeRef() == null && stripeBilled) {
                        found.add(row("SCHEDULE_MISSING", subject, Map.of("stripeSchedule", "present"), Map.of("stripeSchedule", "none")));
                    }
                    if (i.getRetireEffectiveAt().isBefore(now.minus(1, ChronoUnit.HOURS))) {
                        found.add(row("NOT_APPLIED", subject, Map.of("appliedAt", "set"), Map.of("effectiveAt", i.getRetireEffectiveAt().toString(), "status", i.getStatus())));
                    }
                }
                if (PlanRetirementItem.FELL_BACK.equals(i.getStatus()) && i.getAppliedAt() != null && i.getAppliedAt().isBefore(now.minus(2, ChronoUnit.DAYS)) && stripeBilledAndActive(sub)) {
                    found.add(row("STILL_BILLING", subject, Map.of("subscription", "ended"), Map.of("status", String.valueOf(sub.getStatus()), "cancelAtPeriodEnd", sub.isCancelAtPeriodEnd())));
                }
            }
        }
        int opened = 0;
        List<String> keys = new ArrayList<>();
        for (String[] f : found) {
            keys.add(f[0] + "|" + f[1]);
            if (drifts.findOpenOne(KIND, f[0], f[1]).isPresent()) continue;
            BillingDrift d = new BillingDrift();
            d.setKind(KIND);
            d.setCode(f[0]);
            d.setSubject(f[1]);
            d.setExpectedJson(f[2]);
            d.setActualJson(f[3]);
            d.setDetectedAt(now);
            drifts.save(d);
            opened++;
        }
        int resolved = 0;
        for (BillingDrift d : drifts.findOpen(KIND)) {
            if (keys.contains(d.getCode() + "|" + d.getSubject())) continue;
            d.setResolvedAt(now);
            d.setResolvedBy("system");
            d.setNote("The condition is gone.");
            drifts.save(d);
            resolved++;
        }
        return new Result(opened, resolved, drifts.findOpen(KIND).size());
    }

    private static boolean stripeBilledAndActive(Subscription s) {
        return s.getStripeSubscriptionId() != null && "active".equalsIgnoreCase(s.getStatus()) && !s.isCancelAtPeriodEnd();
    }

    private String[] row(String code, String subject, Map<String, Object> expected, Map<String, Object> actual) {
        return new String[] { code, subject, write(expected), write(new LinkedHashMap<>(actual)) };
    }

    private String write(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }
}
