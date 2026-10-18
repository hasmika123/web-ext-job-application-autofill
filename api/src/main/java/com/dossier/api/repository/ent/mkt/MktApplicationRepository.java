package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentApplication;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Marketing-workspace access to {@code talent_application}: every method takes the organization id first. Own interface so the talent repositories stay untouched. */
public interface MktApplicationRepository extends Repository<TalentApplication, Long> {
    Optional<TalentApplication> findByOrgIdAndId(Long orgId, Long id);

    List<TalentApplication> findByOrgId(Long orgId);

    List<TalentApplication> findByOrgIdAndConsultantIdIn(Long orgId, Collection<Long> consultantIds);

    <S extends TalentApplication> S save(S entity);
}
