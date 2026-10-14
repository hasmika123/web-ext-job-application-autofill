package com.dossier.api.web.rest.ent;

import com.dossier.api.service.org.OrgException;
import com.dossier.api.web.rest.errors.ExceptionTranslator;
import java.util.Map;
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
 *   <li>{@link DataIntegrityViolationException} to 409 {@code CONFLICT} ("that was just created or changed by someone else, reload and retry").</li>
 *   <li>{@link ObjectOptimisticLockingFailureException} ({@code @Version}) to 409 {@code VERSION_CONFLICT}.</li>
 * </ul>
 *
 * Limited to the {@code mkt} and {@code con} controllers so the rest of the API keeps its existing error mapping. Services never rely on this alone:
 * they find-or-create with a re-read ({@code JobIdentityService}, {@code OpportunityAssignmentService}); this only catches what slips through.
 * The body is the usual problem document, produced by {@link ExceptionTranslator} from an {@link OrgException}, so clients branch on {@code code}.
 */
@RestControllerAdvice(basePackages = { "com.dossier.api.web.rest.ent.mkt", "com.dossier.api.web.rest.ent.con" })
@Order(Ordered.HIGHEST_PRECEDENCE)
public class EntConflictAdvice {

    private static final Logger LOG = LoggerFactory.getLogger(EntConflictAdvice.class);

    public static final String CODE_CONFLICT = "CONFLICT";
    public static final String CODE_VERSION_CONFLICT = "VERSION_CONFLICT";

    private final ExceptionTranslator translator;

    public EntConflictAdvice(ExceptionTranslator translator) {
        this.translator = translator;
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Object> conflict(DataIntegrityViolationException ex, NativeWebRequest request) {
        LOG.warn("Unique or foreign key conflict on {}: {}", request.getDescription(false), ex.getMostSpecificCause().getMessage());
        return translator.handleAnyException(
            OrgException.coded(409, CODE_CONFLICT, "This was just created or changed by someone else. Reload and try again.", Map.of()),
            request
        );
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
