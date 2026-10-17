package com.dossier.api.service.entitlement;

import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.service.catalog.PublicCatalogService;
import com.dossier.api.service.dto.PublicCatalogDTO;
import com.dossier.api.service.dto.PublicCatalogDTO.Plan;
import com.dossier.api.service.dto.PublicCatalogDTO.Price;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Story K7.6 (docs/subscriptions/06-entitlements-and-enforcement.md): which plan unlocks a locked feature, chosen by the server from the PUBLISHED public
 * catalog (never a draft). The cheapest non-sunset plan that INCLUDES the feature, priced at the customer's current billing interval, else at MONTH. A
 * feature no plan includes but one offers as an add-on points at {@code /settings/plan?add=} with the add-on's price. With no feature, the cheapest priced plan.
 * Empty when the catalog has nothing sellable (then the 402 body is exactly what it always was). Never throws.
 */
@Component
public class UpgradeAdvisor {

    private static final Logger LOG = LoggerFactory.getLogger(UpgradeAdvisor.class);

    /** The upgrade a 402 body carries: {@code path} is always a same-site path. */
    public record Upgrade(String planKey, String planName, String interval, long amountMinor, String currency, String path) {}

    private final PublicCatalogService catalog;
    private final SubscriptionRepository subscriptions;

    public UpgradeAdvisor(PublicCatalogService catalog, SubscriptionRepository subscriptions) {
        this.catalog = catalog;
        this.subscriptions = subscriptions;
    }

    public Optional<Upgrade> advise(String login, String featureKey) {
        try {
            PublicCatalogDTO dto = catalog.catalog(null);
            String interval = login == null ? "MONTH" : subscriptions.findOneByUserLogin(login).map(s -> s.getBillingInterval()).filter(i -> i != null && !i.isBlank()).orElse("MONTH");
            List<Plan> sellable = dto.plans().stream().filter(p -> !p.sunset() && p.prices() != null && !p.prices().isEmpty()).toList();
            if (featureKey != null) {
                Optional<Upgrade> included = cheapest(
                    sellable.stream().filter(p -> p.included() != null && p.included().stream().anyMatch(i -> featureKey.equals(i.featureKey()))).toList(),
                    interval,
                    dto.currency()
                );
                if (included.isPresent()) return included;
                for (Plan p : sellable.stream().sorted(Comparator.comparing(Plan::planKey)).toList()) {
                    if (p.optional() == null) continue;
                    for (PublicCatalogDTO.Addon a : p.optional()) {
                        if (!featureKey.equals(a.featureKey()) || a.prices() == null) continue;
                        Price price = a.prices().containsKey(interval) ? a.prices().get(interval) : a.prices().get("MONTH");
                        if (price != null) return Optional.of(new Upgrade(p.planKey(), p.name(), a.prices().containsKey(interval) ? interval : "MONTH", price.amountMinor(), dto.currency(), "/settings/plan?add=" + featureKey));
                    }
                }
                return Optional.empty();
            }
            return cheapest(sellable, interval, dto.currency());
        } catch (RuntimeException e) {
            LOG.debug("upgrade advisor could not answer: {}", e.toString());
            return Optional.empty();
        }
    }

    private static Optional<Upgrade> cheapest(List<Plan> plans, String interval, String currency) {
        Upgrade best = null;
        for (Plan p : plans) {
            String use = p.prices().containsKey(interval) ? interval : "MONTH";
            Price price = p.prices().get(use);
            if (price == null) continue;
            if (best == null || price.amountMinor() < best.amountMinor() || (price.amountMinor() == best.amountMinor() && p.planKey().compareTo(best.planKey()) < 0)) {
                best = new Upgrade(p.planKey(), p.name(), use, price.amountMinor(), currency, "/pricing?plan=" + p.planKey());
            }
        }
        return Optional.ofNullable(best);
    }
}
