package com.dossier.api.repository;

import com.dossier.api.domain.SalesInquiry;
import com.dossier.api.domain.enumeration.InquiryStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Spring Data repository for "Contact us" requests (Phase 15.6). */
@Repository
public interface SalesInquiryRepository extends JpaRepository<SalesInquiry, Long> {
    Page<SalesInquiry> findAllByStatus(InquiryStatus status, Pageable pageable);

    long countByStatus(InquiryStatus status);
}
