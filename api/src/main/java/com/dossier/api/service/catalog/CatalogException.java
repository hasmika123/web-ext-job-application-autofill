package com.dossier.api.service.catalog;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A catalog operation the server refused, with a machine-readable code (docs/subscriptions/09-apis.md): clients branch on {@link #getCode()},
 * never on the message. The service-layer twin of the problem body {@code web.rest.admin.CatalogExceptionAdvice} renders (the service layer may
 * not depend on the web layer).
 *
 * <p>422 codes: KEY_FORMAT, ALLOWANCE_REQUIRED, INVALID_VALUE, NAME_REQUIRED, KEY_IMMUTABLE, REASON_REQUIRED, DEPENDENCY_CYCLE, INTERVAL_NOT_ENABLED,
 * INTERVAL_NOT_OFFERED, CURRENCY_NOT_OFFERED, ORG_QUARTER_REFUSED. 409 codes: KEY_EXISTS, SERVICE_IN_LIVE_PLAN, SERVICE_RETIRED, PRICE_ACTIVE_EXISTS,
 * PRICE_LAST_IN_LIVE_PLAN, PRICE_STATE. 404: NOT_FOUND.
 */
public class CatalogException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    /** The shortest reason a HIGH-risk catalog write may carry (same minimum as the settings registry). */
    public static final int REASON_MIN_LENGTH = 10;

    private final int status;
    private final String code;
    private final transient Map<String, Object> extra;

    public CatalogException(int status, String code, String message, Map<String, Object> extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra == null ? Map.of() : new LinkedHashMap<>(extra);
    }

    public static CatalogException unprocessable(String code, String message, Map<String, Object> extra) {
        return new CatalogException(422, code, message, extra);
    }

    public static CatalogException unprocessable(String code, String message) {
        return new CatalogException(422, code, message, null);
    }

    public static CatalogException conflict(String code, String message, Map<String, Object> extra) {
        return new CatalogException(409, code, message, extra);
    }

    public static CatalogException notFound(String what, String id) {
        return new CatalogException(404, "NOT_FOUND", what + " " + id + " does not exist.", Map.of("entity", what, "id", id));
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    /** Extra properties for the response body. */
    public Map<String, Object> getExtra() {
        return extra;
    }
}
