package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktStreamAlert;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_stream_alert}: every method takes the organization id first. */
public interface MktStreamAlertRepository extends Repository<MktStreamAlert, Long> {
    long countByOrgId(Long orgId);

    List<MktStreamAlert> findByOrgIdAndResolvedAtIsNullOrderByRaisedAtDesc(Long orgId, Pageable page);

    List<MktStreamAlert> findByOrgIdAndRaisedAtGreaterThanEqualOrderByRaisedAtAsc(Long orgId, Instant since);

    <S extends MktStreamAlert> S save(S entity);
}
