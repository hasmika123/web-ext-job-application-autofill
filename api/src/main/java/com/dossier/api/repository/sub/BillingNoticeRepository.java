package com.dossier.api.repository.sub;

import com.dossier.api.domain.sub.BillingNotice;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** Access to {@code billing_notice}: the ledger of every billing notice sent. */
public interface BillingNoticeRepository extends JpaRepository<BillingNotice, Long> {
    boolean existsByDedupeKey(String dedupeKey);

    Page<BillingNotice> findByRetirementIdOrderByIdDesc(Long retirementId, Pageable page);

    List<BillingNotice> findByItemIdOrderByIdAsc(Long itemId);
}
