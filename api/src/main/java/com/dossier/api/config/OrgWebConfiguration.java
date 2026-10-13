package com.dossier.api.config;

import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgFeatureFlag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Puts {@link OrgPermissionInterceptor} in front of every {@code /api/orgs/**} handler, {@link OrgsEnabledFilter}
 * in front of the whole org API (the feature flag, E2E-O1.9) and {@link EnterpriseEnabledFilter} in front of the
 * enterprise surface (Enterprise V2, X1.1).
 */
@Configuration
public class OrgWebConfiguration implements WebMvcConfigurer {

    private final OrgAccessService accessService;
    private final OrgFeatureFlag orgFeatureFlag;
    private final EnterpriseFeatureFlag enterpriseFeatureFlag;
    private final TenantResolver tenantResolver;
    private final TenantHostTrust tenantHostTrust;

    public OrgWebConfiguration(
        OrgAccessService accessService,
        OrgFeatureFlag orgFeatureFlag,
        EnterpriseFeatureFlag enterpriseFeatureFlag,
        TenantResolver tenantResolver,
        @Value("${dossier.tenant-host.secret:}") String tenantHostSecret,
        @Value("${dossier.tenant-host.require-secret:false}") boolean requireTenantHostSecret
    ) {
        this.tenantHostTrust = new TenantHostTrust(tenantHostSecret, requireTenantHostSecret);
        this.accessService = accessService;
        this.orgFeatureFlag = orgFeatureFlag;
        this.enterpriseFeatureFlag = enterpriseFeatureFlag;
        this.tenantResolver = tenantResolver;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new OrgPermissionInterceptor(accessService, orgFeatureFlag, enterpriseFeatureFlag)).addPathPatterns("/api/orgs", "/api/orgs/**");
    }

    /** Ahead of Spring Security (order -100) so a signed-out probe gets the same 404 as everyone else while the flag is off. */
    @Bean
    public FilterRegistrationBean<OrgsEnabledFilter> orgsEnabledFilter() {
        FilterRegistrationBean<OrgsEnabledFilter> bean = new FilterRegistrationBean<>(new OrgsEnabledFilter(orgFeatureFlag));
        bean.addUrlPatterns("/api/*");
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE + 50);
        return bean;
    }

    /** The second wall (X1.1): the enterprise surface is 404 while {@code flag.enterprise} is off. Right behind the org wall, ahead of security. */
    @Bean
    public FilterRegistrationBean<EnterpriseEnabledFilter> enterpriseEnabledFilter() {
        FilterRegistrationBean<EnterpriseEnabledFilter> bean = new FilterRegistrationBean<>(new EnterpriseEnabledFilter(enterpriseFeatureFlag));
        bean.addUrlPatterns("/api/*");
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE + 51);
        return bean;
    }

    /**
     * Derives the tenant from the forwarded host (X1.3, ADR-003) for every API request while enterprise is on, ahead of
     * Spring Security so the answer is known before authentication. A no-op while the master flag is off.
     */
    @Bean
    public FilterRegistrationBean<TenantResolverFilter> tenantResolverFilter() {
        FilterRegistrationBean<TenantResolverFilter> bean = new FilterRegistrationBean<>(new TenantResolverFilter(tenantResolver, enterpriseFeatureFlag, tenantHostTrust));
        bean.addUrlPatterns("/api/*");
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE + 52);
        return bean;
    }
}
