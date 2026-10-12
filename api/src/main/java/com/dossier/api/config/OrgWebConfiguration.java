package com.dossier.api.config;

import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgFeatureFlag;
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

    public OrgWebConfiguration(OrgAccessService accessService, OrgFeatureFlag orgFeatureFlag, EnterpriseFeatureFlag enterpriseFeatureFlag) {
        this.accessService = accessService;
        this.orgFeatureFlag = orgFeatureFlag;
        this.enterpriseFeatureFlag = enterpriseFeatureFlag;
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
}
