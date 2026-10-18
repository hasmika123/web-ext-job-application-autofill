package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.service.org.ShareField;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * What an org may see of one member, generated from {@link ShareField} (consent-data-sharing.md sections 3 and 4): the
 * scope the member chose and exactly the fields that scope shows, keyed by the field's name. A field the scope hides is
 * absent from {@code fields}; one it shows but has no value for is present and null.
 */
public record MemberSummaryDTO(ShareScope shareScope, Map<String, Object> fields) {
    /** Projects {@code values} through the matrix at {@code scope}. */
    public static MemberSummaryDTO of(ShareScope scope, Map<ShareField, ?> values) {
        Map<String, Object> out = new LinkedHashMap<>();
        ShareField.project(scope, values).forEach((field, value) -> out.put(field.name(), value));
        return new MemberSummaryDTO(scope, out);
    }
}
