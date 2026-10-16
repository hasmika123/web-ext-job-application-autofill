package com.dossier.api.web.rest.admin;

import com.dossier.api.service.catalog.CatalogException;
import java.net.URI;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Renders a {@link CatalogException} (a refused catalog operation) as an RFC 7807 problem: the status, a machine-readable {@code code} (clients
 * branch on it, never on the text) and the extra members the service attached (the plan keys of SERVICE_IN_LIVE_PLAN, the cycle of
 * DEPENDENCY_CYCLE, ...). Scoped to this package, so it adds nothing to the shared exception translator.
 */
@RestControllerAdvice(basePackageClasses = CatalogExceptionAdvice.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CatalogExceptionAdvice {

    @ExceptionHandler(CatalogException.class)
    public ResponseEntity<ProblemDetail> handle(CatalogException e) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(HttpStatus.valueOf(e.getStatus()), e.getMessage());
        p.setType(URI.create("https://www.jhipster.tech/problem/problem-with-message"));
        p.setTitle(e.getMessage());
        p.setProperty("code", e.getCode());
        p.setProperty("message", "error.catalog");
        e.getExtra().forEach(p::setProperty);
        return ResponseEntity.status(e.getStatus()).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(p);
    }
}
