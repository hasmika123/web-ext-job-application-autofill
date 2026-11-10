package com.dossier.api.repository.catalog;

import com.dossier.api.domain.ent.billing.Product;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Platform catalog access to {@code product} (no org_id: the catalog is shared; prices are org contract rows). */
public interface ProductRepository extends Repository<Product, Long> {
    <S extends Product> S save(S entity);
    <S extends Product> List<S> saveAll(Iterable<S> entities);
    Optional<Product> findById(Long id);
    List<Product> findAllByOrderBySortOrderAsc();
    long count();
    Optional<Product> findByCode(String code);
    List<Product> findByKindOrderBySortOrderAsc(String kind);

}
