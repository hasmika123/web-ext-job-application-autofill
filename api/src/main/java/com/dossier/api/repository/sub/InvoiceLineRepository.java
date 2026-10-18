package com.dossier.api.repository.sub;

import com.dossier.api.domain.billing.InvoiceLine;
import java.util.List;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The lines of the personal invoice mirror (story K8.3). */
public interface InvoiceLineRepository extends Repository<InvoiceLine, Long> {
    <S extends InvoiceLine> S save(S entity);

    long count();

    List<InvoiceLine> findByInvoiceIdOrderBySortOrderAscIdAsc(Long invoiceId);

    @Modifying
    @Query("delete from InvoiceLine l where l.invoiceId = :invoiceId")
    int deleteByInvoiceId(@Param("invoiceId") Long invoiceId);

    @Modifying
    @Query("update InvoiceLine l set l.userId = 0 where l.userId = :userId")
    int pseudonymise(@Param("userId") Long userId);
}
