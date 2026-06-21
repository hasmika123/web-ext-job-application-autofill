package com.dossier.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration for the S3-compatible blob store that holds resume files.
 * In production this points at Cloudflare R2; in dev/tests it points at MinIO.
 * Endpoint, bucket and credentials are config (env-overridable), never constants.
 */
@ConfigurationProperties(prefix = "application.storage")
public class StorageProperties {

    /** S3 endpoint. R2: https://&lt;account&gt;.r2.cloudflarestorage.com; MinIO: http://host:port. */
    private String endpoint = "";

    /** Region. R2 ignores it but requires a value; "auto" is the R2 convention. */
    private String region = "auto";

    private String bucket = "dossier-resumes";

    private String accessKey = "";

    private String secretKey = "";

    /** R2 and MinIO both work with path-style addressing; keep it on. */
    private boolean pathStyleAccess = true;

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }

    public String getBucket() {
        return bucket;
    }

    public void setBucket(String bucket) {
        this.bucket = bucket;
    }

    public String getAccessKey() {
        return accessKey;
    }

    public void setAccessKey(String accessKey) {
        this.accessKey = accessKey;
    }

    public String getSecretKey() {
        return secretKey;
    }

    public void setSecretKey(String secretKey) {
        this.secretKey = secretKey;
    }

    public boolean isPathStyleAccess() {
        return pathStyleAccess;
    }

    public void setPathStyleAccess(boolean pathStyleAccess) {
        this.pathStyleAccess = pathStyleAccess;
    }
}
