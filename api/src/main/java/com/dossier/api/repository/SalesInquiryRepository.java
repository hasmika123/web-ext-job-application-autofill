package com.dossier.api.repository;

import java.util.List;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
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

    /** Account erasure: removes everything keyed by this login. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from SalesInquiry i where i.userLogin = :v")
    int deleteByUserLogin(@Param("v") String v);

    /** The reports/inquiries this login sent, oldest first (the account export). */
    List<SalesInquiry> findByUserLoginOrderByIdAsc(String userLogin);
}
