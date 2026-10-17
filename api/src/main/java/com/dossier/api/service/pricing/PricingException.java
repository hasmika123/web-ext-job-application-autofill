package com.dossier.api.service.pricing;

import java.util.Map;

/** A business refusal from the pricing code. {@code code} is the stable API code (PRICE_MISSING, QUANTITY_LIMIT, ...). */
public class PricingException extends RuntimeException {

    private final String code;
    private final transient Map<String, Object> details;

    public PricingException(String code, String message, Map<String, Object> details) {
        super(code + ": " + message);
        this.code = code;
        this.details = details == null ? Map.of() : Map.copyOf(details);
    }

    public PricingException(String code, String message) {
        this(code, message, Map.of());
    }

    public String code() {
        return code;
    }

    public Map<String, Object> details() {
        return details;
    }
}
