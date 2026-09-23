package com.dossier.api.repository;

import com.dossier.api.domain.AiCall;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** The AI call ledger (Phase 13.1a). */
@Repository
public interface AiCallRepository extends JpaRepository<AiCall, Long> {
    List<AiCall> findByLoginOrderByCreatedAtDesc(String login);

    /** What a user's AI has cost since {@code since}, in millionths of a dollar — 13.1b's budget meter. */
    @Query("select coalesce(sum(c.costMicros), 0) from AiCall c where c.login = :login and c.createdAt >= :since")
    long costSince(@Param("login") String login, @Param("since") Instant since);

    /** Admin (13.1c): spend per user in [from, to), dearest first. A null login is deleted accounts. */
    @Query(
        "select new com.dossier.api.repository.AiSpendRow(c.login, count(c), coalesce(sum(c.costMicros), 0L)) " +
        "from AiCall c where c.createdAt >= :from and c.createdAt < :to group by c.login order by sum(c.costMicros) desc"
    )
    List<AiSpendRow> spendByLogin(@Param("from") Instant from, @Param("to") Instant to);

    /** Admin (13.1c): spend per task in [from, to), dearest first. */
    @Query(
        "select new com.dossier.api.repository.AiSpendRow(c.task, count(c), coalesce(sum(c.costMicros), 0L)) " +
        "from AiCall c where c.createdAt >= :from and c.createdAt < :to group by c.task order by sum(c.costMicros) desc"
    )
    List<AiSpendRow> spendByTask(@Param("from") Instant from, @Param("to") Instant to);

    /** Account deletion: keep the spend in the totals, drop the link to the person. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update AiCall c set c.login = null where c.login = :login")
    int anonymize(@Param("login") String login);
}
