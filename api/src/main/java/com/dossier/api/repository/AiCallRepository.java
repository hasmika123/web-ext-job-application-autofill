package com.dossier.api.repository;

import com.dossier.api.domain.AiCall;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** The AI call ledger (Phase 13.1a). */
@Repository
public interface AiCallRepository extends JpaRepository<AiCall, Long> {
    List<AiCall> findByLoginOrderByCreatedAtDesc(String login);

    /** How many calls of these tasks a user made since {@code since} (Resume Builder daily cap and per-minute rate, R4.1). */
    @Query("select count(c) from AiCall c where c.login = :login and c.task in :tasks and c.createdAt >= :since and c.success = true")
    long countByLoginAndTaskInAndCreatedAtGreaterThanEqual(
        @Param("login") String login,
        @Param("tasks") Collection<String> tasks,
        @Param("since") Instant since
    );

    /** The newest ledger row of a user's task - what a proposal records as its provenance. */
    Optional<AiCall> findFirstByLoginAndTaskOrderByIdDesc(String login, String task);

    /** What a user's AI has cost since {@code since}, in millionths of a dollar — 13.1b's budget meter. */
    @Query("select coalesce(sum(c.costMicros), 0) from AiCall c where c.login = :login and c.createdAt >= :since and c.success = true")
    long costSince(@Param("login") String login, @Param("since") Instant since);

    /** Admin (13.1c): spend per user in [from, to), dearest first. A null login is deleted accounts. */
    @Query(
        "select new com.dossier.api.repository.AiSpendRow(c.login, count(c), coalesce(sum(c.costMicros), 0L)) " +
        "from AiCall c where c.createdAt >= :from and c.createdAt < :to and c.success = true group by c.login order by sum(c.costMicros) desc"
    )
    List<AiSpendRow> spendByLogin(@Param("from") Instant from, @Param("to") Instant to);

    /** Admin (13.1c): spend per task in [from, to), dearest first. */
    @Query(
        "select new com.dossier.api.repository.AiSpendRow(c.task, count(c), coalesce(sum(c.costMicros), 0L)) " +
        "from AiCall c where c.createdAt >= :from and c.createdAt < :to and c.success = true group by c.task order by sum(c.costMicros) desc"
    )
    List<AiSpendRow> spendByTask(@Param("from") Instant from, @Param("to") Instant to);

    /** The newest ledger row of a task on a provider - the admin page's "last test" of a provider is its newest {@code probe}. */
    Optional<AiCall> findFirstByTaskAndProviderOrderByIdDesc(String task, String provider);

    /**
     * Admin recent calls (I1.11), newest first. {@code task}/{@code provider} are blank for "any"; {@code before}
     * is a row id cursor ({@link Long#MAX_VALUE} for the first page); {@code failedOnly} keeps only failures.
     */
    @Query(
        "select c from AiCall c where c.createdAt >= :since and (:task = '' or c.task = :task) and (:provider = '' or c.provider = :provider) " +
        "and (:failedOnly = false or c.success = false) and c.id < :before order by c.id desc"
    )
    List<AiCall> recent(
        @Param("since") Instant since,
        @Param("task") String task,
        @Param("provider") String provider,
        @Param("failedOnly") boolean failedOnly,
        @Param("before") long before,
        Pageable page
    );

    /** Admin summary: calls, failures and successful cost since {@code since}, optionally for one task/provider. */
    @Query(
        "select new com.dossier.api.repository.AiCallStatRow$Totals(count(c), coalesce(sum(case when c.success = false then 1L else 0L end), 0L), coalesce(sum(c.costMicros), 0L)) " +
        "from AiCall c where c.createdAt >= :since and (:task = '' or c.task = :task) and (:provider = '' or c.provider = :provider)"
    )
    AiCallStatRow.Totals summarize(@Param("since") Instant since, @Param("task") String task, @Param("provider") String provider);

    /** Admin summary per provider. */
    @Query(
        "select new com.dossier.api.repository.AiCallStatRow$Group(c.provider, count(c), coalesce(sum(case when c.success = false then 1L else 0L end), 0L), coalesce(sum(c.costMicros), 0L)) " +
        "from AiCall c where c.createdAt >= :since and (:task = '' or c.task = :task) and (:provider = '' or c.provider = :provider) group by c.provider order by c.provider"
    )
    List<AiCallStatRow.Group> summarizeByProvider(@Param("since") Instant since, @Param("task") String task, @Param("provider") String provider);

    /** Latencies of calls that actually reached a provider (a refused call has 0), for a percentile. */
    @Query(
        "select new com.dossier.api.repository.AiCallStatRow$Latency(c.provider, c.latencyMs) from AiCall c " +
        "where c.createdAt >= :since and (:task = '' or c.task = :task) and (:provider = '' or c.provider = :provider) and c.latencyMs > 0"
    )
    List<AiCallStatRow.Latency> latencies(@Param("since") Instant since, @Param("task") String task, @Param("provider") String provider);

    /** Account deletion: keep the spend in the totals, drop the link to the person. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update AiCall c set c.login = null where c.login = :login")
    int anonymize(@Param("login") String login);
}
