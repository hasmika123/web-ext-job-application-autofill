package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.sub.PersonalSubscriptionChange;
import com.dossier.api.domain.sub.ServiceLock;
import com.dossier.api.domain.sub.SubscriptionQuote;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.repository.sub.PlanRetirementRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.repository.sub.ServiceLockRepository;
import com.dossier.api.repository.sub.SubscriptionQuoteRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.BillingScopeRouter;
import com.dossier.api.service.billing.StripeGateway.ItemQuantity;
import com.dossier.api.service.billing.StripeGateway.Period;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.personal.PersonalBasket;
import com.dossier.api.service.billing.personal.PersonalQuoteService;
import com.dossier.api.service.billing.personal.SubscriptionChangeService;
import com.dossier.api.service.dto.PlanQuoteDTO;
import com.dossier.api.service.pricing.PricingEngine;
import com.dossier.api.service.pricing.PricingInputs;
import com.dossier.api.service.pricing.PricingResult.LineResult;
import com.dossier.api.service.retirement.SuccessorAdvisor.Evaluation;
import com.dossier.api.service.retirement.SuccessorAdvisor.Scored;
import com.dossier.api.service.retirement.SuccessorAdvisor.Suggestion;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChangeDTO;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceDTO;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceRequest;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceResultDTO;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.FallbackDTO;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.LockDTO;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.PreviewLockDTO;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.RetirementMeDTO;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.UsedDTO;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The subscriber's side of a retirement (docs/subscriptions/11 section 6; story K10.4): what is changing and what they use ({@link #me}), and the choice they make
 * ({@link #choose}). Every choice is one authenticated call with an {@code Idempotency-Key} (a UUID) over the quote machinery of the retirement:
 *
 * <ul>
 *   <li><b>SWITCH_AT_RENEWAL</b>: a Stripe schedule moves them to the successor on their effective date; nothing today, nothing charged now.</li>
 *   <li><b>SWITCH_NOW</b>: a higher price takes effect now, prorated, because the subscriber asked for it (their explicit consent); an equal or lower price is applied on the
 *       effective date exactly like the former (they keep what they paid for, no credit is made up).</li>
 *   <li><b>PICK</b>: only prices another plan for them and returns that quote; they confirm it with a switch.</li>
 *   <li><b>CANCEL</b>: they keep the plan to the end of the paid period and nothing more is charged (no refunds, B5.1); a cancel wins over any switch.</li>
 *   <li><b>LATER</b>: nothing changes, the reminders continue.</li>
 * </ul>
 * The last confirmed choice replaces the earlier scheduled one (the old Stripe schedule is released first). Stripe is told first and Kiwiply records the choice after, so a
 * Stripe refusal changes nothing; a repeat with the same key returns the same result. A successor must offer every add-on the subscriber holds at its held quantity,
 * otherwise the switch is refused {@code 422 SUCCESSOR_NOT_AVAILABLE {reason: ADDON_NOT_OFFERED}} (the suggestion lists those as gaps). A switch never changes the
 * billing interval. Not transactional as a whole: Stripe calls must not sit inside a database transaction; the Kiwiply writes run in one.
 */
@Service
public class RetirementChoiceService {

    private static final Logger LOG = LoggerFactory.getLogger(RetirementChoiceService.class);
    static final long RECENT_DAYS = 90;

    private final UserRepository users;
    private final BillingScopeRouter router;
    private final SubscriptionRepository subscriptions;
    private final PlanRetirementRepository retirements;
    private final PlanRetirementItemRepository itemRepo;
    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PersonalSubscriptionChangeRepository changes;
    private final SubscriptionChangeService changeService;
    private final SubscriptionQuoteRepository quoteRepo;
    private final PersonalQuoteService quoteService;
    private final ProductPriceRepository prices;
    private final ServiceLockRepository locks;
    private final FeatureDefinitionRepository features;
    private final PersonalBasket basket;
    private final SuccessorAdvisor advisor;
    private final RetirementSuggestionService suggestions;
    private final RetirementQuoteService quotes;
    private final RetirementStripeApplier stripe;
    private final TransactionTemplate tx;

    public RetirementChoiceService(
        UserRepository users,
        BillingScopeRouter router,
        SubscriptionRepository subscriptions,
        PlanRetirementRepository retirements,
        PlanRetirementItemRepository itemRepo,
        PlanRepository plans,
        PlanVersionRepository versions,
        PersonalSubscriptionChangeRepository changes,
        SubscriptionChangeService changeService,
        SubscriptionQuoteRepository quoteRepo,
        PersonalQuoteService quoteService,
        ProductPriceRepository prices,
        ServiceLockRepository locks,
        FeatureDefinitionRepository features,
        PersonalBasket basket,
        SuccessorAdvisor advisor,
        RetirementSuggestionService suggestions,
        RetirementQuoteService quotes,
        RetirementStripeApplier stripe,
        PlatformTransactionManager transactionManager
    ) {
        this.users = users;
        this.router = router;
        this.subscriptions = subscriptions;
        this.retirements = retirements;
        this.itemRepo = itemRepo;
        this.plans = plans;
        this.versions = versions;
        this.changes = changes;
        this.changeService = changeService;
        this.quoteRepo = quoteRepo;
        this.quoteService = quoteService;
        this.prices = prices;
        this.locks = locks;
        this.features = features;
        this.basket = basket;
        this.advisor = advisor;
        this.suggestions = suggestions;
        this.quotes = quotes;
        this.stripe = stripe;
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ---- GET /api/billing/retirement/me -------------------------------------------------------------------------------------------

    public RetirementMeDTO me(String login) {
        User user = personal(login);
        Instant now = Instant.now();
        PlanRetirementItem item = locate(user.getId(), now, false);
        PlanRetirement r = retirements.findById(item.getRetirementId()).orElseThrow(RetirementChoiceService::none);
        Subscription sub = subscriptions.findOneByUserId(user.getId()).orElseThrow(RetirementChoiceService::none);
        boolean changing = item.getAppliedAt() == null;
        String state = changing ? "CHANGING" : PlanRetirementItem.FELL_BACK.equals(item.getStatus()) ? "FELL_BACK" : "SWITCHED";
        Plan plan = r.getPlanId() == null ? null : plans.findById(r.getPlanId()).orElse(null);
        Integer version = item.getPreviousVersionId() == null ? null : versions.findById(item.getPreviousVersionId()).map(PlanVersion::getVersion).orElse(null);
        String currency = sub.getCurrency() == null ? "USD" : sub.getCurrency();

        List<UsedDTO> used = List.of();
        Suggestion suggestion = null;
        List<Suggestion> alternatives = List.of();
        List<PreviewLockDTO> lockPreview = List.of();
        long current = 0;
        if (changing) {
            try {
                Evaluation ev = suggestions.refresh(r, item, now);
                if (ev != null) {
                    used = ev.used().stream().map(u -> new UsedDTO(u.featureKey(), u.name(), u.covered())).toList();
                    if (ev.best() != null) suggestion = ev.best().suggestion().withQuote(item.getSuggestedQuoteId());
                    final String bestKey = suggestion == null ? null : suggestion.successorKey();
                    alternatives = ev.ranked().stream().map(Scored::suggestion).filter(s -> !s.successorKey().equals(bestKey)).toList();
                    lockPreview = ev.lockPreview().stream().map(l -> new PreviewLockDTO(l.featureKey(), l.name())).toList();
                    current = ev.currentMinor();
                }
            } catch (BillingException e) {
                LOG.debug("retirement view without suggestion: {}", e.getCode());
            }
        }
        FallbackDTO fallback = null;
        if (!changing && PlanRetirementItem.FELL_BACK.equals(item.getStatus())) {
            List<LockDTO> lockList = new ArrayList<>();
            for (ServiceLock l : locks.findByUserIdAndReleasedAtIsNullOrderByIdAsc(user.getId())) lockList.add(new LockDTO(l.getFeatureKey(), featureName(l.getFeatureKey()), l.getLockedAt()));
            fallback = new FallbackDTO(item.getAppliedAt(), List.copyOf(lockList));
        }
        return new RetirementMeDTO(
            r.getId(),
            state,
            r.getKind(),
            plan == null ? null : plan.getPlanKey(),
            plan == null ? null : plan.getName(),
            version,
            r.getFeatureKey(),
            item.getRetireEffectiveAt(),
            item.getStatus(),
            item.getBillingInterval(),
            currency,
            current,
            r.getDefaultOutcome(),
            r.getMessageMd(),
            used,
            suggestion,
            alternatives,
            lockPreview,
            choiceOf(item),
            fallback
        );
    }

    // ---- POST /api/billing/retirement/me/choice -----------------------------------------------------------------------------------

    public ChoiceResultDTO choose(String login, String idempotencyKey, ChoiceRequest req) {
        String batch = batchId(idempotencyKey);
        User user = personal(login);
        if (req == null || req.kind() == null || req.kind().isBlank()) throw new BillingException(422, "INVALID_CHOICE", "Say what you want to do");
        String kind = req.kind().trim().toUpperCase(Locale.ROOT);
        Instant now = Instant.now();
        PlanRetirementItem item = locate(user.getId(), now, true);
        PlanRetirement r = retirements.findById(item.getRetirementId()).orElseThrow(RetirementChoiceService::none);
        Subscription sub = subscriptions.findOneByUserId(user.getId()).orElseThrow(RetirementChoiceService::none);

        List<PersonalSubscriptionChange> prior = changes.findByBatchIdOrderByIdAsc(batch);
        if (!prior.isEmpty()) {
            if (!prior.get(0).getSubscriptionId().equals(sub.getId())) throw new BillingException(409, "IDEMPOTENCY_KEY_REUSED", "That Idempotency-Key belongs to another request");
            return replay(item, prior.get(0));
        }
        boolean addon = PlanRetirement.KIND_ADDON.equals(r.getKind());
        return switch (kind) {
            case "LATER" -> result(item, false, null, null, null);
            case "CANCEL" -> addon ? cancelAddon(user, r, item, sub, batch, now) : cancel(user, r, item, sub, batch, now);
            case "PICK" -> {
                requirePlan(addon);
                yield pick(r, item, sub, req, now);
            }
            case "SWITCH_NOW", "SWITCH_AT_RENEWAL" -> {
                requirePlan(addon);
                yield switchTo(user, kind, r, item, sub, req, batch, now);
            }
            default -> throw new BillingException(422, "INVALID_CHOICE", "kind must be SWITCH_NOW, SWITCH_AT_RENEWAL, PICK, LATER or CANCEL");
        };
    }

    private static void requirePlan(boolean addon) {
        if (addon) throw new BillingException(422, "INVALID_CHOICE", "This add-on is changing: change your add-ons on My plan, or choose to let it end on its date");
    }

    // ---- the choices --------------------------------------------------------------------------------------------------------------

    private ChoiceResultDTO pick(PlanRetirement r, PlanRetirementItem item, Subscription sub, ChoiceRequest req, Instant now) {
        if (PlanRetirementItem.CANCELLED.equals(item.getStatus())) throw cancelPending();
        Scored scored = advisor.priceFor(sub, req.planKey(), req.interval(), requested(req), now);
        requireSameInterval(scored, sub);
        Long quoteId = quotes.persist(sub, item.getRetireEffectiveAt(), scored, null, now);
        SubscriptionQuote q = quoteRepo.findById(quoteId).orElseThrow(RetirementChoiceService::none);
        return result(item, false, null, quotes.toDto(q), null);
    }

    private ChoiceResultDTO switchTo(User user, String kind, PlanRetirement r, PlanRetirementItem item, Subscription sub, ChoiceRequest req, String batch, Instant now) {
        if (PlanRetirementItem.CANCELLED.equals(item.getStatus())) throw cancelPending();
        stripe.requireEnabled();
        if (req.quoteId() == null) throw new BillingException(422, "INVALID_CHOICE", "Name the quote you are confirming (quoteId)");
        SubscriptionQuote q = quotes.requireUsable(req.quoteId(), user.getId(), item, now);
        PersonalQuoteService.Stored stored = quoteService.stored(q);
        Scored scored = advisor.priceFor(sub, stored.meta().planKey(), stored.meta().interval(), stored.meta().addons(), now);
        requireSameInterval(scored, sub);
        Long fresh = quotes.persist(sub, item.getRetireEffectiveAt(), scored, q.getId(), now);
        if (!q.getId().equals(fresh)) {
            throw new BillingException(409, "QUOTE_STALE", "Prices or your subscription changed since this quote. Review the new numbers.", Map.of("reason", "PRICE_CHANGED", "quoteId", fresh));
        }
        requireEveryAddonOffered(sub, scored, now);

        long delta = scored.suggestion().deltaMinor();
        boolean immediate = "SWITCH_NOW".equals(kind) && delta > 0;
        String baseStripePrice = baseStripePriceId(scored);
        String suffix = batch.substring(0, 8);
        Instant periodEnd = sub.getCurrentPeriodEnd();
        if (periodEnd == null) throw new BillingException(409, "NO_SUBSCRIPTION", "This subscription cannot be changed online yet");
        Instant periodStart = sub.getCurrentPeriodStart() != null ? sub.getCurrentPeriodStart() : periodEnd.atZone(ZoneOffset.UTC).minusMonths(RetirementEffectiveDateService.months(sub.getBillingInterval())).toInstant();
        try {
            List<ItemQuantity> items = stripe.targetItems(sub, baseStripePrice, now);
            releaseSchedule(r, item, sub, suffix);
            if (item.getCancelSetAt() != null) stripe.cancelAtPeriodEnd(r.getId(), sub, false, suffix); // the D-1 pass had set "end at the period end": a subscriber who chooses to stay takes it back
            String ref;
            if (immediate) {
                long proration = PricingEngine.prorate(delta, 1, periodStart, periodEnd, now);
                ref = stripe.switchNow(r.getId(), sub, items, proration, q.getCurrency(), "Prorated: switch to " + scored.plan().getName(), new Period(now, periodEnd), suffix);
                if (ref == null) ref = "items";
            } else {
                ref = stripe.schedule(r.getId(), sub, items, item.getRetireEffectiveAt(), suffix);
            }
            final String stripeRef = ref;
            Long fromVersion = sub.getPlanVersionId();
            PersonalSubscriptionChange change = tx.execute(s -> {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("successor", scored.plan().getPlanKey());
                payload.put("baseStripePriceId", baseStripePrice);
                payload.put("deltaMinor", delta);
                payload.put("choice", kind);
                PersonalSubscriptionChange c = changeService.recordRetirement(
                    sub.getId(),
                    user.getId(),
                    SubscriptionChangeService.RETIREMENT_SWITCH,
                    q.getId(),
                    batch,
                    fromVersion,
                    scored.version().getId(),
                    sub.getBillingInterval(),
                    sub.getBillingInterval(),
                    immediate ? now : item.getRetireEffectiveAt(),
                    immediate ? "APPLIED" : "PENDING",
                    stripeRef,
                    payload
                );
                PlanRetirementItem it = itemRepo.findById(item.getId()).orElseThrow();
                it.setChoiceKind(kind);
                it.setDecidedAt(now);
                it.setDecidedChangeId(c.getId());
                it.setCancelSetAt(null);
                it.setStripeRef(immediate ? null : stripeRef);
                if (immediate) {
                    Subscription fresh2 = subscriptions.findById(sub.getId()).orElseThrow();
                    fresh2.setPlanVersionId(scored.version().getId());
                    fresh2.setPriceId(baseStripePrice);
                    fresh2.setUpdatedAt(now);
                    subscriptions.save(fresh2);
                    it.setStatus(PlanRetirementItem.SWITCHED_NOW);
                    it.setAppliedAt(now);
                } else {
                    it.setStatus(PlanRetirementItem.SWITCH_SCHEDULED);
                }
                itemRepo.save(it);
                SubscriptionQuote sq = quoteRepo.findById(q.getId()).orElseThrow();
                sq.setStatus("APPLIED");
                sq.setAppliedBatchId(batch);
                quoteRepo.save(sq);
                return c;
            });
            PlanRetirementItem done = itemRepo.findById(item.getId()).orElseThrow();
            return result(done, !immediate, null, null, change);
        } catch (StripeGatewayException e) {
            LOG.error("Stripe refused the retirement switch of item {}: {}", item.getId(), e.getKind());
            throw new BillingException(502, BillingException.CODE_STRIPE_ERROR, "Stripe couldn't complete that");
        }
    }

    private ChoiceResultDTO cancel(User user, PlanRetirement r, PlanRetirementItem item, Subscription sub, String batch, Instant now) {
        stripe.requireEnabled();
        String suffix = batch.substring(0, 8);
        try {
            releaseSchedule(r, item, sub, suffix);
            stripe.cancelAtPeriodEnd(r.getId(), sub, true, suffix);
        } catch (StripeGatewayException e) {
            LOG.error("Stripe refused the retirement cancel of item {}: {}", item.getId(), e.getKind());
            throw new BillingException(502, BillingException.CODE_STRIPE_ERROR, "Stripe couldn't complete that");
        }
        PersonalSubscriptionChange change = tx.execute(s -> {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("choice", "CANCEL");
            PersonalSubscriptionChange c = changeService.recordRetirement(
                sub.getId(), user.getId(), SubscriptionChangeService.RETIREMENT_CANCEL, null, batch, sub.getPlanVersionId(), null, sub.getBillingInterval(), null, sub.getCurrentPeriodEnd() == null ? now : sub.getCurrentPeriodEnd(), "APPLIED", null, payload
            );
            PlanRetirementItem it = itemRepo.findById(item.getId()).orElseThrow();
            it.setStatus(PlanRetirementItem.CANCELLED);
            it.setChoiceKind("CANCEL");
            it.setDecidedAt(now);
            it.setDecidedChangeId(c.getId());
            it.setStripeRef(null);
            if (sub.getCurrentPeriodEnd() != null && sub.getCurrentPeriodEnd().isBefore(it.getRetireEffectiveAt())) {
                it.setRetireEffectiveAt(sub.getCurrentPeriodEnd()); // their own choice: the plan ends with the period they paid for (never shortens it)
            }
            itemRepo.save(it);
            Subscription fresh = subscriptions.findById(sub.getId()).orElseThrow();
            fresh.setCancelAtPeriodEnd(true); // Stripe confirms it with the next subscription event; the mirror is only ahead of the webhook
            fresh.setUpdatedAt(now);
            subscriptions.save(fresh);
            return c;
        });
        PlanRetirementItem done = itemRepo.findById(item.getId()).orElseThrow();
        return new ChoiceResultDTO("CHANGING", done.getStatus(), done.getRetireEffectiveAt(), false, null, changeDto(change), true);
    }

    /** An add-on retirement: "let it end" stops the reminders; the line ends on its date and nothing else changes. */
    private ChoiceResultDTO cancelAddon(User user, PlanRetirement r, PlanRetirementItem item, Subscription sub, String batch, Instant now) {
        PersonalSubscriptionChange change = tx.execute(s -> {
            PersonalSubscriptionChange c = changeService.recordRetirement(
                sub.getId(), user.getId(), SubscriptionChangeService.RETIREMENT_CANCEL, null, batch, sub.getPlanVersionId(), null, sub.getBillingInterval(), null, item.getRetireEffectiveAt(), "PENDING", null, Map.of("addon", String.valueOf(r.getFeatureKey()))
            );
            PlanRetirementItem it = itemRepo.findById(item.getId()).orElseThrow();
            it.setStatus(PlanRetirementItem.CANCELLED);
            it.setChoiceKind("CANCEL");
            it.setDecidedAt(now);
            it.setDecidedChangeId(c.getId());
            itemRepo.save(it);
            return c;
        });
        PlanRetirementItem done = itemRepo.findById(item.getId()).orElseThrow();
        return result(done, true, null, null, change);
    }

    /** A schedule created by an earlier choice is released before a new one is made (a subscription has one), and that choice's change row is closed. */
    private void releaseSchedule(PlanRetirement r, PlanRetirementItem item, Subscription sub, String suffix) {
        if (item.getStripeRef() == null) return;
        stripe.release(r.getId(), sub, item.getStripeRef(), suffix);
        if (item.getDecidedChangeId() != null) changeService.markRetirementChange(item.getDecidedChangeId(), "CANCELLED", null);
        tx.executeWithoutResult(s ->
            itemRepo
                .findById(item.getId())
                .ifPresent(it -> {
                    it.setStripeRef(null);
                    itemRepo.save(it);
                })
        );
        item.setStripeRef(null);
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------------

    private ChoiceResultDTO replay(PlanRetirementItem item, PersonalSubscriptionChange c) {
        PlanRetirementItem fresh = itemRepo.findById(item.getId()).orElse(item);
        boolean cancel = SubscriptionChangeService.RETIREMENT_CANCEL.equals(c.getKind());
        boolean scheduled = SubscriptionChangeService.RETIREMENT_SWITCH.equals(c.getKind()) && "PENDING".equals(c.getStatus());
        return new ChoiceResultDTO(stateOf(fresh), fresh.getStatus(), fresh.getRetireEffectiveAt(), scheduled, null, changeDto(c), cancel ? Boolean.TRUE : null);
    }

    private ChoiceResultDTO result(PlanRetirementItem item, boolean scheduled, Boolean cancel, PlanQuoteDTO quote, PersonalSubscriptionChange change) {
        return new ChoiceResultDTO(stateOf(item), item.getStatus(), item.getRetireEffectiveAt(), scheduled, quote, change == null ? null : changeDto(change), cancel);
    }

    private static String stateOf(PlanRetirementItem item) {
        return item.getAppliedAt() == null ? "CHANGING" : PlanRetirementItem.FELL_BACK.equals(item.getStatus()) ? "FELL_BACK" : "SWITCHED";
    }

    private static ChangeDTO changeDto(PersonalSubscriptionChange c) {
        return c == null ? null : new ChangeDTO(c.getId(), c.getKind(), c.getEffectiveAt(), c.getStatus());
    }

    private ChoiceDTO choiceOf(PlanRetirementItem item) {
        if (item.getChoiceKind() == null) return null;
        String planKey = null;
        Instant effective = null;
        if (item.getDecidedChangeId() != null) {
            Optional<PersonalSubscriptionChange> c = changes.findById(item.getDecidedChangeId());
            if (c.isPresent() && c.get().getPlanVersionTo() != null) {
                planKey = versions.findById(c.get().getPlanVersionTo()).flatMap(v -> plans.findById(v.getPlanId())).map(Plan::getPlanKey).orElse(null);
                effective = c.get().getEffectiveAt();
            }
        }
        return new ChoiceDTO(item.getChoiceKind(), item.getDecidedAt(), planKey, effective);
    }

    /** The item that concerns this user: an open one (date ahead), else (for the view only) the most recent applied one of the last 90 days. */
    private PlanRetirementItem locate(Long userId, Instant now, boolean changingOnly) {
        for (PlanRetirementItem i : itemRepo.findOpenByUserId(userId)) {
            if (!PlanRetirementItem.EXCLUDED.equals(i.getStatus()) && i.getAppliedAt() == null) return i;
        }
        if (changingOnly) throw new BillingException(404, "NO_RETIREMENT", "Nothing about your plan is changing");
        Instant since = now.minus(RECENT_DAYS, ChronoUnit.DAYS);
        for (PlanRetirementItem i : itemRepo.findByUserIdOrderByIdDesc(userId)) {
            if (i.getAppliedAt() != null && i.getAppliedAt().isAfter(since) && !PlanRetirementItem.EXCLUDED.equals(i.getStatus())) return i;
        }
        throw none();
    }

    private void requireSameInterval(Scored scored, Subscription sub) {
        String current = sub.getBillingInterval() == null ? "MONTH" : sub.getBillingInterval();
        if (!current.equalsIgnoreCase(scored.suggestion().interval())) {
            throw new BillingException(422, "INTERVAL_NOT_AVAILABLE", "A plan change keeps your billing interval; change the interval on My plan afterwards", Map.of("interval", current));
        }
    }

    /** The successor must offer every add-on the subscriber holds, at the quantity they hold (a switch never drops what they pay for). */
    private void requireEveryAddonOffered(Subscription sub, Scored scored, Instant now) {
        for (PersonalBasket.Held h : basket.held(sub.getId(), now)) {
            if (h.effectiveQuantity() <= 0) continue;
            Integer carried = scored.addons().get(h.featureKey());
            if (carried == null || carried < h.effectiveQuantity()) {
                throw new BillingException(422, "SUCCESSOR_NOT_AVAILABLE", "That plan does not offer an add-on you hold", Map.of("reason", "ADDON_NOT_OFFERED", "featureKey", h.featureKey()));
            }
        }
    }

    private String baseStripePriceId(Scored scored) {
        for (LineResult l : scored.priced().group(PricingInputs.PLAN_GROUP).lines()) {
            if (!SuccessorAdvisor.BASE_LINE.equals(l.lineKey())) continue;
            ProductPrice p = prices.findById(Long.valueOf(l.priceId())).orElse(null);
            return p == null ? null : p.getStripePriceId();
        }
        return null;
    }

    private static Map<String, Integer> requested(ChoiceRequest req) {
        if (req.addons() == null) return null;
        Map<String, Integer> out = new LinkedHashMap<>();
        for (ChoiceRequest.AddonRequest a : req.addons()) {
            if (a == null || a.featureKey() == null || a.featureKey().isBlank()) throw new BillingException(400, "INVALID_ADDON", "Every add-on names a featureKey");
            out.merge(a.featureKey().trim(), a.quantity() == null ? 1 : a.quantity(), Integer::sum);
        }
        return out;
    }

    private String featureName(String key) {
        return features.findByFeatureKey(key).map(d -> d.getName() == null || d.getName().isBlank() ? key : d.getName()).orElse(key);
    }

    private User personal(String login) {
        User user = users.findOneByLogin(login).orElseThrow(() -> new BillingException(401, "UNAUTHENTICATED", "Sign in to continue"));
        router.requirePersonal(user);
        return user;
    }

    private static BillingException none() {
        return new BillingException(404, "NO_RETIREMENT", "Nothing about your plan is changing");
    }

    private static BillingException cancelPending() {
        return new BillingException(409, "CANCEL_PENDING", "Resume your subscription before changing it");
    }

    private static String batchId(String key) {
        if (key == null || key.isBlank()) throw new BillingException(400, "IDEMPOTENCY_KEY_REQUIRED", "Send an Idempotency-Key header (a UUID)");
        try {
            return UUID.fromString(key.trim()).toString();
        } catch (IllegalArgumentException e) {
            throw new BillingException(400, "IDEMPOTENCY_KEY_REQUIRED", "The Idempotency-Key must be a UUID");
        }
    }
}
