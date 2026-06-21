package com.dossier.api.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Publishes the Dossier OpenAPI contract.
 *
 * <p>This springdoc spec (served at {@code /v3/api-docs}, ADMIN-gated) <b>is</b> the
 * contract a third-party backend implements to be Dossier-compatible: the auth flow
 * ({@code /api/authenticate}, {@code /api/refresh}), the user-scoped sync API
 * ({@code /api/profile} + {@code /api/profile/resumes}), and the tracking DTOs.
 *
 * <p>The API identity (title/description/version) is set via {@code jhipster.api-docs.*}
 * in {@code application.yml} — JHipster's own customizer has the last word on {@code info},
 * so configuring it there is the reliable lever. This customizer only adds the
 * {@code bearer-jwt} security scheme (which JHipster doesn't define) so the contract
 * documents how every protected endpoint authenticates; the access token comes from
 * {@code POST /api/authenticate}.
 *
 * <p>Only active under the {@code api-docs} profile (springdoc is disabled otherwise),
 * matching {@code application.yml}'s {@code !api-docs} guard.
 */
@Configuration
@Profile("api-docs")
public class OpenApiConfiguration {

    public static final String BEARER_JWT_SCHEME = "bearer-jwt";

    @Bean
    public OpenApiCustomizer dossierSecuritySchemeCustomizer() {
        return openApi -> {
            if (openApi.getComponents() == null) {
                openApi.setComponents(new Components());
            }
            openApi
                .getComponents()
                .addSecuritySchemes(
                    BEARER_JWT_SCHEME,
                    new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("JWT access token issued by POST /api/authenticate (or refreshed via POST /api/refresh).")
                );
        };
    }
}
