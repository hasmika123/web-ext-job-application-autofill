package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsOfferEvent;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_offer_event}: every method takes the organization id first, then the consultant id. */
public interface CwsOfferEventRepository extends JpaRepository<CwsOfferEvent, Long> {
    List<CwsOfferEvent> findByOrgIdAndConsultantIdOrderByOccurredAtDescIdDesc(Long orgId, Long consultantId, Pageable pageable);

    List<CwsOfferEvent> findByOrgIdAndConsultantIdAndOfferIdOrderByOccurredAtDescIdDesc(Long orgId, Long consultantId, Long offerId);
}
