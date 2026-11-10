package com.dossier.api.config;

import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.LocalFileStorage;
import com.dossier.api.service.storage.s3.S3FileStorage;
import java.nio.file.Path;
import java.util.Locale;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Chooses the {@link FileStorage} driver from {@code dossier.storage.driver}: {@code local}
 * (default) or {@code s3}. The S3 client only exists under {@code s3}. Constructing either
 * driver opens no connection, so the bean is safe in unrelated tests.
 */
@Configuration
@EnableConfigurationProperties(StorageProperties.class)
public class StorageConfiguration {

    @Bean
    public FileStorage fileStorage(StorageProperties props) {
        String driver = props.getDriver() == null ? "local" : props.getDriver().trim().toLowerCase(Locale.ROOT);
        return switch (driver) {
            case "", "local" -> new LocalFileStorage(Path.of(props.getLocal().getRoot()));
            case "s3" -> S3FileStorage.create(
                props.getEndpoint(),
                props.getRegion(),
                props.getBucket(),
                props.getAccessKey(),
                props.getSecretKey(),
                props.isPathStyleAccess()
            );
            default -> throw new IllegalStateException(
                "dossier.storage.driver must be 'local' or 's3', but was '" + props.getDriver() + "'"
            );
        };
    }
}
