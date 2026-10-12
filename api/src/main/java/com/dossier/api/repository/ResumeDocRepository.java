package com.dossier.api.repository;

import com.dossier.api.domain.ResumeDoc;
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
     * Just the list-view columns per document (template + export state) - the list views must not
     * load every doc_json.
     */
    @Query(
        "select d.resumeId as resumeId, d.templateId as templateId, d.contentHash as contentHash, " +
        "d.exportedHash as exportedHash, d.exportedAt as exportedAt, d.score as score from ResumeDoc d where d.user.id = :userId"
    )
    List<BuiltMetaRow> findBuiltMetaByUserId(@Param("userId") Long userId);

    interface BuiltMetaRow {
        Long getResumeId();

        String getTemplateId();

        String getContentHash();

        String getExportedHash();

        java.time.Instant getExportedAt();

        Integer getScore();
    }

    /**
     * Stamp an export without touching {@code @Version}: a bulk update does not bump it, which is the
     * point (an export must not make an open editor's {@code If-Match} stale). Callers check ownership first.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ResumeDoc d set d.exportedAt = :at, d.exportedHash = :hash where d.resumeId = :resumeId")
    int recordExport(@Param("resumeId") Long resumeId, @Param("hash") String hash, @Param("at") java.time.Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ResumeDoc d where d.user.id = :userId")
    int deleteAllByUserId(@Param("userId") Long userId);
}
