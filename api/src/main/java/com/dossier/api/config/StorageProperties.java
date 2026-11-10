package com.dossier.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration for the {@code FileStorage} seam that holds every uploaded/built file.
 * {@code driver} picks the implementation: {@code local} (default; files under {@code local.root})
 * or {@code s3} (endpoint/bucket/credentials below). The S3 keys are unchanged, so production
 * switches drivers by configuration alone. Never constants, never committed keys.
 *
 * Bound under `dossier.*` (NOT `application.*`): JHipster owns `application.*` via
 * its own {@code ApplicationProperties} with {@code ignoreUnknownFields=false}, so
 * extra keys there fail startup.
 */
@ConfigurationProperties(prefix = "dossier.storage")
public class StorageProperties {

    /** Which FileStorage driver is active: {@code local} (default) or {@code s3}. */
    private String driver = "local";

    private final Local local = new Local();

    /** S3 endpoint. R2: https://&lt;account&gt;.r2.cloudflarestorage.com; MinIO: http://host:port. */
    private String endpoint = "";

    /** Region. R2 ignores it but requires a value; "auto" is the R2 convention. */
    private String region = "auto";

    private String bucket = "dossier-resumes";

    private String accessKey = "";

    private String secretKey = "";

    /** R2 and MinIO both work with path-style addressing; keep it on. */
    private boolean pathStyleAccess = true;

    public String getDriver() {
        return driver;
    }

    public void setDriver(String driver) {
        this.driver = driver;
    }

    public Local getLocal() {
        return local;
    }

    /** Settings for the local-filesystem driver. */
    public static class Local {

        /**
         * Directory that holds the files. Created (0700) on first use. Default is under the user's
         * home so dev works with zero setup; production sets {@code /srv/uploads} (a Docker volume).
         */
        private String root = System.getProperty("user.home", ".") + "/.dossier/uploads";

        public String getRoot() {
            return root;
        }

        public void setRoot(String root) {
            this.root = root;
        }
    }

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
