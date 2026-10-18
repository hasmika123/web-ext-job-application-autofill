package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.resume.ResumeDocumentSeeder.KeepMask;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** {@link ResumeDocumentSeeder#fromStructured}: a parsed upload becomes a valid document (R2.6). */
class ResumeDocumentSeederFromStructuredTest {

    private static final Instant NOW = Instant.parse("2026-10-12T10:00:00Z");

    private static final String STRUCTURED =
        "{\"summary\":\"Backend engineer.\",\"skills\":[\"Java\",\"SQL\"]," +
        "\"experience\":[" +
        "{\"company\":\"Acme\",\"title\":\"Engineer\",\"location\":\"NYC\",\"startDate\":\"Jan 2020\",\"endDate\":\"Present\",\"current\":false,\"bullets\":[\"Built things\",\"Shipped\"]}," +
        "{\"company\":\"Globex\",\"title\":\"Intern\",\"location\":\"\",\"startDate\":\"2018\",\"endDate\":\"2019\",\"current\":false,\"bullets\":[\"Learned\"]}]," +
        "\"education\":[{\"school\":\"MIT\",\"degree\":\"BS\",\"field\":\"CS\",\"startDate\":\"2014\",\"endDate\":\"2018\",\"gpa\":\"\",\"location\":\"\"}]," +
        "\"languages\":[{\"name\":\"English\",\"proficiency\":\"Native\"}]," +
        "\"projects\":[{\"name\":\"Side thing\",\"bullets\":[\"Made it\"]}]}";

    private static JsonNode parse(String s) {
        return ResumeDocument.parse(s);
    }

    private static JsonNode section(JsonNode doc, String kind) {
        for (JsonNode s : doc.get("sections")) if (kind.equals(s.get("kind").asText())) return s;
        return null;
    }

    @Test
    void buildsEverySectionAndPassesTheValidator() {
        JsonNode doc = ResumeDocumentSeeder.fromStructured("My CV", "Backend", parse(STRUCTURED), parse("{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\",\"email\":\"ada@x.io\"}"), null, null, NOW);
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
        assertThat(doc.at("/meta/title").asText()).isEqualTo("My CV");
        assertThat(doc.at("/basics/name").asText()).isEqualTo("Ada Lovelace");
        assertThat(doc.at("/sections/0/kind").asText()).as("the summary leads").isEqualTo("SUMMARY");
        assertThat(section(doc, "SUMMARY").at("/items/0/text").asText()).isEqualTo("Backend engineer.");
        assertThat(section(doc, "EXPERIENCE").get("items")).hasSize(2);
        assertThat(section(doc, "EXPERIENCE").at("/items/0/start").asText()).isEqualTo("2020-01");
        assertThat(section(doc, "EXPERIENCE").at("/items/0/current").asBoolean()).isTrue();
        assertThat(section(doc, "EXPERIENCE").at("/items/0/bullets/0/src").asText()).isEqualTo("parsed");
        assertThat(section(doc, "EDUCATION").get("items")).hasSize(1);
        assertThat(section(doc, "SKILLS").at("/items/0/skills")).hasSize(2);
        assertThat(section(doc, "LANGUAGES").get("items")).hasSize(1);
        assertThat(section(doc, "PROJECTS").get("items")).hasSize(1);
    }

    @Test
    void theUsersOwnBioWinsOverTheFilesHeader() {
        JsonNode doc = ResumeDocumentSeeder.fromStructured(
            "CV",
            null,
            parse(STRUCTURED),
            parse("{\"firstName\":\"File\",\"lastName\":\"Name\",\"email\":\"file@x.io\",\"phone\":\"555-1\"}"),
            parse("{\"firstName\":\"Real\",\"lastName\":\"Person\",\"email\":\"\"}"),
            null,
            NOW
        );
        assertThat(doc.at("/basics/name").asText()).isEqualTo("Real Person");
        assertThat(doc.at("/basics/email").asText()).as("a blank own value does not erase the file's").isEqualTo("file@x.io");
        assertThat(doc.at("/basics/phone").asText()).isEqualTo("555-1");
    }

    @Test
    void theKeepMaskLeavesUntickedItemsOut() {
        KeepMask keep = new KeepMask(Set.of(1), Set.of(), null, false, false);
        JsonNode doc = ResumeDocumentSeeder.fromStructured("CV", null, parse(STRUCTURED), null, null, keep, NOW);
        assertThat(section(doc, "EXPERIENCE").get("items")).hasSize(1);
        assertThat(section(doc, "EXPERIENCE").at("/items/0/org").asText()).isEqualTo("Globex");
        assertThat(section(doc, "EDUCATION")).isNull();
        assertThat(section(doc, "SKILLS")).isNull();
        assertThat(section(doc, "SUMMARY")).isNull();
        assertThat(section(doc, "PROJECTS")).isNotNull();
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
    }

    @Test
    void anEmptyStructureStillGivesAValidHeaderOnlyDocument() {
        JsonNode doc = ResumeDocumentSeeder.fromStructured("CV", null, parse("{}"), null, null, null, NOW);
        assertThat(doc.get("sections")).isEmpty();
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
    }
}
