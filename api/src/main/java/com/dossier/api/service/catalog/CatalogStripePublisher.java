package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.PriceInterval;
import com.dossier.api.service.billing.StripeGateway.PriceSpec;
import com.dossier.api.service.billing.StripeGateway.ProductSpec;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Story K1.5: a published price gets its Stripe Price, and a retired one has it deactivated (docs/subscriptions/07-stripe-mapping.md section 3). Plugged into
 * {@link CatalogService} as a {@link PriceStripeSync}, so it runs inside the publish/retire transaction BEFORE the commit: when Stripe refuses, the whole
 * publish rolls back and nothing is half-live.
 *
 * <ul>
 *   <li>One Stripe Product per catalog product: idempotency key {@code prod-{code}}, its id stored on {@code product.stripe_product_id}.</li>
 *   <li>One Stripe Price per price row: key {@code price-{rowId}}, metadata {@code app=kiwiply, price_row_id, audience, catalog_version, product_code}. A retry of
 *       the same publish replays the same Stripe Price (Stripe keeps a key for 24 hours), so a Stripe success followed by a failed database commit leaves no
 *       orphan after the next attempt.</li>
 *   <li>Interval mapping: MONTH month x 1, QUARTER month x 3, YEAR month x 12 (decision K8-Q2), ONE_TIME a one-time price. Nothing is ever edited.</li>
 *   <li>Retire: {@code active=false} in Stripe, never a delete; subscribers on the price keep being billed at it.</li>
 *   <li><b>Billing disabled (blank key)</b>: nothing is sent and {@code stripe_price_id} stays NULL (a recorded deviation from 07 section 8, which refuses the
 *       publish; the catalog stays publishable without Stripe so QA and CI work). Stripe is test mode wherever the configured key is a test key; this class never
 *       reads the key.</li>
 * </ul>
 */
@Component
public class CatalogStripePublisher implements PriceStripeSync {

    private static final Logger LOG = LoggerFactory.getLogger(CatalogStripePublisher.class);

    private final StripeGateway gateway;
    private final ProductRepository products;

    public CatalogStripePublisher(StripeGateway gateway, ProductRepository products) {
        this.gateway = gateway;
        this.products = products;
    }

    @Override
    public void onPublish(ProductPrice price) {
        if (!gateway.isEnabled()) return;
        if (price.getStripePriceId() != null && !price.getStripePriceId().isBlank()) return; // already has its Stripe Price
        Product product = products.findById(price.getProductId()).orElseThrow(() -> CatalogException.notFound("product", String.valueOf(price.getProductId())));
        String stripeProductId = ensureProduct(product);
        Map<String, String> md = new LinkedHashMap<>();
        md.put("price_row_id", String.valueOf(price.getId()));
        md.put("audience", price.getAudience());
        md.put("catalog_version", String.valueOf(price.getCatalogVersion()));
        md.put("product_code", product.getCode());
        String id = gateway.createPrice(
            new PriceSpec(stripeProductId, price.getCurrency(), price.getAmountMinor(), interval(price.getBillingInterval()), product.getCode() + " " + price.getBillingInterval(), md),
            IdempotencyKey.of("price", price.getId())
        );
        price.setStripePriceId(id);
        LOG.info("catalog: stripe price {} created for price row {} ({} {})", id, price.getId(), product.getCode(), price.getBillingInterval());
    }

    @Override
    public void onRetire(ProductPrice price) {
        if (!gateway.isEnabled()) return;
        if (price.getStripePriceId() == null || price.getStripePriceId().isBlank()) return;
        gateway.deactivatePrice(price.getStripePriceId(), IdempotencyKey.of("price-off", price.getId()));
        LOG.info("catalog: stripe price {} deactivated (price row {})", price.getStripePriceId(), price.getId());
    }

    /** The Stripe Product of a catalog product, created on first use. */
    String ensureProduct(Product product) {
        if (product.getStripeProductId() != null && !product.getStripeProductId().isBlank()) return product.getStripeProductId();
        Map<String, String> md = new LinkedHashMap<>();
        md.put("kind", String.valueOf(product.getKind()));
        if (product.getFeatureKey() != null) md.put("feature_key", product.getFeatureKey());
        String id = gateway.createProduct(new ProductSpec(product.getCode(), product.getName(), product.getDescription(), md), IdempotencyKey.of("prod", product.getCode()));
        product.setStripeProductId(id);
        product.setUpdatedAt(Instant.now());
        products.save(product);
        return id;
    }

    static PriceInterval interval(String billingInterval) {
        return switch (billingInterval) {
            case "MONTH" -> PriceInterval.MONTH;
            case "QUARTER" -> PriceInterval.QUARTER;
            case "YEAR" -> PriceInterval.YEAR;
            case "ONE_TIME" -> PriceInterval.ONE_TIME;
            default -> throw new IllegalArgumentException("unknown interval " + billingInterval);
        };
    }
}
