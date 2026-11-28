package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsMatchView;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code cws_match_view}: every method takes the organization id first. */
public interface CwsMatchViewRepository extends Repository<CwsMatchView, Long> {
    <S extends CwsMatchView> S save(S entity);

    <S extends CwsMatchView> S saveAndFlush(S entity);

    void flush();

    <S extends CwsMatchView> List<S> saveAll(Iterable<S> entities);

    void delete(CwsMatchView entity);

    List<CwsMatchView> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    @Query("select v.consultantId, count(v) from CwsMatchView v where v.orgId = :orgId and v.consultantId in :consultantIds and v.viewedAt >= :from and v.viewedAt < :to group by v.consultantId")
    List<Object[]> countByOrgIdAndConsultantIdInAndViewedAtBetween(
        @Param("orgId") Long orgId,
        @Param("consultantIds") Collection<Long> consultantIds,
        @Param("from") Instant from,
        @Param("to") Instant to
    );

    List<CwsMatchView> findByOrgIdAndConsultantIdInAndViewedAtGreaterThanEqualAndViewedAtLessThan(
        Long orgId,
        Collection<Long> consultantIds,
        Instant from,
        Instant to
    );

    Optional<CwsMatchView> findByOrgIdAndConsultantIdAndRequirementId(Long orgId, Long consultantId, Long requirementId);
}
