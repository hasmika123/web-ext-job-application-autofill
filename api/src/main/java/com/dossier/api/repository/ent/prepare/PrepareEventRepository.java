package com.dossier.api.repository.ent.prepare;

import com.dossier.api.domain.ent.prepare.PrepareEvent;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Append-only access to {@code prepare_event}: there is no update and no delete here on purpose. */
public interface PrepareEventRepository extends Repository<PrepareEvent, Long> {

    <S extends PrepareEvent> S save(S event);

    List<PrepareEvent> findByOrgIdAndSessionIdOrderByIdAsc(Long orgId, Long sessionId);
}
