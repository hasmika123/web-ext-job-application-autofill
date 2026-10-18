package com.dossier.api.service.resume;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

/** Loads {@code src/test/resources/resume-doc/*} (shared byte-for-byte with the TypeScript port). */
final class Fixtures {

    private Fixtures() {}

    static String text(String name) {
        try (InputStream in = Fixtures.class.getResourceAsStream("/resume-doc/" + name)) {
            if (in == null) throw new IllegalStateException("Missing fixture " + name);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static JsonNode doc(String name) {
        return ResumeDocument.parse(text(name));
    }
}
