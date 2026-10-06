package com.dossier.api.service.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/**
 * The Gemini wire format, without a network (Phase 13.1a): each task is sent with instructions
 * written for it, and a response's {@code usageMetadata} becomes the token counts the ledger prices.
 */
class GeminiAiProviderTest {

    private final GeminiAiProvider gemini = new GeminiAiProvider("https://example.test/v1beta", "gemini-2.5-flash-lite", "k", 400, 4000);

    private static String systemText(ObjectNode body) {
        return body.path("systemInstruction").path("parts").path(0).path("text").asText();
    }

    private static String userText(ObjectNode body) {
        return body.path("contents").path(0).path("parts").path(0).path("text").asText();
    }

    @Test
    void aDraftKeepsItsFramingAndPrompt() {
        ObjectNode body = gemini.generateBody(AiTask.DRAFT, "Why us?", "Backend engineer.");
        assertThat(systemText(body)).isEqualTo(AiProvider.SYSTEM_PROMPT);
        assertThat(userText(body)).startsWith("Question:\nWhy us?").contains("Candidate background:\nBackend engineer.").endsWith("Write the answer:");
    }

    @Test
    void otherTasksAreSentAsTheirOwnInstruction() {
        for (AiTask t : new AiTask[] { AiTask.PICK, AiTask.MAP, AiTask.ENRICH }) {
            ObjectNode body = gemini.generateBody(t, "Map these labels: 1. First name", "");
            // Not the drafting prompt: its "2-4 sentences" fought the formats these tasks ask for.
            assertThat(systemText(body)).isEqualTo(AiProvider.INSTRUCTION_SYSTEM_PROMPT);
            assertThat(userText(body)).isEqualTo("Map these labels: 1. First name");
        }
    }

    @Test
    void usageIsReadAndSplitForPricing() {
        String json = """
            {"candidates":[{"content":{"parts":[{"text":"Hello"},{"text":" there"}]}}],
             "usageMetadata":{"promptTokenCount":1000,"cachedContentTokenCount":600,"candidatesTokenCount":40,"thoughtsTokenCount":10,"totalTokenCount":1050},
             "modelVersion":"gemini-2.5-flash-lite-001"}
            """;
        AiResult r = gemini.toResult(json);
        assertThat(r.text()).isEqualTo("Hello there");
        assertThat(r.inputTokens()).as("cached tokens are priced separately").isEqualTo(400);
        assertThat(r.cachedTokens()).isEqualTo(600);
        assertThat(r.outputTokens()).as("thinking is billed as output").isEqualTo(50);
        assertThat(r.model()).as("the model that actually answered").isEqualTo("gemini-2.5-flash-lite-001");
    }

    @Test
    void missingUsageIsZeroAndTheConfiguredModelIsUsed() {
        AiResult r = gemini.toResult("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"ok\"}]}}]}");
        assertThat(r.text()).isEqualTo("ok");
        assertThat(r.inputTokens() + r.cachedTokens() + r.outputTokens()).isZero();
        assertThat(r.model()).isEqualTo("gemini-2.5-flash-lite");
    }

    @Test
    void thoughtPartsAreNotTheAnswer() {
        String json = "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"reasoning…\",\"thought\":true},{\"text\":\"Answer\"}]}}]}";
        assertThat(gemini.toResult(json).text()).isEqualTo("Answer");
    }

    @Test
    void unknownTasksAreDrafts() {
        assertThat(AiTask.fromWire(null)).isEqualTo(AiTask.DRAFT);
        assertThat(AiTask.fromWire("nonsense")).isEqualTo(AiTask.DRAFT);
        assertThat(AiTask.fromWire(" PICK ")).isEqualTo(AiTask.PICK);
        assertThat(AiTask.fromWire("parse")).as("parse has its own endpoint").isEqualTo(AiTask.DRAFT);
    }
}
