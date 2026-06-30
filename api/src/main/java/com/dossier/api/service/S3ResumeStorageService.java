package com.dossier.api.service;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * {@link ResumeStorageService} backed by an S3-compatible store (Cloudflare R2
 * in prod, MinIO in dev/tests). All access goes through the injected
 * {@link S3Client}; the bucket comes from config.
 */
@Service
public class S3ResumeStorageService implements ResumeStorageService {

    private static final Logger LOG = LoggerFactory.getLogger(S3ResumeStorageService.class);
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    private final S3Client s3Client;
    private final String bucket;

    // Inject the bucket name directly (not the config class) so the service layer
    // stays free of a dependency on the config layer (enforced by ArchUnit).
    public S3ResumeStorageService(S3Client s3Client, @Value("${dossier.storage.bucket:dossier-resumes}") String bucket) {
        this.s3Client = s3Client;
        this.bucket = bucket;
    }

    @Override
    public String objectKeyFor(Long userId, Long resumeId, String fileName) {
        return objectKeyFor("resumes", userId, resumeId, fileName);
    }

    @Override
    public String objectKeyFor(String prefix, Long userId, Long entityId, String fileName) {
        String safeName = sanitize(fileName);
        // <prefix>/<userId>/<entityId>-<uuid>-<filename> — namespaced per user, unique.
        return prefix + "/" + (userId == null ? "anon" : userId) + "/" + (entityId == null ? "new" : entityId) + "-" + UUID.randomUUID() + "-" + safeName;
    }

    @Override
    public String store(String objectKey, byte[] content, String contentType) {
        PutObjectRequest req = PutObjectRequest.builder()
            .bucket(bucket)
            .key(objectKey)
            .contentType(contentType == null || contentType.isBlank() ? DEFAULT_CONTENT_TYPE : contentType)
            .build();
        s3Client.putObject(req, RequestBody.fromBytes(content));
        LOG.debug("Stored resume object {} ({} bytes) in bucket {}", objectKey, content.length, bucket);
        return objectKey;
    }

    @Override
    public StoredFile load(String objectKey) {
        GetObjectRequest req = GetObjectRequest.builder().bucket(bucket).key(objectKey).build();
        ResponseBytes<GetObjectResponse> bytes = s3Client.getObjectAsBytes(req);
        return new StoredFile(bytes.asByteArray(), bytes.response().contentType());
    }

    @Override
    public void delete(String objectKey) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(objectKey).build());
        } catch (NoSuchKeyException e) {
            LOG.debug("Resume object {} already absent in bucket {}", objectKey, bucket);
        }
    }

    private static String sanitize(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return "resume";
        }
        // Keep a readable, path-safe tail of the original name.
        String base = fileName.replaceAll(".*[/\\\\]", "").replaceAll("[^A-Za-z0-9._-]+", "_");
        return base.length() > 100 ? base.substring(base.length() - 100) : base;
    }
}
