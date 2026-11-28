package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsPrepSession;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code cws_prep_session}: every method takes the organization id first. */
public interface CwsPrepSessionRepository extends Repository<CwsPrepSession, Long> {
    <S extends CwsPrepSession> S save(S entity);

    <S extends CwsPrepSession> S saveAndFlush(S entity);

    void flush();

    <S extends CwsPrepSession> List<S> saveAll(Iterable<S> entities);

    void delete(CwsPrepSession entity);

    List<CwsPrepSession> findByOrgIdAndConsultantIdOrderByOccurredAtDesc(Long orgId, Long consultantId);

    @Query("select p.consultantId, count(p) from CwsPrepSession p where p.orgId = :orgId and p.consultantId in :consultantIds and p.occurredAt >= :from and p.occurredAt < :to group by p.consultantId")
    List<Object[]> countByOrgIdAndConsultantIdInAndOccurredAtBetween(
        @Param("orgId") Long orgId,
        @Param("consultantIds") Collection<Long> consultantIds,
        @Param("from") Instant from,
        @Param("to") Instant to
    );

    List<CwsPrepSession> findByOrgIdAndConsultantIdInAndOccurredAtGreaterThanEqualAndOccurredAtLessThan(
        Long orgId,
        Collection<Long> consultantIds,
        Instant from,
        Instant to
    );

    Optional<CwsPrepSession> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgId(Long orgId);
}
