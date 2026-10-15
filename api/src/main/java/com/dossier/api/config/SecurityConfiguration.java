package com.dossier.api.config;

import static org.springframework.security.config.Customizer.withDefaults;

import com.dossier.api.security.*;
import com.dossier.api.service.AccountScopes;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.servlet.util.matcher.MvcRequestMatcher;
import org.springframework.web.servlet.handler.HandlerMappingIntrospector;
import tech.jhipster.config.JHipsterProperties;

@Configuration
@EnableMethodSecurity(securedEnabled = true)
public class SecurityConfiguration {

    private final JHipsterProperties jHipsterProperties;

    public SecurityConfiguration(JHipsterProperties jHipsterProperties) {
        this.jHipsterProperties = jHipsterProperties;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, MvcRequestMatcher.Builder mvc, ObjectProvider<AccountScopes> accountScopes) throws Exception {
        http
            .cors(withDefaults())
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(authz ->
                // prettier-ignore
                authz
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/authenticate")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/authenticate/mfa")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/authenticate/demo")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/public/demo")).permitAll()
                    // Enterprise V2 (X1.3): the host-derived public view of a tenant. 404 while enterprise is off or the host is unknown.
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/public/tenant")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/public/tenant/demo")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/public/tenant/assets/*")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.HEAD, "/api/public/tenant/assets/*")).permitAll()
                    // The two public on/off switches (orgs, demo): booleans only, cached, never per-user (PublicConfigResource).
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/config/public")).permitAll()
                    // Resume share links (R3.11): the 32-char token is the credential. GET only; the resource
                    // rate-limits, answers every refusal with the same 404 and stores nothing about the visitor.
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/public/resumes/*")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/public/resumes/*/pdf")).permitAll()
                    // Join previews (O2.2): the invite token / join code is the credential. GET only; JoinResource rate-limits, answers
                    // every miss with the same 404 and never caches. Accepting (POST) needs a signed-in account.
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/join/*")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/join/code/*")).permitAll()
                    // Accepting an invitation to a SEPARATE organization (decision O4): the invite token is the credential and the person has no account yet.
                    // JoinResource.acceptInvite answers 401 itself for the legacy (shared-account) organizations, which still need a signed-in account.
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/join/*/accept")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/authenticate")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/auth/google")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/refresh")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/logout")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/extension/connect-code/exchange")).permitAll()
                    .requestMatchers(mvc.pattern("/api/register")).permitAll()
                    .requestMatchers(mvc.pattern("/api/activate")).permitAll()
                    .requestMatchers(mvc.pattern("/api/account/reset-password/init")).permitAll()
                    .requestMatchers(mvc.pattern("/api/account/reset-password/finish")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/newsletter/subscribe")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/newsletter/confirm")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/newsletter/unsubscribe")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/bug-reports")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/inquiries")).permitAll()
                    // Stripe has no session with us, so this cannot be authenticated the usual
                    // way. It is NOT unprotected: the Stripe-Signature header is verified against
                    // the webhook secret before anything is read (see BillingWebhookResource).
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/billing/webhook")).permitAll()
                    .requestMatchers(mvc.pattern("/api/admin/**")).hasAuthority(AuthoritiesConstants.ADMIN)
                    .requestMatchers(mvc.pattern("/api/**")).authenticated()
                    .requestMatchers(mvc.pattern("/v3/api-docs/**")).hasAuthority(AuthoritiesConstants.ADMIN)
                    .requestMatchers(mvc.pattern("/management/health")).permitAll()
                    .requestMatchers(mvc.pattern("/management/health/**")).permitAll()
                    .requestMatchers(mvc.pattern("/management/info")).permitAll()
                    .requestMatchers(mvc.pattern("/management/prometheus")).permitAll()
                    .requestMatchers(mvc.pattern("/management/**")).hasAuthority(AuthoritiesConstants.ADMIN)
            )
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(exceptions ->
                exceptions
                    .authenticationEntryPoint(new BearerTokenAuthenticationEntryPoint())
                    .accessDeniedHandler(new BearerTokenAccessDeniedHandler())
            )
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(withDefaults()))
            // Enterprise V2 (X1.5): after bearer authentication, keep tenant-bound tokens on their own tenant's routes.
            .addFilterAfter(new TenantTokenBindingFilter(accountScopes), BearerTokenAuthenticationFilter.class)
            // Decision O4: an enterprise account has no personal plan or personal inbox; those routes answer the generic 404 for its tokens.
            .addFilterAfter(new AccountKindRouteFilter(), BearerTokenAuthenticationFilter.class)
            // Administrator-issued temporary password: the session can only change it (PASSWORD_CHANGE_REQUIRED everywhere else).
            .addFilterAfter(new PasswordChangeRequiredFilter(), BearerTokenAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    MvcRequestMatcher.Builder mvc(HandlerMappingIntrospector introspector) {
        return new MvcRequestMatcher.Builder(introspector);
    }
}
