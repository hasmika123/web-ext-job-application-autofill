package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Consultant-workspace read access to {@code talent_application_event}: every method takes the organization id first. */
public interface CwsApplicationEventRepository extends JpaRepository<TalentApplicationEvent, Long> {
    List<TalentApplicationEvent> findByOrgIdAndApplicationIdInOrderByOccurredAtAsc(Long orgId, Collection<Long> applicationIds);

    List<TalentApplicationEvent> findByOrgIdAndApplicationIdOrderByOccurredAtAsc(Long orgId, Long applicationId);
}
