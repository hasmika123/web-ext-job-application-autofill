package com.dossier.api.service.billing.personal;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.sub.PersonalSubscriptionChange;
import com.dossier.api.domain.sub.SubscriptionQuote;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.BillingScopeRouter;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.dto.ChangeBatchDTO;
import com.dossier.api.service.dto.PlanQuoteDTO;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * {@code POST /api/billing/quotes/{id}/confirm} (docs/subscriptions/09-apis.md section 3.1; story K5.4): the orchestration of a change. Requires an
 * {@code Idempotency-Key} (a UUID, which becomes the batch id), refuses a stale or already-used quote, records the changes in one transaction
 * ({@link SubscriptionChangeService#record}) and only then tells Stripe ({@link SubscriptionChangeApplier#apply}), outside that transaction: a Stripe
 * failure leaves the customer with what they bought and the retry job finishes the job. Repeating the same key returns the same batch.
 *
 * <p>This class is deliberately not transactional.
 */
@Service
public class QuoteConfirmService {

    private final PersonalQuoteService quotes;
    private final SubscriptionChangeService changeService;
    private final SubscriptionChangeApplier applier;
    private final PersonalSubscriptionChangeRepository changes;
    private final SubscriptionRepository subscriptions;
    private final UserRepository users;
    private final BillingScopeRouter router;
    private final StripeGateway gateway;

    public QuoteConfirmService(
        PersonalQuoteService quotes,
        SubscriptionChangeService changeService,
        SubscriptionChangeApplier applier,
        PersonalSubscriptionChangeRepository changes,
        SubscriptionRepository subscriptions,
        UserRepository users,
        BillingScopeRouter router,
        StripeGateway gateway
    ) {
        this.quotes = quotes;
        this.changeService = changeService;
        this.applier = applier;
        this.changes = changes;
        this.subscriptions = subscriptions;
        this.users = users;
        this.router = router;
        this.gateway = gateway;
    }

    public ChangeBatchDTO confirm(Long quoteId, String login, String idempotencyKey, List<String> confirmedCommercialDeps) {
        String batchId = batchId(idempotencyKey);
        User user = users.findOneByLogin(login).orElseThrow(() -> new BillingException(401, "UNAUTHENTICATED", "Sign in to continue"));
        router.requirePersonal(user);
        SubscriptionQuote q = quotes.owned(quoteId, login);

        // The same key again: the same batch, never a second application.
        if (PersonalQuoteService.STATUS_APPLIED.equals(q.getStatus())) {
            if (batchId.equals(q.getAppliedBatchId())) {
                applier.apply(batchId); // finish anything the first call left unfinished
                return changeService.batch(batchId, quotes.toDto(q));
            }
            throw new BillingException(409, "QUOTE_STALE", "This quote was already used", Map.of("reason", "QUOTE_APPLIED"));
        }
        if (!changes.findByBatchIdOrderByIdAsc(batchId).isEmpty()) {
            throw new BillingException(409, "IDEMPOTENCY_KEY_REUSED", "That Idempotency-Key belongs to another request");
        }
        if (!PersonalQuoteService.KIND_CHANGE.equals(q.getKind())) {
            throw new BillingException(422, "INVALID_KIND", "Only a CHANGE quote is confirmed; a CHECKOUT quote goes to checkout");
        }
        if (!gateway.isEnabled()) throw BillingException.disabled();

        Subscription sub = subscriptions.findOneByUserId(user.getId()).orElseThrow(() -> new BillingException(409, "NO_SUBSCRIPTION", "There is no active subscription to change"));
        if (sub.getStripeSubscriptionId() == null) throw new BillingException(409, "NO_SUBSCRIPTION", "There is no active subscription to change");
        if (sub.isCancelAtPeriodEnd()) throw new BillingException(409, "CANCEL_PENDING", "Resume your subscription before changing it");

        PlanQuoteDTO dto = quotes.toDto(q);
        if (!dto.requiresConfirmation().isEmpty()) {
            PlanQuoteDTO.Confirmation first = dto.requiresConfirmation().get(0);
            // The required service is not in the basket yet, so it is not priced: ask for a new quote that includes it.
            throw new BillingException(422, "DEPENDENCY_UNCONFIRMED", first.featureKey() + " needs " + first.requires() + " confirmed", Map.of("requires", first.requires(), "requote", true));
        }
        quotes.requireFresh(q);

        List<PersonalSubscriptionChange> recorded = changeService.record(quoteId, batchId, sub);
        applier.apply(batchId);
        return changeService.batch(batchId, dto);
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
