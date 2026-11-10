package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktFollowupEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_followup_event}: every method takes the organization id first. */
public interface MktFollowupEventRepository extends Repository<MktFollowupEvent, Long> {

    long countByOrgId(Long orgId);

    List<MktFollowupEvent> findByOrgIdAndFollowupIdOrderByOccurredAtAsc(Long orgId, Long followupId);

    List<MktFollowupEvent> findByOrgIdAndFollowupIdIn(Long orgId, Collection<Long> followupIds);

    <S extends MktFollowupEvent> S save(S entity);
}
