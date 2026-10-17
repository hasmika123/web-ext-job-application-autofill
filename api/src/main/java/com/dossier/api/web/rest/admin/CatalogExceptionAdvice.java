package com.dossier.api.web.rest.admin;

import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.margin.MarginBelowFloorException;
import com.dossier.api.service.billing.margin.MarginCheck;
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

    /**
     * 422 MARGIN_BELOW_FLOOR (or TIER_BELOW_FLOOR / PRESET_BELOW_INDIVIDUAL): the worst row with its levers and the whole list of failing checks.
     * {@code overrideAllowed} tells the client whether a reason of 10 or more characters would let the publish through (it never does for discount rows).
     */
    @ExceptionHandler(MarginBelowFloorException.class)
    public ResponseEntity<ProblemDetail> handle(MarginBelowFloorException e) {
        MarginCheck first = e.first();
        String code = first != null ? first.code() : (e.presetFindings().isEmpty() ? "MARGIN_BELOW_FLOOR" : e.presetFindings().get(0).code());
        ProblemDetail p = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
        p.setType(URI.create("https://www.jhipster.tech/problem/problem-with-message"));
        p.setTitle(e.getMessage());
        p.setProperty("code", code);
        p.setProperty("message", "error.catalog");
        p.setProperty("overrideAllowed", e.overrideAllowed());
        p.setProperty("reasonMissing", e.reasonMissing());
        if (first != null) {
            p.setProperty("featureKey", first.featureKey());
            p.setProperty("interval", first.interval());
            p.setProperty("currency", first.currency());
            p.setProperty("marginBp", first.marginBp());
            p.setProperty("floorBp", first.floorBp());
            p.setProperty("levers", first.levers());
        }
        p.setProperty("checks", e.failures());
        p.setProperty("presetFindings", e.presetFindings());
        return ResponseEntity.unprocessableEntity().contentType(MediaType.APPLICATION_PROBLEM_JSON).body(p);
    }

    /** A Stripe step of a publish failed: nothing was committed. 503 BILLING_DISABLED when Stripe is switched off, 502 STRIPE_ERROR otherwise. */
    @ExceptionHandler(StripeGatewayException.class)
    public ResponseEntity<ProblemDetail> handle(StripeGatewayException e) {
        boolean off = e.getKind() == StripeGatewayException.Kind.NOT_ENABLED;
        HttpStatus status = off ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
        ProblemDetail p = ProblemDetail.forStatusAndDetail(status, e.getMessage());
        p.setType(URI.create("https://www.jhipster.tech/problem/problem-with-message"));
        p.setTitle(e.getMessage());
        p.setProperty("code", off ? "BILLING_DISABLED" : "STRIPE_ERROR");
        p.setProperty("message", "error.catalog");
        p.setProperty("retryable", e.isRetryable());
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(p);
    }
}
