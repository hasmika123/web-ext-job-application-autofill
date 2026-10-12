package com.dossier.api.config;

import com.dossier.api.service.org.OrgAccessService;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Puts {@link OrgPermissionInterceptor} in front of every {@code /api/orgs/**} handler. */
@Configuration
public class OrgWebConfiguration implements WebMvcConfigurer {

    private final OrgAccessService accessService;

    public OrgWebConfiguration(OrgAccessService accessService) {
        this.accessService = accessService;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new OrgPermissionInterceptor(accessService)).addPathPatterns("/api/orgs", "/api/orgs/**");
    }
}
