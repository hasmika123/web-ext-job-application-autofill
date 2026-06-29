package com.dossier.api.security.jwt;

import com.dossier.api.service.AdminMfaService;
import com.dossier.api.service.RefreshTokenService;
import org.mockito.Mockito;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * Supplies mock collaborators to the lightweight {@code AuthenticationIntegrationTest} slice. That
 * slice wires {@code AuthenticateController} without the JPA layer; these JWT-decoder tests only hit
 * {@code GET /api/authenticate}, which never touches the refresh-token store or MFA, so mocks satisfy
 * the constructor dependencies without dragging in a datasource.
 */
@TestConfiguration
public class RefreshTokenTestConfig {

    @Bean
    RefreshTokenService refreshTokenService() {
        return Mockito.mock(RefreshTokenService.class);
    }

    @Bean
    AdminMfaService adminMfaService() {
        return Mockito.mock(AdminMfaService.class);
    }
}
