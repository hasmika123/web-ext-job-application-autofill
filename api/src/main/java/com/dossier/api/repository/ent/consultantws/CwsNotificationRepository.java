package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsNotification;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_notification}: every method takes the organization id first, then the consultant id. */
public interface CwsNotificationRepository extends JpaRepository<CwsNotification, Long> {
    /** Every row of the consultant, deleted ones included (they are the tombstones that stop a source event from coming back). */
    List<CwsNotification> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    List<CwsNotification> findByOrgIdAndConsultantIdAndIdIn(Long orgId, Long consultantId, Collection<Long> ids);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
