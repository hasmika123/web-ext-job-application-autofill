package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktStreamSyncLog;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_stream_sync_log}: every method takes the organization id first. */
public interface MktStreamSyncLogRepository extends Repository<MktStreamSyncLog, Long> {
    long countByOrgId(Long orgId);

    /** Newest first; pass a page to cap the rows (the board reads the latest handful, the health window a few dozen). */
    List<MktStreamSyncLog> findByOrgIdOrderBySyncedAtDescIdDesc(Long orgId, Pageable page);

    List<MktStreamSyncLog> findByOrgIdAndSyncedAtGreaterThanEqualOrderBySyncedAtAsc(Long orgId, Instant since);

    List<MktStreamSyncLog> findByOrgIdAndStreamIdOrderBySyncedAtDescIdDesc(Long orgId, Long streamId, Pageable page);

    <S extends MktStreamSyncLog> S save(S entity);
}
