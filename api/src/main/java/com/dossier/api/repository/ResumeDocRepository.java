package com.dossier.api.repository;

import com.dossier.api.domain.ResumeDoc;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Resume Builder documents (R0.1). Keyed by resume id; always read with the owning user's id. */
@Repository
public interface ResumeDocRepository extends JpaRepository<ResumeDoc, Long> {
    Optional<ResumeDoc> findByResumeIdAndUserId(Long resumeId, Long userId);

    List<ResumeDoc> findByUserId(Long userId);

    /**
     * Just the list-view columns per document (template + export state + PDF job state) - the list
     * views must not load every doc_json. {@code themeJson} (a few hundred bytes, 8 KB at most) is what
     * the render hash needs to tell a stale PDF from a current one.
     */
    @Query(
        "select d.resumeId as resumeId, d.templateId as templateId, d.contentHash as contentHash, " +
        "d.exportedHash as exportedHash, d.exportedAt as exportedAt, d.themeJson as themeJson, " +
        "d.pdfStatus as pdfStatus, d.pdfAttempts as pdfAttempts, d.pdfError as pdfError from ResumeDoc d where d.user.id = :userId"
    )
    List<BuiltMetaRow> findBuiltMetaByUserId(@Param("userId") Long userId);

    interface BuiltMetaRow {
        Long getResumeId();

        String getTemplateId();

        String getContentHash();

        String getExportedHash();

        java.time.Instant getExportedAt();

        String getThemeJson();

        String getPdfStatus();

        int getPdfAttempts();

        String getPdfError();
    }

    /** What the PDF pipeline needs of a row to judge it, without loading {@code doc_json}. */
    @Query(
        "select d.resumeId as resumeId, d.user.id as userId, d.templateId as templateId, d.contentHash as contentHash, " +
        "d.themeJson as themeJson, d.docVersion as docVersion, d.exportedHash as exportedHash, d.exportedAt as exportedAt, " +
        "d.pdfStatus as pdfStatus, d.pdfAttempts as pdfAttempts, d.pdfError as pdfError, d.pdfWorker as pdfWorker, " +
        "d.pdfRequestedAt as pdfRequestedAt, d.resume.label as label, d.resume.r2ObjectKey as r2ObjectKey from ResumeDoc d where d.resumeId in :ids"
    )
    List<PdfJobRow> findPdfJobRows(@Param("ids") Collection<Long> ids);

    interface PdfJobRow {
        Long getResumeId();

        Long getUserId();

        String getTemplateId();

        String getContentHash();

        String getThemeJson();

        int getDocVersion();

        String getExportedHash();

        Instant getExportedAt();

        String getPdfStatus();

        int getPdfAttempts();

        String getPdfError();

        String getPdfWorker();

        Instant getPdfRequestedAt();

        String getLabel();

        String getR2ObjectKey();
    }

    /**
     * Stamp an export without touching {@code @Version}: a bulk update does not bump it, which is the
     * point (an export must not make an open editor's {@code If-Match} stale). Callers check ownership first.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ResumeDoc d set d.exportedAt = :at, d.exportedHash = :hash where d.resumeId = :resumeId")
    int recordExport(@Param("resumeId") Long resumeId, @Param("hash") String hash, @Param("at") java.time.Instant at);

    /** The documents derived from a master (tailored copies and the like), by the master's resume id. */
    List<ResumeDoc> findByUserIdAndParentResumeId(Long userId, Long parentResumeId);

    /** How many tailored resumes hang off this master. */
    @Query(
        "select count(d) from ResumeDoc d where d.user.id = :userId and d.parentResumeId = :parentId " +
        "and d.resume.role = com.dossier.api.domain.enumeration.ResumeRole.TAILORED"
    )
    long countTailoredChildren(@Param("userId") Long userId, @Param("parentId") Long parentId);

    /**
     * Rewrite the stored document and its hash after the server mirrored the resume's name or target into
     * {@code meta} (R3.9). A bulk update on purpose: it must not tick {@code @Version}, or an open editor's
     * next autosave would 409 after a rename in the header. If the stored PDF matched the old RENDER hash
     * (R3.7: {@code sha256(content|template|theme)}) it still matches (the name is not rendered), so
     * {@code exported_hash} follows to the new render hash and no re-render is queued.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        "update ResumeDoc d set d.docJson = :docJson, d.contentHash = :hash, d.updatedAt = :at, " +
        "d.exportedHash = case when d.exportedHash = :oldRenderHash then :newRenderHash else d.exportedHash end where d.resumeId = :resumeId"
    )
    int mirrorMeta(
        @Param("resumeId") Long resumeId,
        @Param("docJson") String docJson,
        @Param("hash") String hash,
        @Param("oldRenderHash") String oldRenderHash,
        @Param("newRenderHash") String newRenderHash,
        @Param("at") java.time.Instant at
    );

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeDoc d where d.user.id = :userId")
    int deleteAllByUserId(@Param("userId") Long userId);

    // ---- the PDF job queue (R3.7). Every write below is a bulk update: a job-state change must never
    //      bump @Version, or the editor's next autosave would 409 because a worker touched the row. ----

    /**
     * Locks up to {@code limit} claimable rows - PENDING and due, or RUNNING with an expired lease - oldest
     * request first, skipping rows another worker has locked ({@code FOR UPDATE SKIP LOCKED}). Must run
     * inside the claiming transaction.
     */
    @Query(
        value = "select resume_id from resume_doc where pdf_next_attempt_at <= :now and " +
        "(pdf_status = 'PENDING' or (pdf_status = 'RUNNING' and pdf_lease_until < :now)) " +
        "order by pdf_requested_at limit :limit for update skip locked",
        nativeQuery = true
    )
    List<Long> lockClaimable(@Param("now") Instant now, @Param("limit") int limit);

    /** Leases the locked rows to {@code worker}; a row reclaimed from an expired lease counts that as an attempt. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        "update ResumeDoc d set d.pdfAttempts = case when d.pdfStatus = 'RUNNING' then d.pdfAttempts + 1 else d.pdfAttempts end, " +
        "d.pdfStatus = 'RUNNING', d.pdfWorker = :worker, d.pdfLeaseUntil = :leaseUntil where d.resumeId in :ids"
    )
    int markRunning(@Param("ids") Collection<Long> ids, @Param("worker") String worker, @Param("leaseUntil") Instant leaseUntil);

    /** A lease that expired on its last allowed attempt: the worker is gone for good, stop retrying. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        "update ResumeDoc d set d.pdfStatus = 'FAILED', d.pdfError = :error, d.pdfLeaseUntil = null, d.pdfWorker = null " +
        "where d.pdfStatus = 'RUNNING' and d.pdfLeaseUntil < :now and d.pdfAttempts + 1 >= :maxAttempts"
    )
    int failExpiredLeases(@Param("now") Instant now, @Param("maxAttempts") int maxAttempts, @Param("error") String error);

    /**
     * The stored PDF is the current render: READY. The {@code docVersion} predicate makes it atomic with
     * respect to a concurrent save (a save bumps the version, so this then matches nothing and the file is
     * discarded as stale).
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        "update ResumeDoc d set d.exportedAt = :at, d.exportedHash = :hash, d.pdfStatus = 'READY', d.pdfAttempts = 0, d.pdfError = null, " +
        "d.pdfLeaseUntil = null, d.pdfWorker = null where d.resumeId = :resumeId and d.docVersion = :version"
    )
    int markReady(@Param("resumeId") Long resumeId, @Param("version") int version, @Param("hash") String hash, @Param("at") Instant at);

    /** A synchronous export just stored the current render: the row is READY and nothing is left to do. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        "update ResumeDoc d set d.pdfStatus = 'READY', d.pdfAttempts = 0, d.pdfError = null, d.pdfLeaseUntil = null, d.pdfWorker = null " +
        "where d.resumeId = :resumeId"
    )
    int markReadyNow(@Param("resumeId") Long resumeId);

    /**
     * Records the outcome of a failed attempt (back to PENDING with a later attempt, or FAILED), only while
     * the row is still RUNNING and leased to {@code worker} (an empty {@code worker} matches any): a newer save that re-queued the row, or a
     * reclaim by someone else, makes a late report a no-op.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        "update ResumeDoc d set d.pdfStatus = :status, d.pdfNextAttemptAt = :next, d.pdfAttempts = :attempts, d.pdfError = :error, " +
        "d.pdfLeaseUntil = null, d.pdfWorker = null where d.resumeId = :resumeId and d.pdfStatus = 'RUNNING' " +
        "and (:worker = '' or d.pdfWorker = :worker)"
    )
    int reschedule(
        @Param("resumeId") Long resumeId,
        @Param("worker") String worker,
        @Param("status") String status,
        @Param("next") Instant next,
        @Param("attempts") int attempts,
        @Param("error") String error
    );

    /**
     * "Do it now" (leaving the editor, Retry, a checkpoint): queue the row immediately if its stored PDF is not
     * the current render. A row that is RUNNING is left alone - its result is applied if it is still current.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        "update ResumeDoc d set d.pdfStatus = 'PENDING', d.pdfRequestedAt = :now, d.pdfNextAttemptAt = :now, d.pdfAttempts = 0, " +
        "d.pdfError = null, d.pdfLeaseUntil = null, d.pdfWorker = null " +
        "where d.resumeId = :resumeId and d.pdfStatus <> 'RUNNING' and (d.exportedHash is null or d.exportedHash <> :renderHash)"
    )
    int requestNow(@Param("resumeId") Long resumeId, @Param("renderHash") String renderHash, @Param("now") Instant now);

    @Query("select count(d) from ResumeDoc d where d.pdfStatus = :status")
    long countByPdfStatus(@Param("status") String status);

    @Query("select min(d.pdfRequestedAt) from ResumeDoc d where d.pdfStatus = 'PENDING'")
    Instant oldestPendingRequestedAt();
}
