package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsNotificationPref;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_notification_pref}: every method takes the organization id first, then the consultant id. */
public interface CwsNotificationPrefRepository extends JpaRepository<CwsNotificationPref, Long> {
    List<CwsNotificationPref> findByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
