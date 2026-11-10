package com.dossier.api.service.storage;

import com.dossier.api.service.storage.s3.S3FileStorage;
import java.net.URI;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

/**
 * The S3 driver must satisfy the same {@link FileStorageContract} as the local one, against a real
 * S3-compatible server (Adobe S3Mock via Testcontainers) — the API AWS S3 exposes in prod.
 * Talks to the driver directly, so it needs no Spring context or DB.
 */
@Testcontainers
class S3FileStorageIT extends FileStorageContract {

    private static final String BUCKET = "dossier-resumes";

    // Adobe S3Mock, not MinIO: MinIO stopped publishing public images — Docker Hub dropped
    // minio/minio, and quay.io/minio now requires a login, which failed every CI run from
    // 2026-10-05. S3Mock is maintained, public on Docker Hub, and accepts any credentials.
    private static final int S3_PORT = 9090;

    @Container
    private static final GenericContainer<?> S3 = new GenericContainer<>(DockerImageName.parse("adobe/s3mock:5.2.3"))
        .withExposedPorts(S3_PORT)
        .waitingFor(Wait.forListeningPort());

    private static S3FileStorage storage;

    @BeforeAll
    static void setUp() {
        S3Client client = S3Client.builder()
            .endpointOverride(URI.create("http://" + S3.getHost() + ":" + S3.getMappedPort(S3_PORT)))
            .region(Region.of("auto"))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
            .build();
        client.createBucket(b -> b.bucket(BUCKET));
        storage = new S3FileStorage(client, BUCKET);
    }

    @AfterAll
    static void tearDown() {
        if (storage != null) {
            storage.close();
        }
    }

    @Override
    FileStorage storage() {
        return storage;
    }
}
