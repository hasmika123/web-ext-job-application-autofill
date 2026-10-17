package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.catalog.plan.PlanLoader;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.CatalogPort;
import com.dossier.api.service.pricing.PriceRow;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The real {@link CatalogPort} (K3.1 wiring): the row of {@code product_price} in force at an instant, mapped onto the engine's {@link PriceRow}.
 * {@code aiBudgetCentsPerWindow} is the worst-case AI cost of ONE unit over one whole period of the row's interval: for a plan base it is the cap of the
 * live plan version (the explicit whole-period budget of {@code ai_window_json} when there is one, 800 for a Pro quarter, else cap x factor), for a
 * service product it is the service's monthly {@code ai_budget_cents} x factor, for anything else 0. {@code kind} is the product kind.
 */
@Component
public class CatalogPortAdapter implements CatalogPort {

    private final ProductRepository products;
    private final ProductPriceRepository prices;
    private final PlanVersionRepository versions;
    private final FeatureDefinitionRepository features;
    private final PlanLoader loader;

    public CatalogPortAdapter(ProductRepository products, ProductPriceRepository prices, PlanVersionRepository versions, FeatureDefinitionRepository features, PlanLoader loader) {
        this.products = products;
        this.prices = prices;
        this.versions = versions;
        this.features = features;
        this.loader = loader;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PriceRow> activePrice(String productCode, Audience audience, BillingInterval interval, String currency, Instant at) {
        Product product = products.findByCode(productCode).orElse(null);
        if (product == null) return Optional.empty();
        List<ProductPrice> rows = prices.findEffectiveAt(product.getId(), audience.name(), interval.name(), currency, at);
        if (rows.isEmpty()) return Optional.empty();
        ProductPrice p = rows.get(0);
        return Optional.of(new PriceRow(String.valueOf(p.getId()), product.getCode(), product.getKind(), audience, interval, currency, p.getAmountMinor(), aiWindow(product, interval)));
    }

    int aiWindow(Product product, BillingInterval interval) {
        if (!interval.isRecurring()) return 0;
        if ("SUBSCRIPTION".equals(product.getKind())) {
            List<PlanVersion> live = versions.findLiveByBaseProduct(product.getId());
            if (live.isEmpty()) return 0;
            PlanVersion v = live.get(0);
            Long explicit = loader.aiWindows(v.getAiWindowJson()).get(interval);
            if (explicit != null) return Math.toIntExact(explicit);
            return Math.multiplyExact(v.getAiBudgetCapCents() == null ? 0 : v.getAiBudgetCapCents(), interval.factor());
        }
        if (product.getFeatureKey() != null) {
            int monthly = features.findByFeatureKey(product.getFeatureKey()).map(FeatureDefinition::getAiBudgetCents).map(i -> i == null ? 0 : i).orElse(0);
            return Math.multiplyExact(monthly, interval.factor());
        }
        return 0;
    }
}
