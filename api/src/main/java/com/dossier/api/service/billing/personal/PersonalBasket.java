package com.dossier.api.service.billing.personal;

import com.dossier.api.domain.sub.PersonalSubscriptionChange;
import com.dossier.api.domain.sub.SubscriptionAddon;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * What a personal subscriber holds beyond the plan base, as Kiwiply sees it (docs/subscriptions/07-stripe-mapping.md section 2.2). One live row per
 * feature carries the quantity the subscriber is ENTITLED to now; a scheduled removal ({@code endsAt}) or a scheduled decrease (a PENDING change) means
 * the customer keeps the add-on until the period end while Stripe's item is already reduced. {@code effectiveQuantity} is what the subscriber will have
 * after those schedules, which is also what Stripe bills for next.
 */
@Component
public class PersonalBasket {

    /** Statuses of a change that has not finished its life (undoable or being retried). */
    static final Set<String> OPEN_CHANGE = Set.of("PENDING", "APPLYING", "FAILED");

    /** One held add-on: the live row, its effective quantity, and the scheduled change (if any) that makes the two differ. */
    public record Held(SubscriptionAddon row, int effectiveQuantity, PersonalSubscriptionChange scheduled) {
        public String featureKey() {
            return row.getFeatureKey();
        }

        public boolean hasScheduledChange() {
            return scheduled != null || row.getEndsAt() != null;
        }
    }

    private final SubscriptionAddonRepository addons;
    private final PersonalSubscriptionChangeRepository changes;

    public PersonalBasket(SubscriptionAddonRepository addons, PersonalSubscriptionChangeRepository changes) {
        this.addons = addons;
        this.changes = changes;
    }

    @Transactional(readOnly = true)
    public List<Held> held(Long subscriptionId, Instant now) {
        Map<String, PersonalSubscriptionChange> scheduledByFeature = changes
            .findBySubscriptionIdAndStatusInOrderByIdAsc(subscriptionId, OPEN_CHANGE)
            .stream()
            .filter(c -> c.getFeatureKey() != null && ("REMOVE_ADDON".equals(c.getKind()) || "CHANGE_QUANTITY".equals(c.getKind())))
            .filter(c -> c.getQuantityTo() != null && c.getQuantityFrom() != null && c.getQuantityTo() < c.getQuantityFrom())
            .filter(c -> c.getEffectiveAt() != null && c.getEffectiveAt().isAfter(now))
            .collect(Collectors.toMap(PersonalSubscriptionChange::getFeatureKey, c -> c, (a, b) -> b));
        List<Held> out = new ArrayList<>();
        for (SubscriptionAddon row : addons.findBySubscriptionIdAndLiveTrueOrderByIdAsc(subscriptionId)) {
            if (row.getEndsAt() != null && !row.getEndsAt().isAfter(now)) continue; // ended, waiting for the settle step
            PersonalSubscriptionChange scheduled = scheduledByFeature.get(row.getFeatureKey());
            int effective = row.getEndsAt() != null ? 0 : scheduled != null ? scheduled.getQuantityTo() : row.getQuantity();
            out.add(new Held(row, effective, scheduled));
        }
        return out;
    }
}
