package com.dossier.api.repository.ent.mgmt;

import com.dossier.api.domain.ent.mgmt.MktEscalationEvent;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code mkt_escalation_event}, the append-only trail of an escalation: every method takes the organization id first. */
public interface MktEscalationEventRepository extends Repository<MktEscalationEvent, Long> {

    <S extends MktEscalationEvent> S save(S entity);

    List<MktEscalationEvent> findByOrgIdAndEscalationIdOrderByOccurredAtAscIdAsc(Long orgId, Long escalationId);

    long countByOrgIdAndEscalationId(Long orgId, Long escalationId);
}
