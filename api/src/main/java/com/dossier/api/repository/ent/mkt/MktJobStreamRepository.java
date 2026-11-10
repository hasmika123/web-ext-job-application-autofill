package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktJobStream;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_job_stream}: every method takes the organization id first. */
public interface MktJobStreamRepository extends Repository<MktJobStream, Long> {
    Optional<MktJobStream> findByOrgIdAndId(Long orgId, Long id);

    List<MktJobStream> findByOrgIdOrderByCreatedAtAscIdAsc(Long orgId);

    long countByOrgId(Long orgId);

    long countByOrgIdAndStatus(Long orgId, String status);

    long countByOrgIdAndStatusAndCreatedAtLessThan(Long orgId, String status, Instant before);

    boolean existsByOrgIdAndSourceLabelIgnoreCase(Long orgId, String sourceLabel);

    <S extends MktJobStream> S save(S entity);

    <S extends MktJobStream> S saveAndFlush(S entity);
}
