package com.dossier.api.security.jwt;

import com.dossier.api.service.RefreshTokenService;
import org.mockito.Mockito;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * Supplies a mock {@link RefreshTokenService} to the lightweight {@code AuthenticationIntegrationTest}
 * slice. That slice wires {@code AuthenticateController} without the JPA layer; these JWT-decoder
 * tests only hit {@code GET /api/authenticate}, which never touches the refresh-token store, so a
 * mock satisfies the constructor dependency without dragging in a datasource.
 */
@TestConfiguration
public class RefreshTokenTestConfig {

    @Bean
    RefreshTokenService refreshTokenService() {
        return Mockito.mock(RefreshTokenService.class);
    }
}
