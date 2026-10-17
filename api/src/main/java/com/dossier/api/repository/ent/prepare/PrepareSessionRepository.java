package com.dossier.api.repository.ent.prepare;

import com.dossier.api.domain.ent.prepare.PrepareSession;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org- and consultant-scoped access to {@code prepare_session}: every method names both, so another consultant's session is simply not found. */
public interface PrepareSessionRepository extends Repository<PrepareSession, Long> {

    <S extends PrepareSession> S save(S session);

    Optional<PrepareSession> findByOrgIdAndConsultantIdAndId(Long orgId, Long consultantId, Long id);

    /** The consultant's sessions that still accept events, newest first. */
    @Query("select s from PrepareSession s where s.orgId = :orgId and s.consultantId = :consultantId and s.expiresAt > :now order by s.createdAt desc, s.id desc")
    List<PrepareSession> findLive(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("now") Instant now);
}
