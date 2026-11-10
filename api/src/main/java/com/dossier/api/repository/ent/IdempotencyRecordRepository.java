package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.IdempotencyRecord;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The Idempotency-Key ledger (40-api-specs.md section 6). Every method names the organization first. */
public interface IdempotencyRecordRepository extends Repository<IdempotencyRecord, Long> {
    <S extends IdempotencyRecord> S saveAndFlush(S row);

    @Query("select r from IdempotencyRecord r where r.orgId = :orgId and r.actorLogin = :actorLogin and r.keyHash = :keyHash")
    Optional<IdempotencyRecord> findByOrgIdAndActorLoginAndKeyHash(@Param("orgId") Long orgId, @Param("actorLogin") String actorLogin, @Param("keyHash") String keyHash);
}
