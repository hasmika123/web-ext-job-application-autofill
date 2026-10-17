package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.repository.sub.PlanRetirementRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.retirement.SuccessorAdvisor.Evaluation;
import com.dossier.api.service.retirement.SuccessorAdvisor.Scored;
import com.dossier.api.service.retirement.SuccessorAdvisor.Suggestion;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Keeps each undecided item's suggestion current (docs/subscriptions/11 section 5.2; story K10.2): evaluate the subscriber with {@link SuccessorAdvisor}, keep (or
 * re-create) the RETIREMENT_SWITCH quote, and store the best suggestion on the item. {@link #refresh} is also what the notice job and the subscriber's page call, so the
 * numbers in an email and on the page come from the same evaluation. {@link #recomputeOpen} is the nightly pass; it also moves an item's date later when the subscription
 * has renewed past it (the date never moves earlier).
 */
@Service
public class RetirementSuggestionService {

    private static final Logger LOG = LoggerFactory.getLogger(RetirementSuggestionService.class);

    private final PlanRetirementRepository retirements;
    private final PlanRetirementItemRepository itemRepo;
    private final SubscriptionRepository subscriptions;
    private final SuccessorAdvisor advisor;
    private final RetirementQuoteService quotes;
    private final RetirementEffectiveDateService dates;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public RetirementSuggestionService(
        PlanRetirementRepository retirements,
        PlanRetirementItemRepository itemRepo,
        SubscriptionRepository subscriptions,
        SuccessorAdvisor advisor,
        RetirementQuoteService quotes,
        RetirementEffectiveDateService dates,
        ObjectMapper json,
        PlatformTransactionManager transactionManager
    ) {
        this.tx = new TransactionTemplate(transactionManager);
        this.retirements = retirements;
        this.itemRepo = itemRepo;
        this.subscriptions = subscriptions;
        this.advisor = advisor;
        this.quotes = quotes;
        this.dates = dates;
        this.json = json;
    }

    /** Evaluate and store the suggestion of one item; returns the evaluation (null when the subscription is gone). Throws 503 when prices are unavailable. */
    @Transactional
    public Evaluation refresh(PlanRetirement r, PlanRetirementItem item, Instant now) {
        Subscription sub = subscriptions.findById(item.getSubscriptionId()).orElse(null);
        if (sub == null) return null;
        Evaluation ev = advisor.evaluate(r, sub, now);
        Scored best = ev.best();
        Suggestion stored = null;
        if (best != null) {
            Long quoteId = null;
            if (best.priced() != null) {
                quoteId = quotes.persist(sub, item.getRetireEffectiveAt(), best, item.getSuggestedQuoteId(), now);
                item.setSuggestedQuoteId(quoteId);
            }
            stored = best.suggestion().withQuote(quoteId);
        }
        try {
            item.setSuggestionJson(stored == null ? null : json.writeValueAsString(stored));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        itemRepo.save(item);
        return ev;
    }

    /**
     * The nightly pass: every undecided item of every live retirement, each in its own transaction so one failure (prices unavailable, a deleted subscription) does not
     * stop the rest. Returns how many were refreshed. Idempotent.
     */
    public int recomputeOpen(Instant now) {
        int n = 0;
        for (PlanRetirement r : retirements.findByStatusInOrderByIdAsc(List.of(PlanRetirement.NOTICING, PlanRetirement.COMPLETING))) {
            for (PlanRetirementItem i : itemRepo.findPending(r.getId())) {
                try {
                    Boolean done = tx.execute(s -> recomputeOne(r.getId(), i.getId(), now));
                    if (Boolean.TRUE.equals(done)) n++;
                } catch (BillingException e) {
                    LOG.debug("suggestion for item {} skipped: {}", i.getId(), e.getCode());
                } catch (RuntimeException e) {
                    LOG.warn("suggestion for item {} failed: {}", i.getId(), e.toString());
                }
            }
        }
        return n;
    }

    boolean recomputeOne(Long retirementId, Long itemId, Instant now) {
        PlanRetirement r = retirements.findById(retirementId).orElse(null);
        PlanRetirementItem item = itemRepo.findById(itemId).orElse(null);
        if (r == null || item == null || !PlanRetirementItem.PENDING.equals(item.getStatus())) return false;
        Subscription sub = subscriptions.findById(item.getSubscriptionId()).orElse(null);
        if (sub == null) return false;
        Instant moved = dates.moveLater(item.getRetireEffectiveAt(), sub);
        if (moved.isAfter(item.getRetireEffectiveAt())) item.setRetireEffectiveAt(moved.truncatedTo(ChronoUnit.MILLIS));
        return refresh(r, item, now) != null;
    }
}
