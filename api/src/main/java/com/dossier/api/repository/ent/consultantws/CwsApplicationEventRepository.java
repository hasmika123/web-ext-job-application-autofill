package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Consultant-workspace read access to {@code talent_application_event}: every method takes the organization id first. */
public interface CwsApplicationEventRepository extends Repository<TalentApplicationEvent, Long> {
    <S extends TalentApplicationEvent> S save(S entity);

    <S extends TalentApplicationEvent> S saveAndFlush(S entity);

    List<TalentApplicationEvent> findByOrgIdAndApplicationIdInOrderByOccurredAtAsc(Long orgId, Collection<Long> applicationIds);

    List<TalentApplicationEvent> findByOrgIdAndApplicationIdOrderByOccurredAtAsc(Long orgId, Long applicationId);
}
