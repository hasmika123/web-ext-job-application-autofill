package com.dossier.api.repository.org;

import com.dossier.api.domain.org.DataShareEvent;
import java.util.List;
import org.springframework.data.repository.Repository;

/**
 * Append-only history of sharing changes (consent-data-sharing.md section 2): {@code save} and reads, nothing else.
 * There is deliberately no delete and no update, and no {@code JpaRepository} to inherit one from.
 */
public interface DataShareEventRepository extends Repository<DataShareEvent, Long> {
    <S extends DataShareEvent> S save(S event);

    List<DataShareEvent> findByOrgIdAndMemberLoginOrderByIdAsc(Long orgId, String memberLogin);

    long countByOrgId(Long orgId);
}
