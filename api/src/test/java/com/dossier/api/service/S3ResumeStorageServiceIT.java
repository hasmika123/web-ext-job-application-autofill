package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

/**
 * Verifies the resume blob store round-trips against a real S3-compatible server
 * (MinIO via Testcontainers) — the same surface Cloudflare R2 exposes in prod.
 * Talks to the storage service directly, so it needs no Spring context or DB.
 */
@Testcontainers
class S3ResumeStorageServiceIT {

    private static final String BUCKET = "dossier-resumes";

    @Container
    private static final MinIOContainer MINIO = new MinIOContainer("minio/minio:RELEASE.2025-04-08T15-41-24Z");

    private static S3Client s3Client;
    private static ResumeStorageService storageService;

    @BeforeAll
    static void setUp() {
        s3Client = S3Client.builder()
            .endpointOverride(URI.create(MINIO.getS3URL()))
            .region(Region.of("auto"))
            .credentialsProvider(
                StaticCredentialsProvider.create(AwsBasicCredentials.create(MINIO.getUserName(), MINIO.getPassword()))
            )
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
            .build();
        s3Client.createBucket(b -> b.bucket(BUCKET));

        storageService = new S3ResumeStorageService(s3Client, BUCKET);
    }

    @AfterAll
    static void tearDown() {
        if (s3Client != null) {
            s3Client.close();
        }
    }

    @Test
    void objectKeyIsNamespacedPerUserAndUnique() {
        String k1 = storageService.objectKeyFor(7L, 3L, "My Résumé v2.pdf");
        String k2 = storageService.objectKeyFor(7L, 3L, "My Résumé v2.pdf");
        assertThat(k1).startsWith("resumes/7/3-");
        assertThat(k1).doesNotContain(" "); // path-safe
        assertThat(k1).isNotEqualTo(k2); // uuid component keeps repeated uploads distinct
    }

    @Test
    void storeThenLoadReturnsTheSameBytesAndContentType() {
        byte[] pdf = "%PDF-1.7 fake resume bytes".getBytes(StandardCharsets.UTF_8);
        String key = storageService.objectKeyFor(1L, 1L, "resume.pdf");

        String stored = storageService.store(key, pdf, "application/pdf");
        assertThat(stored).isEqualTo(key);

        ResumeStorageService.StoredFile back = storageService.load(key);
        assertThat(back.content()).isEqualTo(pdf);
        assertThat(back.contentType()).isEqualTo("application/pdf");
    }

    @Test
    void deleteRemovesTheObject() {
        String key = storageService.objectKeyFor(2L, 9L, "old.docx");
        storageService.store(key, "bytes".getBytes(StandardCharsets.UTF_8), "application/octet-stream");

        storageService.delete(key);

        assertThatThrownBy(() -> storageService.load(key)).isInstanceOf(NoSuchKeyException.class);
    }

    @Test
    void deletingAMissingObjectIsANoOp() {
        assertThatCode(() -> storageService.delete("resumes/does/not-exist")).doesNotThrowAnyException();
    }
}
