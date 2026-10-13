package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Marketing-workspace access to {@code talent_application_event} (append-only timeline): every method takes the organization id first. */
public interface MktApplicationEventRepository extends JpaRepository<TalentApplicationEvent, Long> {
    List<TalentApplicationEvent> findByOrgIdAndApplicationIdIn(Long orgId, Collection<Long> applicationIds);
}
