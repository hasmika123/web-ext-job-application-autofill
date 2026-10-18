package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsOfferEvent;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_offer_event}: every method takes the organization id first, then the consultant id. */
public interface CwsOfferEventRepository extends Repository<CwsOfferEvent, Long> {
    <S extends CwsOfferEvent> S save(S entity);

    <S extends CwsOfferEvent> S saveAndFlush(S entity);

    void flush();

    <S extends CwsOfferEvent> List<S> saveAll(Iterable<S> entities);

    void delete(CwsOfferEvent entity);

    List<CwsOfferEvent> findByOrgIdAndConsultantIdOrderByOccurredAtDescIdDesc(Long orgId, Long consultantId, Pageable pageable);

    List<CwsOfferEvent> findByOrgIdAndConsultantIdAndOfferIdOrderByOccurredAtDescIdDesc(Long orgId, Long consultantId, Long offerId);

    long countByOrgId(Long orgId);
}
