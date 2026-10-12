package com.dossier.api.service.storage.s3;

import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StorageObjectNotFoundException;
import java.io.InputStream;
import java.net.URI;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.S3Object;

/**
 * {@link FileStorage} backed by an S3-compatible store (AWS S3 in prod, S3Mock/MinIO in
 * dev/tests). This is the only place the AWS SDK is used (enforced by ArchUnit); no SDK type
 * leaks through the {@link FileStorage} interface. Selected with {@code dossier.storage.driver=s3}.
 */
public class S3FileStorage implements FileStorage, AutoCloseable {

    private static final Logger LOG = LoggerFactory.getLogger(S3FileStorage.class);
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    private final S3Client s3Client;
    private final String bucket;

    public S3FileStorage(S3Client s3Client, String bucket) {
        this.s3Client = s3Client;
        this.bucket = bucket;
    }

    /**
     * Build the driver from plain config values. Constructing the client opens no connection, so
     * this is safe with blank credentials (falls back to anonymous creds — the SDK rejects a blank key).
     */
    public static S3FileStorage create(
        String endpoint,
        String region,
        String bucket,
        String accessKey,
        String secretKey,
        boolean pathStyleAccess
    ) {
        AwsCredentialsProvider credentials = StringUtils.hasText(accessKey)
            ? StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey))
            : AnonymousCredentialsProvider.create();
        var builder = S3Client.builder()
            .region(Region.of(StringUtils.hasText(region) ? region : "auto"))
            .credentialsProvider(credentials)
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(pathStyleAccess).build());
        if (StringUtils.hasText(endpoint)) {
            builder.endpointOverride(URI.create(endpoint));
        }
        return new S3FileStorage(builder.build(), bucket);
    }

    @Override
    public String store(String key, InputStream in, long declaredLength, String contentType) {
        PutObjectRequest req = PutObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .contentType(contentType == null || contentType.isBlank() ? DEFAULT_CONTENT_TYPE : contentType)
            .build();
        s3Client.putObject(req, RequestBody.fromInputStream(in, declaredLength));
        LOG.debug("Stored object {} ({} bytes) in bucket {}", key, declaredLength, bucket);
        return key;
    }

    @Override
    public StoredFile load(String key) {
        try {
            ResponseBytes<GetObjectResponse> bytes = s3Client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build());
            return new StoredFile(bytes.asByteArray(), bytes.response().contentType());
        } catch (NoSuchKeyException e) {
            throw new StorageObjectNotFoundException(key, e);
        }
    }

    @Override
    public InputStream open(String key) {
        try {
            return s3Client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (NoSuchKeyException e) {
            throw new StorageObjectNotFoundException(key, e);
        }
    }

    @Override
    public Optional<ObjectStat> stat(String key) {
        try {
            HeadObjectResponse head = s3Client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            return Optional.of(new ObjectStat(head.contentLength(), head.contentType(), head.eTag(), head.lastModified()));
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return Optional.empty(); // HEAD has no body, so some servers raise a bare 404
            }
            throw e;
        }
    }

    @Override
    public boolean exists(String key) {
        return stat(key).isPresent();
    }

    @Override
    public void delete(String key) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (NoSuchKeyException e) {
            LOG.debug("Object {} already absent in bucket {}", key, bucket);
        }
    }

    @Override
    public KeyPage list(String prefix, String continuationToken) {
        ListObjectsV2Request.Builder req = ListObjectsV2Request.builder().bucket(bucket).prefix(prefix == null ? "" : prefix);
        if (continuationToken != null) {
            req.continuationToken(continuationToken);
        }
        ListObjectsV2Response res = s3Client.listObjectsV2(req.build());
        return new KeyPage(res.contents().stream().map(S3Object::key).toList(), res.isTruncated() ? res.nextContinuationToken() : null);
    }

    @Override
    public void close() {
        s3Client.close();
    }
}
