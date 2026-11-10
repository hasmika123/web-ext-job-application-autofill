package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.FileSystemResource;

/** The AI provider keys are env-only and must stay out of {@code /management/env} (I1.11). */
class AiKeySanitizeConfigTest {

    @Test
    void theEnvActuatorSanitizesTheProviderKeys() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        // The test classpath has its own application.yml; read the real one by path (Gradle runs tests from the api module root).
        java.nio.file.Path main = java.nio.file.Path.of("src", "main", "resources", "config", "application.yml");
        if (!java.nio.file.Files.exists(main)) main = java.nio.file.Path.of("api", "src", "main", "resources", "config", "application.yml");
        yaml.setResources(new FileSystemResource(main.toFile()));
        Properties p = yaml.getObject();
        String sanitize = p.getProperty("management.endpoint.env.keys-to-sanitize");
        assertThat(sanitize).isNotBlank().contains("DOSSIER_AI_API_KEY").contains("DOSSIER_AI_OPENAI_COMPAT_API_KEY");
        assertThat(sanitize).as("the defaults are kept").contains("password").contains("secret").contains("token");
    }
}
