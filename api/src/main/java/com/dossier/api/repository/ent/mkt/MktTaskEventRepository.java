package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktTaskEvent;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_task_event}: every method takes the organization id first. */
public interface MktTaskEventRepository extends Repository<MktTaskEvent, Long> {

    long countByOrgId(Long orgId);

    List<MktTaskEvent> findByOrgIdAndTaskIdOrderByOccurredAtAsc(Long orgId, Long taskId);

    void deleteByOrgIdAndTaskId(Long orgId, Long taskId);

    <S extends MktTaskEvent> S save(S entity);
}
