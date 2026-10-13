package com.dossier.api.service.storage;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The inventory of storage key prefixes (privacy: every user file must be deletable by prefix) and the
 * eraser that walks it. A new stored-object type adds a public prefix constant to {@link StorageKeys};
 * the reflection test below fails until {@code userPrefixes} covers it, so a prefix cannot be forgotten.
 */
class StorageKeysTest {

    @TempDir
    Path root;

    @Test
    void everyPublicPrefixConstantIsErasedWithTheUser() throws Exception {
        List<String> declared = new ArrayList<>();
        for (Field f : StorageKeys.class.getDeclaredFields()) {
            if (Modifier.isPublic(f.getModifiers()) && Modifier.isStatic(f.getModifiers()) && f.getType() == String.class) {
                declared.add((String) f.get(null));
            }
        }
        assertThat(declared).as("prefix constants found").hasSizeGreaterThanOrEqualTo(5);
        List<String> user = StorageKeys.userPrefixes(42L);
        for (String prefix : declared) {
            assertThat(user).as("userPrefixes must cover " + prefix).contains(prefix + "/42/");
        }
        assertThat(user).hasSameSizeAs(declared);
    }

    @Test
    void resumePrefixesAreTheResumeScopedSubsetAndEndWithTheKeySeparator() {
        assertThat(StorageKeys.resumePrefixes(42L, 7L))
            .containsExactlyInAnyOrder("resumes/42/7-", "resume-originals/42/7-", "resume-photos/42/7-", "resume-thumbs/42/7-");
        assertThat(StorageKeys.userPrefixes(42L)).containsAll(
            StorageKeys.resumePrefixes(42L, 7L).stream().map(p -> p.substring(0, p.lastIndexOf('/') + 1)).toList()
        );
    }

    @Test
    void theKeysTheBuildersGenerateFallUnderTheInventory() {
        FileStorage storage = new LocalFileStorage(root.resolve("s"));
        for (String prefix : List.of(StorageKeys.RESUMES, StorageKeys.RESUME_ORIGINALS, StorageKeys.RESUME_PHOTOS)) {
            String key = storage.objectKeyFor(prefix, 42L, 7L, "a b.pdf");
            assertThat(StorageKeys.resumePrefixes(42L, 7L)).as(key).anyMatch(key::startsWith);
        }
        String attachment = storage.objectKeyFor(StorageKeys.APPLICATION_ATTACHMENTS, 42L, 9L, "x.pdf");
        assertThat(StorageKeys.userPrefixes(42L)).anyMatch(attachment::startsWith);
    }

    @Test
    void eraserRemovesOnlyTheNamedResumeOrUser() {
        FileStorage storage = new LocalFileStorage(root.resolve("s"));
        StoredFileEraser eraser = new StoredFileEraser(storage);
        List<String> mine = List.of(
            "resumes/42/7-aaa-cv.pdf",
            "resume-originals/42/7-bbb-original.docx",
            "resume-photos/42/7-ccc-photo.jpg",
            "resume-thumbs/42/7-" + "a".repeat(64) + ".png",
            "resume-thumbs/42/7-" + "b".repeat(64) + ".png" // a replaced thumbnail nothing points at any more
        );
        List<String> sibling = List.of("resumes/42/70-aaa-cv.pdf", "resume-thumbs/42/70-" + "a".repeat(64) + ".png", "application-attachments/42/9-d-x.pdf");
        List<String> other = List.of("resumes/43/7-aaa-cv.pdf", "resume-thumbs/43/7-" + "a".repeat(64) + ".png", "application-attachments/43/9-d-x.pdf");
        for (String k : concat(mine, sibling, other)) storage.store(k, new byte[] { 1 }, "application/octet-stream");

        assertThat(eraser.deleteResumeFiles(42L, 7L)).isEqualTo(mine.size());
        for (String k : mine) assertThat(storage.exists(k)).as(k).isFalse();
        for (String k : concat(sibling, other)) assertThat(storage.exists(k)).as(k).isTrue();

        assertThat(eraser.deleteUserFiles(42L)).isEqualTo(sibling.size());
        for (String k : sibling) assertThat(storage.exists(k)).as(k).isFalse();
        for (String k : other) assertThat(storage.exists(k)).as(k).isTrue();
        assertThat(eraser.deleteUserFiles(42L)).as("idempotent").isZero();
    }

    @SafeVarargs
    private static List<String> concat(List<String>... lists) {
        List<String> all = new ArrayList<>();
        for (List<String> l : lists) all.addAll(l);
        return all;
    }
}
