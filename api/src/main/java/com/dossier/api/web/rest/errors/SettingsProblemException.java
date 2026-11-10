package com.dossier.api.web.rest.errors;

import com.dossier.api.service.settings.SettingsException;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import tech.jhipster.web.rest.errors.ProblemDetailWithCause.ProblemDetailWithCauseBuilder;

/**
 * Web-layer rendering of a {@link SettingsException} (generic admin settings, A5.1): status, {@code code} and the
 * extra properties (bounds, allowed values, minimum reason length) come straight from the service exception. The
 * title and {@code detail} are the human-readable message the admin page shows inline.
 */
@SuppressWarnings("java:S110") // Inheritance tree of classes should not be too deep
public class SettingsProblemException extends ErrorResponseException {

    private static final long serialVersionUID = 1L;

    public SettingsProblemException(SettingsException cause) {
        super(HttpStatus.valueOf(cause.getStatus()), build(cause), cause);
    }

    private static org.springframework.http.ProblemDetail build(SettingsException cause) {
        var builder = ProblemDetailWithCauseBuilder.instance()
            .withStatus(cause.getStatus())
            .withType(ErrorConstants.DEFAULT_TYPE)
            .withTitle(cause.getMessage())
            .withDetail(cause.getMessage())
            .withProperty("code", cause.getCode())
            .withProperty("message", "error.setting");
        cause.getExtra().forEach(builder::withProperty);
        return builder.build();
    }
}
