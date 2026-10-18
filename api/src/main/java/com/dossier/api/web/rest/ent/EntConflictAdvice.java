package com.dossier.api.web.rest.ent;

import com.dossier.api.service.org.OrgException;
import com.dossier.api.web.rest.errors.ExceptionTranslator;
import java.sql.SQLException;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.NativeWebRequest;

/**
 * The safety net behind the marketer and consultant job endpoints (doc 60 section 2): a unique key that two concurrent requests both tried to
 * take, or a row someone else saved first, is a 409 the client can act on, never a 500.
 *
 * <ul>
 *   <li>{@link DataIntegrityViolationException} to 409 {@code CONFLICT} ("that was just created or changed by someone else, reload and retry") ONLY when it
 *       is one of the unique keys that two concurrent requests can race for ({@link #RACE_KEYS}); any other violation (a null, a too-long value, a missing
 *       parent) is a bug or bad input and keeps the API's usual mapping.</li>
 *   <li>{@link ObjectOptimisticLockingFailureException} ({@code @Version}) to 409 {@code VERSION_CONFLICT}.</li>
 * </ul>
 *
 * Limited to the {@code mkt} and {@code consultant} controllers so the rest of the API keeps its existing error mapping. Services never rely on this alone:
 * they find-or-create with a re-read ({@code JobIdentityService}, {@code OpportunityAssignmentService}); this only catches what slips through.
 * The body is the usual problem document, produced by {@link ExceptionTranslator} from an {@link OrgException}, so clients branch on {@code code}.
 */
@RestControllerAdvice(basePackages = { "com.dossier.api.web.rest.ent.mkt", "com.dossier.api.web.rest.ent.consultant" })
@Order(Ordered.HIGHEST_PRECEDENCE)
public class EntConflictAdvice {

    private static final Logger LOG = LoggerFactory.getLogger(EntConflictAdvice.class);

    public static final String CODE_CONFLICT = "CONFLICT";
    public static final String CODE_VERSION_CONFLICT = "VERSION_CONFLICT";

    /** The unique keys the find-or-create code races on (docs/enterprise-v2/60 section 2): a lost race on any of these is the client's cue to retry. */
    public static final Set<String> RACE_KEYS = Set.of(
        "uk_client_account_name", "uk_req_url", "uk_req_ext", "uk_requirement_match_pair", "uk_mkt_opportunity_match", "uk_pal_live", "uk_idempotency_actor_key"
    );

    private final ExceptionTranslator translator;

    public EntConflictAdvice(ExceptionTranslator translator) {
        this.translator = translator;
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Object> conflict(DataIntegrityViolationException ex, NativeWebRequest request) {
        if (!isRaceOnKnownKey(ex)) {
            // not one of ours: the same answer the rest of the API gives
            return translator.handleAnyException(ex, request);
        }
        LOG.warn("Unique or foreign key conflict on {}: {}", request.getDescription(false), ex.getMostSpecificCause().getMessage());
        return translator.handleAnyException(
            OrgException.coded(409, CODE_CONFLICT, "This was just created or changed by someone else. Reload and try again.", Map.of()),
            request
        );
    }

    /**
     * True for a duplicate-key error (MySQL error 1062 / SQLState 23000, or the word "duplicate"/"unique" in the message) that names one of {@link #RACE_KEYS}.
     * MySQL writes the key as {@code 'uk_req_url'} or, since 8.0.19, {@code 'client_requirement.uk_req_url'}; both contain the key name.
     */
    static boolean isRaceOnKnownKey(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause() == t ? null : t.getCause()) {
            String msg = t.getMessage();
            if (msg == null) continue;
            String lower = msg.toLowerCase(Locale.ROOT);
            boolean duplicate = lower.contains("duplicate") || lower.contains("unique");
            if (t instanceof SQLException sql) duplicate = duplicate || sql.getErrorCode() == 1062 || "23000".equals(sql.getSQLState()) || "23505".equals(sql.getSQLState());
            if (!duplicate) continue;
            for (String key : RACE_KEYS) if (lower.contains(key)) return true;
        }
        return false;
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<Object> versionConflict(ObjectOptimisticLockingFailureException ex, NativeWebRequest request) {
        LOG.debug("Version conflict on {}: {}", request.getDescription(false), ex.getMessage());
        return translator.handleAnyException(
            OrgException.coded(409, CODE_VERSION_CONFLICT, "This was changed by someone else. Reload and try again.", Map.of()),
            request
        );
    }
}
