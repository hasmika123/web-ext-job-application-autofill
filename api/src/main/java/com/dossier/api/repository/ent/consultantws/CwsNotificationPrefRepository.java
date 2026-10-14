package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsNotificationPref;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_notification_pref}: every method takes the organization id first, then the consultant id. */
public interface CwsNotificationPrefRepository extends Repository<CwsNotificationPref, Long> {
    <S extends CwsNotificationPref> S save(S entity);

    <S extends CwsNotificationPref> S saveAndFlush(S entity);

    void flush();

    <S extends CwsNotificationPref> List<S> saveAll(Iterable<S> entities);

    void delete(CwsNotificationPref entity);

    List<CwsNotificationPref> findByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
