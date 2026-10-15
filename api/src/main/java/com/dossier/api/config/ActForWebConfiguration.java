package com.dossier.api.config;

import com.dossier.api.service.ent.mkt.resumes.ActForBuilderGate;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Puts {@link ActForBuilderInterceptor} in front of the Resume Builder's {@code /api/profile/**} routes (a no-op for every request without the act-for header). */
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
}
