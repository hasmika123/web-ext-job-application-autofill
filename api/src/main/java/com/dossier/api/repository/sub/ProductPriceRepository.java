package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.ProductPrice;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Platform access to {@code product_price} (no org_id; the subscription module's repositories live in {@code repository.sub}). */
public interface ProductPriceRepository extends Repository<ProductPrice, Long> {
    <S extends ProductPrice> S save(S entity);

    <S extends ProductPrice> S saveAndFlush(S entity);

    void flush();

    long count();

    Optional<ProductPrice> findById(Long id);

    List<ProductPrice> findAllByOrderByIdDesc();

    List<ProductPrice> findByProductIdOrderByIdDesc(Long productId);

    List<ProductPrice> findByCatalogVersionOrderByIdAsc(Integer catalogVersion);

    /** The ACTIVE row of one key (at most one: the generated active_key is UNIQUE). */
    @Query(
        "select p from ProductPrice p where p.productId = :productId and p.audience = :audience and p.billingInterval = :billingInterval and p.currency = :currency and p.active = true"
    )
    Optional<ProductPrice> findActive(
        @Param("productId") Long productId,
        @Param("audience") String audience,
        @Param("billingInterval") String billingInterval,
        @Param("currency") String currency
    );

    /** A published row waiting for its effective date (not active, not retired). */
    @Query(
        "select p from ProductPrice p where p.productId = :productId and p.audience = :audience and p.billingInterval = :billingInterval and p.currency = :currency and p.active = false and p.publishedAt is not null and p.retiredAt is null"
    )
    List<ProductPrice> findScheduled(
        @Param("productId") Long productId,
        @Param("audience") String audience,
        @Param("billingInterval") String billingInterval,
        @Param("currency") String currency
    );

    @Query("select p from ProductPrice p where p.active = false and p.publishedAt is not null and p.retiredAt is null and p.effectiveFrom <= :now order by p.effectiveFrom, p.id")
    List<ProductPrice> findScheduledDue(@Param("now") Instant now);

    @Query("select p from ProductPrice p where p.active = true and p.effectiveUntil is not null and p.effectiveUntil <= :now order by p.id")
    List<ProductPrice> findActiveExpired(@Param("now") Instant now);

    @Query("select count(p) from ProductPrice p where p.productId = :productId and p.active = true")
    long countActiveByProduct(@Param("productId") Long productId);
}
