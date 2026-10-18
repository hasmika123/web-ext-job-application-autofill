package com.dossier.api.service.catalog.dto;

import com.dossier.api.domain.catalog.CatalogPublish;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.Product;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Shapes of the price and catalog-version endpoints (docs/subscriptions/09-apis.md section 1.2). Money is {@code long} minor units plus an ISO
 * currency; the web never computes money. Additive: later stories add members, never rename these.
 */
public final class CatalogPriceDTOs {

    private CatalogPriceDTOs() {}

    public record PriceDTO(
        Long id,
        Long productId,
        String productCode,
        String audience,
        String interval,
        Long amountMinor,
        String currency,
        String stripePriceId,
        Long payoutMinor,
        Integer subscriberDiscountBp,
        Boolean acceptsPromos,
        String countrySet,
        String annualSource,
        Long derivedFromPriceId,
        Integer derivedDiscountBp,
        Integer marginBpWorst,
        Integer marginBpTypical,
        String status,
        Boolean active,
        Instant effectiveFrom,
        Instant effectiveUntil,
        Instant publishedAt,
        Instant retiredAt,
        Integer catalogVersion,
        String createdBy,
        Instant createdAt
    ) {
        public static PriceDTO from(ProductPrice p, String productCode) {
            return new PriceDTO(
                p.getId(), p.getProductId(), productCode, p.getAudience(), p.getBillingInterval(), p.getAmountMinor(), p.getCurrency(), p.getStripePriceId(),
                p.getPayoutMinor(), p.getSubscriberDiscountBp(), p.getAcceptsPromos(), p.getCountrySet(), p.getAnnualSource(), p.getDerivedFromPriceId(),
                p.getDerivedDiscountBp(), p.getMarginBpWorst(), p.getMarginBpTypical(), p.status(), p.getActive(), p.getEffectiveFrom(), p.getEffectiveUntil(),
                p.getPublishedAt(), p.getRetiredAt(), p.getCatalogVersion(), p.getCreatedBy(), p.getCreatedAt()
            );
        }
    }

    /** A new DRAFT price. {@code interval}: MONTH, QUARTER, YEAR or ONE_TIME. {@code annualSource} (YEAR only): EXPLICIT or DERIVED. */
    public record PriceRequest(
        Long productId,
        String audience,
        String interval,
        Long amountMinor,
        String currency,
        Long payoutMinor,
        Integer subscriberDiscountBp,
        Boolean acceptsPromos,
        String countrySet,
        String annualSource,
        Long derivedFromPriceId,
        Integer derivedDiscountBp,
        Instant effectiveFrom,
        String reason
    ) {}

    /** Publish a draft: {@code reason} is required (HIGH); {@code effectiveFrom} defaults to now and is never in the past. */
    public record PublishPriceRequest(Instant effectiveFrom, String reason, String overrideReason) {}

    /** Retire a price: {@code effectiveUntil} defaults to now; a future date keeps the row in force until then. */
    public record RetirePriceRequest(Instant effectiveUntil, String reason) {}

    public record ProductDTO(
        Long id,
        String code,
        String name,
        String kind,
        String soldTo,
        String featureKey,
        String stripeProductId,
        String quantityBasis,
        String roleKey,
        Boolean active,
        Integer sortOrder,
        Boolean demoData
    ) {
        public static ProductDTO from(Product p) {
            return new ProductDTO(
                p.getId(), p.getCode(), p.getName(), p.getKind(), p.getSoldTo(), p.getFeatureKey(), p.getStripeProductId(), p.getQuantityBasis(), p.getRoleKey(),
                p.getActive(), p.getSortOrder(), p.getDemoData()
            );
        }
    }

    public record CatalogVersionDTO(
        Integer version,
        Instant publishedAt,
        String publishedBy,
        String summary,
        List<Long> priceIds,
        String snapshotHash,
        List<PriceDTO> prices
    ) {
        public static CatalogVersionDTO from(CatalogPublish c, List<Long> priceIds, List<PriceDTO> prices) {
            return new CatalogVersionDTO(c.getId(), c.getPublishedAt(), c.getPublishedBy(), c.getSummary(), priceIds, c.getSnapshotHash(), prices);
        }
    }

    /** {@code GET /api/admin/catalog}: the whole catalog on one page. */
    public record CatalogDTO(
        List<ProductDTO> products,
        List<PriceDTO> prices,
        List<ServiceDTO> services,
        List<CatalogRulesDTOs.PresetDTO> presets,
        List<CatalogRulesDTOs.VolumeTierDTO> tiers,
        Map<String, Integer> floors,
        String feeModel,
        Integer catalogVersion
    ) {}
}
