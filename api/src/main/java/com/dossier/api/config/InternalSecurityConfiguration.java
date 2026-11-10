package com.dossier.api.config;

import com.dossier.api.security.InternalTokenFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.servlet.util.matcher.MvcRequestMatcher;

/**
 * The service-to-service filter chain (Resume Builder R3.7, DESIGN 8.5 / 9.8): {@code /api/internal/**} is
 * authenticated by the shared {@code X-Internal-Token} ({@link InternalTokenFilter}) and by nothing else. It
 * is a separate chain, ahead of the user chain, so those routes are excluded from the JWT resource server
 * altogether (a user's bearer token is neither needed nor honoured there) and no user route can ever be
 * reached with the token. The edge proxy never routes these paths; the web container reaches the API over
 * the Compose network.
 */
@Configuration
public class InternalSecurityConfiguration {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public SecurityFilterChain internalFilterChain(
        HttpSecurity http,
        MvcRequestMatcher.Builder mvc,
        @Value("${dossier.internal.token:}") String token
    ) throws Exception {
        http
            .securityMatcher(mvc.pattern("/api/internal/**"))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(authz -> authz.anyRequest().hasAuthority(InternalTokenFilter.AUTHORITY))
            .addFilterBefore(new InternalTokenFilter(token), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
