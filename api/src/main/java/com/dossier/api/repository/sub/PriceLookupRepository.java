package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.ProductPrice;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Read-only lookups of {@code product_price} by its Stripe id (the webhook and invoice mirrors start from Stripe's id, not ours). */
public interface PriceLookupRepository extends Repository<ProductPrice, Long> {
    Optional<ProductPrice> findFirstByStripePriceId(String stripePriceId);

    List<ProductPrice> findByStripePriceIdIn(Collection<String> stripePriceIds);

    Optional<ProductPrice> findById(Long id);
}
