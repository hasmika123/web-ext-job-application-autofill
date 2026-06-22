package com.dossier.api.config;

import java.net.URI;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

/**
 * Builds the S3 client used to talk to the resume blob store (Cloudflare R2 in
 * prod, MinIO in dev/tests). Constructing the client opens no connection, so the
 * bean is safe to create even when credentials are absent (e.g. unrelated tests).
 */
@Configuration
@EnableConfigurationProperties(StorageProperties.class)
public class StorageConfiguration {

    @Bean
    public S3Client s3Client(StorageProperties props) {
        S3Configuration s3Config = S3Configuration.builder().pathStyleAccessEnabled(props.isPathStyleAccess()).build();
        // When no key is configured (e.g. unrelated tests, or before R2 is wired up),
        // fall back to anonymous creds so the bean still builds — the SDK rejects a
        // blank access key. Real deployments provide STORAGE_ACCESS_KEY/SECRET_KEY.
        AwsCredentialsProvider credentials = StringUtils.hasText(props.getAccessKey())
            ? StaticCredentialsProvider.create(AwsBasicCredentials.create(props.getAccessKey(), props.getSecretKey()))
            : AnonymousCredentialsProvider.create();
        var builder = S3Client.builder()
            .region(Region.of(StringUtils.hasText(props.getRegion()) ? props.getRegion() : "auto"))
            .credentialsProvider(credentials)
            .serviceConfiguration(s3Config);
        if (StringUtils.hasText(props.getEndpoint())) {
            builder.endpointOverride(URI.create(props.getEndpoint()));
        }
        return builder.build();
    }
}
