package com.dossier.api.service.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** The local-filesystem driver: the shared {@link FileStorageContract} plus its path-safety and atomicity rules. */
class LocalFileStorageTest extends FileStorageContract {

    @TempDir
    Path root;

    private LocalFileStorage storage;

    @Override
    FileStorage storage() {
        if (storage == null) {
            storage = new LocalFileStorage(root.resolve("uploads"));
        }
        return storage;
    }

    @ParameterizedTest
    @ValueSource(
        strings = {
            "../escape.txt",
            "resumes/../../escape.txt",
            "resumes/1/../../../escape.txt",
            "..\\escape.txt",
            "resumes\\1\\x.pdf",
            "/etc/passwd",
            "C:/Windows/win.ini",
            "..",
            ".",
            "resumes/./x.pdf",
            "resumes//x.pdf",
            "%2e%2e/escape.txt",
            "resumes/%2E%2E/escape.txt",
            "resumes%2f..%2fx",
            "resumes/x\0.pdf",
            ".tmp/x",
            "resumes/x.pdf.meta",
            "resumes/dir/",
            "",
            " ",
        }
    )
    void unsafeKeysAreRejectedByEveryOperation(String key) {
        assertThatThrownBy(() -> storage().store(key, new byte[] { 1 }, "text/plain")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage().load(key)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage().open(key)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage().exists(key)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage().delete(key)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void nullAndOverlongKeysAreRejected() {
        assertThatThrownBy(() -> storage().exists(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage().exists("a/".repeat(300) + "x")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void nothingIsEverWrittenOutsideTheRoot() throws IOException {
        try {
            storage().store("../escape.txt", new byte[] { 1 }, "text/plain");
        } catch (IllegalArgumentException expected) {
            // rejected as asserted above
        }
        assertThat(root.resolve("escape.txt")).doesNotExist();
        assertThat(root.resolve("uploads").resolve("escape.txt")).doesNotExist();
    }

    @Test
    void writesLandAtTheKeyPathWithAMetaSidecarAndNoTempLitter() throws IOException {
        storage().store("resumes/7/3-abc-cv.pdf", "%PDF-1.7".getBytes(StandardCharsets.UTF_8), "application/pdf");

        Path data = root.resolve("uploads/resumes/7/3-abc-cv.pdf");
        assertThat(data).exists().hasBinaryContent("%PDF-1.7".getBytes(StandardCharsets.UTF_8));
        String meta = Files.readString(root.resolve("uploads/resumes/7/3-abc-cv.pdf.meta"));
        assertThat(meta).contains("\"contentType\":\"application/pdf\"").contains("\"size\":8").contains("\"sha256\":");
        try (Stream<Path> tmp = Files.list(root.resolve("uploads/.tmp"))) {
            assertThat(tmp).isEmpty(); // moved into place, nothing left behind
        }
    }

    @Test
    void aFailedWriteLeavesNeitherTheObjectNorTempLitter() throws IOException {
        String key = "resumes/9/failing.pdf";
        storage().store(key, "old".getBytes(StandardCharsets.UTF_8), "text/plain");

        // Declared length disagrees with the stream: the write must not replace the old object.
        assertThatThrownBy(() -> storage().store(key, new ByteArrayInputStream(new byte[10]), 99, "text/plain"))
            .isInstanceOf(java.io.UncheckedIOException.class);

        assertThat(new String(storage().load(key).content(), StandardCharsets.UTF_8)).isEqualTo("old");
        try (Stream<Path> tmp = Files.list(root.resolve("uploads/.tmp"))) {
            assertThat(tmp).isEmpty();
        }
    }

    @Test
    void deleteRemovesTheSidecarToo() {
        storage().store("resumes/1/x.pdf", new byte[] { 1 }, "application/pdf");
        storage().delete("resumes/1/x.pdf");
        assertThat(root.resolve("uploads/resumes/1/x.pdf")).doesNotExist();
        assertThat(root.resolve("uploads/resumes/1/x.pdf.meta")).doesNotExist();
    }

    @Test
    void statFallsBackWhenTheSidecarIsMissing() throws IOException {
        storage().store("resumes/1/y.pdf", new byte[] { 1, 2, 3 }, "application/pdf");
        Files.delete(root.resolve("uploads/resumes/1/y.pdf.meta"));

        FileStorage.ObjectStat stat = storage().stat("resumes/1/y.pdf").orElseThrow();
        assertThat(stat.size()).isEqualTo(3);
        assertThat(stat.etag()).isNotBlank();
        assertThat(storage().load("resumes/1/y.pdf").contentType()).isNull();
    }

    @Test
    void listHidesSidecarsAndTempFilesAndPaginates() {
        for (int i = 0; i < 3; i++) {
            storage().store("p/k" + i + ".txt", new byte[] { 1 }, "text/plain");
        }
        FileStorage.KeyPage all = storage().list("", null);
        assertThat(all.keys()).containsExactly("p/k0.txt", "p/k1.txt", "p/k2.txt");
        // continuation token is exclusive
        assertThat(storage().list("p/", "p/k0.txt").keys()).isEqualTo(List.of("p/k1.txt", "p/k2.txt"));
    }

    @Test
    void rootIsCreatedOwnerOnlyOnPosixFilesystems() throws IOException {
        storage();
        Path uploads = root.resolve("uploads");
        assertThat(uploads).isDirectory();
        if (Files.getFileStore(uploads).supportsFileAttributeView("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(uploads))).isEqualTo("rwx------");
        }
    }
}
