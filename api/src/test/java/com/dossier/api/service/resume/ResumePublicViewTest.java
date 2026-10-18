package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** What a link holder or grantee receives of a document (R3.11): the content a template draws, not the owner's working notes. */
class ResumePublicViewTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static JsonNode doc() throws Exception {
        return OM.readTree(
            "{\"schema\":2,\"meta\":{\"title\":\"Backend\",\"target\":\"Staff engineer at Acme\",\"language\":\"en\"," +
            "\"profileSyncedAt\":\"2026-10-01T00:00:00Z\",\"originalFileKey\":\"resumes/7/orig.pdf\"," +
            "\"tailoredFrom\":{\"resumeId\":3,\"jobTitle\":\"Staff engineer\"}}," +
            "\"basics\":{\"name\":\"Ada Lovelace\",\"email\":\"ada@example.com\",\"photo\":{\"key\":\"resume-photos/7/p.jpg\"}}," +
            "\"sections\":[{\"id\":\"s1\",\"kind\":\"SUMMARY\",\"items\":[{\"id\":\"i1\",\"text\":\"Engineer\"}]}]}"
        );
    }

    @Test
    void removesTheOwnersWorkingNotesAndKeepsTheContent() throws Exception {
        JsonNode out = ResumePublicView.scrub(doc());
        assertThat(out.at("/meta/target").isMissingNode()).isTrue();
        assertThat(out.at("/meta/tailoredFrom").isMissingNode()).isTrue();
        assertThat(out.at("/meta/profileSyncedAt").isMissingNode()).isTrue();
        assertThat(out.at("/meta/originalFileKey").isMissingNode()).isTrue();
        assertThat(out.at("/basics/photo").isMissingNode()).isTrue();
        assertThat(out.at("/meta/title").asText()).isEqualTo("Backend");
        assertThat(out.at("/meta/language").asText()).isEqualTo("en");
        assertThat(out.at("/basics/name").asText()).isEqualTo("Ada Lovelace");
        assertThat(out.at("/basics/email").asText()).isEqualTo("ada@example.com");
        assertThat(out.at("/sections/0/items/0/text").asText()).isEqualTo("Engineer");
        assertThat(out.toString()).doesNotContain("resume-photos").doesNotContain("Acme").doesNotContain("resumes/7");
    }

    @Test
    void neverModifiesTheInput() throws Exception {
        JsonNode in = doc();
        String before = in.toString();
        ResumePublicView.scrub(in);
        assertThat(in.toString()).isEqualTo(before);
    }

    @Test
    void toleratesOddDocuments() {
        assertThat(ResumePublicView.scrub(null)).isNull();
        JsonNode text = OM.getNodeFactory().textNode("x");
        assertThat(ResumePublicView.scrub(text)).isSameAs(text);
        JsonNode bare = OM.createObjectNode();
        assertThat(ResumePublicView.scrub(bare).toString()).isEqualTo("{}");
    }
    @Test
    void anEditorWhoIsNotTheOwnerGetsTheWholeDocumentWithoutAnyStorageKey() throws Exception {
        JsonNode input = OM.readTree(
            "{\"meta\":{\"title\":\"Backend\",\"target\":\"Staff\",\"originalFileKey\":\"resume-originals/7/1-o.pdf\",\"language\":\"en\"}," +
            "\"basics\":{\"name\":\"Ada\",\"photo\":{\"key\":\"resume-photos/7/1-p.png\",\"updatedAt\":\"2026-10-01T00:00:00Z\"}}," +
            "\"sections\":[{\"id\":\"s1\",\"kind\":\"SUMMARY\",\"items\":[{\"id\":\"i1\",\"text\":\"resumes/are/good\",\"attachmentKey\":\"application-attachments/7/2-x.pdf\",\"fileKey\":\"not-a-storage-key\"}]}]}"
        );
        String before = input.toString();
        JsonNode out = ResumePublicView.withoutStorageKeys(input);
        assertThat(out.toString()).doesNotContain("resume-originals").doesNotContain("resume-photos").doesNotContain("application-attachments").doesNotContain("originalFileKey");
        // the content, the owner's notes (target) and the photo OBJECT (without its key) stay: the editor still needs them
        assertThat(out.at("/meta/target").asText()).isEqualTo("Staff");
        assertThat(out.at("/basics/photo/updatedAt").asText()).isEqualTo("2026-10-01T00:00:00Z");
        assertThat(out.at("/basics/photo/key").isMissingNode()).isTrue();
        // a user's own text that merely looks like a path is content, never removed; only fields NAMED like a key that hold a storage key go
        assertThat(out.at("/sections/0/items/0/text").asText()).isEqualTo("resumes/are/good");
        assertThat(out.at("/sections/0/items/0/fileKey").asText()).isEqualTo("not-a-storage-key");
        assertThat(out.at("/sections/0/items/0/attachmentKey").isMissingNode()).isTrue();
        assertThat(input.toString()).as("the input is never modified").isEqualTo(before);
        JsonNode text = OM.getNodeFactory().textNode("x");
        assertThat(ResumePublicView.withoutStorageKeys(text)).isSameAs(text);
    }
}
