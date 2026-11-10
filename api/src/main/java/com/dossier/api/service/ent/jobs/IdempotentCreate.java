package com.dossier.api.service.ent.jobs;

import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.IdempotencyService.Outcome;
import com.dossier.api.service.org.OrgMembership;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/**
 * {@code Idempotency-Key} for create-type endpoints, the way the job endpoints need it (doc 60 section 4): the header is REQUIRED (400
 * {@code IDEMPOTENCY_KEY_MISSING}), the same key with the same request replays the first reply instead of creating twice, the same key with a
 * different request is 422 {@code IDEMPOTENCY_KEY_REUSED}. A thin wrapper so each endpoint states its method, path, body and success status once and
 * cannot forget {@code required}; the ledger, the hashing and the 24 hour expiry stay in {@link IdempotencyService}.
 *
 * <p>A controller sends {@link #REPLAYED_HEADER}{@code : true} when {@link Outcome#replayed()} is set, so a client can tell a retry from a first
 * run. Not wired into any existing endpoint.
 */
@Component
public class IdempotentCreate {

    /** The request header carrying the client's key (a UUID). */
    public static final String HEADER = "Idempotency-Key";
    /** Response header set to {@code true} on a replay. */
    public static final String REPLAYED_HEADER = "Idempotent-Replayed";

    private final IdempotencyService idempotency;

    public IdempotentCreate(IdempotencyService idempotency) {
        this.idempotency = idempotency;
    }

    /** Runs {@code work} once per (caller, key) and answers 200 on success. */
    public <T> Outcome<T> run(OrgMembership me, String idempotencyKey, String path, Object request, Class<T> responseType, Supplier<T> work) {
        return run(me, idempotencyKey, path, request, 200, responseType, work);
    }

    /** {@link #run(OrgMembership, String, String, Object, Class, Supplier)} with the success status of your choice (201 for a pure create). */
    public <T> Outcome<T> run(OrgMembership me, String idempotencyKey, String path, Object request, int successStatus, Class<T> responseType, Supplier<T> work) {
        return idempotency.execute(me, idempotencyKey, true, "POST", path, request, successStatus, responseType, work);
    }
}
