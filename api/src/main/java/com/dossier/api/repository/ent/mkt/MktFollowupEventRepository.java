package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktFollowupEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code mkt_followup_event}: every method takes the organization id first. */
public interface MktFollowupEventRepository extends JpaRepository<MktFollowupEvent, Long> {

    long countByOrgId(Long orgId);

    List<MktFollowupEvent> findByOrgIdAndFollowupIdOrderByOccurredAtAsc(Long orgId, Long followupId);

    List<MktFollowupEvent> findByOrgIdAndFollowupIdIn(Long orgId, Collection<Long> followupIds);
}
