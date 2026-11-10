package com.dossier.api.repository.sub;

import com.dossier.api.domain.billing.Invoice;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The personal invoice mirror (story K8.3): written by the Stripe webhook only, read by the invoice list (K5.7). */
public interface InvoiceRepository extends Repository<Invoice, Long> {
    <S extends Invoice> S save(S entity);

    long count();

    Optional<Invoice> findById(Long id);

    Optional<Invoice> findByStripeInvoiceId(String stripeInvoiceId);

    List<Invoice> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable page);

    /** Account deletion keeps the money record (7 years) but cuts the link to the person: the user id becomes 0. */
    @Modifying
    @Query("update Invoice i set i.userId = 0 where i.userId = :userId")
    int pseudonymise(@Param("userId") Long userId);
}
