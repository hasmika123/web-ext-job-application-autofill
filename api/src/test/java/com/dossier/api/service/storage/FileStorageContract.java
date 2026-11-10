package com.dossier.api.service.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Behaviour every {@link FileStorage} driver must satisfy. {@code LocalFileStorageTest} runs it
 * against the local driver, {@code S3FileStorageIT} against S3Mock; the callers (resume upload,
 * attachments, account deletion, R0.6) rely on exactly this and nothing driver-specific.
 */
abstract class FileStorageContract {

    /** The driver under test. */
    abstract FileStorage storage();

    /** A key that is unique per test so shared backends (the S3 container) never collide. */
    protected String freshKey(String name) {
        return "contract/" + UUID.randomUUID() + "/" + name;
    }

    @Test
    void objectKeyIsNamespacedPerUserAndUnique() {
        String k1 = storage().objectKeyFor(7L, 3L, "My Résumé v2.pdf");
        String k2 = storage().objectKeyFor(7L, 3L, "My Résumé v2.pdf");
        assertThat(k1).startsWith("resumes/7/3-");
        assertThat(k1).doesNotContain(" "); // path-safe
        assertThat(k1).isNotEqualTo(k2); // uuid component keeps repeated uploads distinct
        assertThat(storage().objectKeyFor("application-attachments", 7L, 3L, "a.pdf")).startsWith("application-attachments/7/3-");
    }

    @Test
    void storeThenLoadRoundTripsBytesAndContentType() {
        byte[] pdf = "%PDF-1.7 fake resume bytes".getBytes(StandardCharsets.UTF_8);
        String key = storage().objectKeyFor(1L, 1L, "resume.pdf");

        assertThat(storage().store(key, pdf, "application/pdf")).isEqualTo(key);

        FileStorage.StoredFile back = storage().load(key);
        assertThat(back.content()).isEqualTo(pdf);
        assertThat(back.contentType()).isEqualTo("application/pdf");
    }

    @Test
    void openStreamsTheStoredBytes() throws IOException {
        byte[] bytes = "streamed bytes".getBytes(StandardCharsets.UTF_8);
        String key = freshKey("stream.txt");
        storage().store(key, bytes, "text/plain");

        try (InputStream in = storage().open(key)) {
            assertThat(in.readAllBytes()).isEqualTo(bytes);
        }
    }

    @Test
    void streamingStoreWritesTheDeclaredLength() {
        byte[] bytes = "from a stream".getBytes(StandardCharsets.UTF_8);
        String key = freshKey("s.txt");
        storage().store(key, new java.io.ByteArrayInputStream(bytes), bytes.length, "text/plain");
        assertThat(storage().load(key).content()).isEqualTo(bytes);
    }

    @Test
    void storingTheSameKeyOverwrites() {
        String key = freshKey("o.txt");
        storage().store(key, "first".getBytes(StandardCharsets.UTF_8), "text/plain");
        storage().store(key, "second, longer".getBytes(StandardCharsets.UTF_8), "application/json");

        FileStorage.StoredFile back = storage().load(key);
        assertThat(new String(back.content(), StandardCharsets.UTF_8)).isEqualTo("second, longer");
        assertThat(back.contentType()).isEqualTo("application/json");
    }

    @Test
    void statReportsSizeAndContentTypeAndExistsTracksPresence() {
        String key = freshKey("stat.pdf");
        assertThat(storage().exists(key)).isFalse();
        assertThat(storage().stat(key)).isEmpty();

        storage().store(key, new byte[1234], "application/pdf");

        assertThat(storage().exists(key)).isTrue();
        FileStorage.ObjectStat stat = storage().stat(key).orElseThrow();
        assertThat(stat.size()).isEqualTo(1234);
        assertThat(stat.contentType()).isEqualTo("application/pdf");
        assertThat(stat.etag()).isNotBlank();
        assertThat(stat.lastModified()).isNotNull();
    }

    @Test
    void deleteRemovesTheObject() {
        String key = freshKey("old.docx");
        storage().store(key, "bytes".getBytes(StandardCharsets.UTF_8), "application/octet-stream");

        storage().delete(key);

        assertThat(storage().exists(key)).isFalse();
        assertThatThrownBy(() -> storage().load(key)).isInstanceOf(StorageObjectNotFoundException.class);
    }

    @Test
    void deletingAMissingObjectIsANoOp() {
        assertThatCode(() -> storage().delete(freshKey("not-there"))).doesNotThrowAnyException();
    }

    @Test
    void missingKeyRaisesNotFoundOnLoadAndOpen() {
        String key = freshKey("missing.pdf");
        assertThatThrownBy(() -> storage().load(key)).isInstanceOf(StorageObjectNotFoundException.class);
        assertThatThrownBy(() -> storage().open(key)).isInstanceOf(StorageObjectNotFoundException.class);
    }

    @Test
    void listReturnsKeysUnderAPrefixInOrder() {
        String dir = "list-" + UUID.randomUUID();
        storage().store(dir + "/b.txt", new byte[] { 1 }, "text/plain");
        storage().store(dir + "/a.txt", new byte[] { 1 }, "text/plain");
        storage().store("other-" + UUID.randomUUID() + "/c.txt", new byte[] { 1 }, "text/plain");

        FileStorage.KeyPage page = storage().list(dir + "/", null);

        assertThat(page.keys()).containsExactly(dir + "/a.txt", dir + "/b.txt");
        assertThat(page.nextToken()).isNull();
    }
}
