package com.dossier.api.service.ent.mkt.tailor;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.resume.ResumeDocumentProjector;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Writing a tailoring proposal into a builder document (MKT-TAILOR-BUILD.md): a ref lands on the same text the structured view named, hidden and empty
 * entries are counted the same way, a text that moved on is left alone, and ticked additions go into the first visible skills list.
 */
class TailoredDocTest {

    static ObjectNode doc() throws Exception {
        return (ObjectNode) new ObjectMapper().readTree("""
            {"version":2,"sections":[
              {"id":"s0","kind":"SUMMARY","items":[{"id":"i0","text":"Backend engineer."}]},
              {"id":"s1","kind":"EXPERIENCE","items":[
                {"id":"hidden","hidden":true,"title":"Old","org":"Gone","bullets":[{"id":"b0","text":"never counted"}]},
                {"id":"empty","title":"","org":"","bullets":[]},
                {"id":"r0","title":"Senior Engineer","org":"Acme","bullets":[{"id":"b1","text":"Built APIs"},{"id":"b2","text":""},{"id":"b3","text":"Cut latency"}]},
                {"id":"r1","title":"Engineer","org":"Beta","bullets":[{"id":"b4","text":"Wrote tests"}]}
              ]},
              {"id":"s2","kind":"SKILLS","items":[{"id":"k0","skills":["Java","Spring"]}]}
            ]}
            """);
    }

    @Test
    void refsLandOnTheTextTheStructuredViewNamed() throws Exception {
        ObjectNode d = doc();
        JsonNode structured = ResumeDocumentProjector.toStructured(d);
        Map<String, String> originals = MktTailorService.originals(structured);
        assertThat(originals).containsEntry("e0b1", "Cut latency").containsEntry("e1b0", "Wrote tests").containsEntry("summary", "Backend engineer.");

        TailoredDoc.Outcome o = TailoredDoc.apply(d, List.of(
            new TailoredDoc.Edit("e0b1", "Cut latency", "Cut p99 latency by caching hot reads"),
            new TailoredDoc.Edit("e1b0", "Wrote tests", "Wrote integration tests in JUnit"),
            new TailoredDoc.Edit("summary", "Backend engineer.", "Backend engineer focused on platform reliability.")
        ), List.of());
        assertThat(o.applied()).containsExactly("e0b1", "e1b0", "summary");
        JsonNode after = ResumeDocumentProjector.toStructured(d);
        assertThat(after.path("experience").path(0).path("bullets").path(1).asText()).isEqualTo("Cut p99 latency by caching hot reads");
        assertThat(after.path("experience").path(1).path("bullets").path(0).asText()).isEqualTo("Wrote integration tests in JUnit");
        assertThat(after.path("summary").asText()).isEqualTo("Backend engineer focused on platform reliability.");
        assertThat(d.at("/sections/1/items/0/bullets/0/text").asText()).as("a hidden role is never touched").isEqualTo("never counted");
    }

    @Test
    void aTextThatMovedOnIsLeftAlone() throws Exception {
        ObjectNode d = doc();
        TailoredDoc.Outcome o = TailoredDoc.apply(d, List.of(new TailoredDoc.Edit("e0b0", "Built REST APIs", "Built REST APIs on Kubernetes"), new TailoredDoc.Edit("e9b0", "x", "y")), List.of());
        assertThat(o.applied()).isEmpty();
        assertThat(o.skipped()).containsExactly("e0b0", "e9b0");
        assertThat(d.at("/sections/1/items/2/bullets/0/text").asText()).isEqualTo("Built APIs");
    }

    @Test
    void tickedAdditionsGoIntoTheFirstSkillsListOnce() throws Exception {
        ObjectNode d = doc();
        TailoredDoc.Outcome o = TailoredDoc.apply(d, List.of(), List.of("Kubernetes", "java", " "));
        assertThat(o.added()).containsExactly("Kubernetes", "java");
        assertThat(d.at("/sections/2/items/0/skills").toString()).isEqualTo("[\"Java\",\"Spring\",\"Kubernetes\"]");
        ObjectNode noSkills = doc();
        ((com.fasterxml.jackson.databind.node.ArrayNode) noSkills.get("sections")).remove(2);
        assertThat(TailoredDoc.apply(noSkills, List.of(), List.of("Kafka")).notAdded()).containsExactly("Kafka");
    }

    @Test
    void theEditsOfAStoredProposalAreOnlyTheKeptOnes() throws Exception {
        JsonNode proposal = new ObjectMapper().readTree("{\"summary\":\"New summary\",\"bullets\":[{\"ref\":\"e0b0\",\"text\":\"A\"},{\"ref\":\"e0b1\",\"text\":\"B\"}],\"skillsOrder\":[\"x\"]}");
        List<TailoredDoc.Edit> edits = TailoredDoc.edits(proposal, Set.of("e0b1", "summary"), Map.of("summary", "Old", "e0b1", "Cut latency"));
        assertThat(edits).extracting(TailoredDoc.Edit::ref).containsExactly("summary", "e0b1");
        assertThat(edits.get(1).before()).isEqualTo("Cut latency");
    }
}
