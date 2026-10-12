package com.dossier.api.service.org;

import java.util.Map;

/**
 * An organization operation the server refused, with a machine-readable code. Service-layer twin of
 * {@code web.rest.errors.OrgProblemException} (the service layer may not depend on the web layer, so
 * {@code ExceptionTranslator} renders it). Clients branch on {@link #getCode()}, never on the message.
 *
 * <ul>
 *   <li>{@code NOT_FOUND} (404) - see {@link OrgNotFoundException}; deliberately says nothing about why.</li>
 *   <li>{@code RESERVED_VALUE} (422) - a reserved enum value (COACH) was submitted.</li>
 *   <li>{@code ORG_INVALID} (422) - a field failed validation; {@code field} names it.</li>
 *   <li>{@code SLUG_TAKEN} (409) - carries a {@code suggestion}.</li>
 *   <li>{@code GROUP_NAME_TAKEN} (409), {@code ORG_NOT_EDITABLE} (409) - state conflicts.</li>
 * </ul>
 */
public class OrgException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_NOT_FOUND = "NOT_FOUND";
    public static final String CODE_RESERVED_VALUE = "RESERVED_VALUE";
    public static final String CODE_ORG_INVALID = "ORG_INVALID";
    public static final String CODE_SLUG_TAKEN = "SLUG_TAKEN";
    public static final String CODE_GROUP_NAME_TAKEN = "GROUP_NAME_TAKEN";
    public static final String CODE_ORG_NOT_EDITABLE = "ORG_NOT_EDITABLE";

    private final int status;
    private final String code;
    private final transient Map<String, Object> extra;

    public OrgException(int status, String code, String message, Map<String, Object> extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra == null ? Map.of() : Map.copyOf(extra);
    }

    /** A value the product does not accept yet (tenant-model.md decision 10). */
    public static OrgException reserved(String field, String value) {
        return new OrgException(422, CODE_RESERVED_VALUE, value + " is reserved and cannot be used yet", Map.of("field", field));
    }

    public static OrgException invalid(String field, String message) {
        return new OrgException(422, CODE_ORG_INVALID, field + ": " + message, Map.of("field", field, "message", message));
    }

    public static OrgException slugTaken(String slug, String suggestion) {
        return new OrgException(409, CODE_SLUG_TAKEN, "The address '" + slug + "' is taken", Map.of("slug", slug, "suggestion", suggestion));
    }

    public static OrgException groupNameTaken(String name) {
        return new OrgException(409, CODE_GROUP_NAME_TAKEN, "A group named '" + name + "' already exists", Map.of("name", name));
    }

    public static OrgException notEditable(String message) {
        return new OrgException(409, CODE_ORG_NOT_EDITABLE, message, Map.of());
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public Map<String, Object> getExtra() {
        return extra;
    }
}
