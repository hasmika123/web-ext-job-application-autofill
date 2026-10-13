package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktStreamAlert;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code mkt_stream_alert}: every method takes the organization id first. */
public interface MktStreamAlertRepository extends JpaRepository<MktStreamAlert, Long> {
    long countByOrgId(Long orgId);

    List<MktStreamAlert> findByOrgIdAndResolvedAtIsNullOrderByRaisedAtDesc(Long orgId, Pageable page);

    List<MktStreamAlert> findByOrgIdAndRaisedAtGreaterThanEqualOrderByRaisedAtAsc(Long orgId, Instant since);
}
