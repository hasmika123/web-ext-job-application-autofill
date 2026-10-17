package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * The shared template sample ({@code docs/resume-builder/templates/sample-resume.json}, copied to the web UI package as
 * {@code sample-resume.json}) is a valid schema 2 document. The web side renders it; this keeps the server validator in
 * agreement. Skipped when the docs folder is not beside the api module (a packaged build).
 */
class SampleResumeFixtureTest {

    private static final Path SAMPLE = Path.of("..", "docs", "resume-builder", "templates", "sample-resume.json");

    @Test
    void theSampleResumePassesTheDocumentValidator() throws IOException {
        assumeTrue(Files.exists(SAMPLE), "docs folder not found next to the api module");
        JsonNode doc = ResumeDocument.parse(Files.readString(SAMPLE));
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
    }
}
