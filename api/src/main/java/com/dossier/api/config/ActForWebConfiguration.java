package com.dossier.api.config;

import com.dossier.api.service.ent.mkt.resumes.ActForBuilderGate;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Puts {@link ActForBuilderInterceptor} in front of the Resume Builder's {@code /api/profile/**} routes (a no-op for every request without the act-for header)
 * and {@link ActForCleanupFilter} around every request as the thread-hygiene safety net.
 */
@Configuration
public class ActForWebConfiguration implements WebMvcConfigurer {

    private final ActForBuilderGate gate;

    public ActForWebConfiguration(ActForBuilderGate gate) {
        this.gate = gate;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new ActForBuilderInterceptor(gate)).addPathPatterns("/api/profile", "/api/profile/**");
    }

    /** Outermost: its {@code finally} runs after everything else (the security chain included) has finished with the thread. */
    @Bean
    public FilterRegistrationBean<ActForCleanupFilter> actForCleanupFilter() {
        FilterRegistrationBean<ActForCleanupFilter> bean = new FilterRegistrationBean<>(new ActForCleanupFilter());
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE);
        bean.addUrlPatterns("/*");
        return bean;
    }
}
