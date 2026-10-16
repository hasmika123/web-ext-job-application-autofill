package com.dossier.api.config;

import com.dossier.api.web.filter.PublicHostGuardFilter;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

/** X1.13 (E12): registers the guard that keeps {@code /management/**} (but health) and {@code /api/internal/**} off public hosts. */
@Configuration
public class OpsEndpointsConfiguration {

    @Bean
    public FilterRegistrationBean<PublicHostGuardFilter> publicHostGuardFilter(
        @Value("${dossier.internal.refuse-public-host:true}") boolean refuse,
        @Value("${dossier.internal.hosts:localhost,127.0.0.1,[::1],api,dossier-api,web,dossier-web}") String hosts
    ) {
        Set<String> allowed = Arrays.stream(hosts.split(",")).map(s -> s.trim().toLowerCase(Locale.ROOT)).filter(s -> !s.isEmpty()).collect(Collectors.toSet());
        FilterRegistrationBean<PublicHostGuardFilter> bean = new FilterRegistrationBean<>(new PublicHostGuardFilter(refuse, allowed));
        bean.addUrlPatterns("/api/internal/*", "/management/*");
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE + 5);
        return bean;
    }
}
