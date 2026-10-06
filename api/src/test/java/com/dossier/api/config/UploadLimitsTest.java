package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.web.servlet.MultipartProperties;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.FileSystemResource;
import org.springframework.util.unit.DataSize;

/**
 * The upload limit production actually runs with (2026-10-06). The web caps a resume at 10MB, but
 * Spring's default is 1MB per file — which refused most PDFs at the API with nothing logged.
 *
 * <p>Reads the MAIN {@code config/application.yml} from disk: the test classpath has its own
 * {@code config/application.yml}, which shadows the main one, so a Spring test context would be
 * checking the test settings, not production's.
 */
class UploadLimitsTest {

    @Test
    void productionAcceptsResumesUpTo10Mb() throws Exception {
        List<PropertySource<?>> docs = new YamlPropertySourceLoader()
            .load("main-application", new FileSystemResource("src/main/resources/config/application.yml"));
        StandardEnvironment env = new StandardEnvironment();
        docs.forEach(d -> env.getPropertySources().addLast(d));
        MultipartProperties multipart = new Binder(ConfigurationPropertySources.get(env))
            .bind("spring.servlet.multipart", MultipartProperties.class)
            .orElseGet(MultipartProperties::new);

        assertThat(multipart.getMaxFileSize()).isEqualTo(DataSize.ofMegabytes(10));
        assertThat(multipart.getMaxRequestSize()).isGreaterThan(DataSize.ofMegabytes(10));
    }
}
