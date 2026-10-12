package com.dossier.api.service.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.ai.guard.AiTruthChecks;
import com.dossier.api.service.ai.guard.AiTruthChecks.Profile;
import com.dossier.api.service.ai.guard.AiTruthChecks.Sources;
import com.dossier.api.service.ai.prompts.Prompt;
import com.dossier.api.service.ai.prompts.resume.ResumePrompts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * The stub's contract (I1.14): each task answers in the shape its service parses, the writing tasks are adversarial in
 * the way the smoke relies on (one acceptable text, one that invents a number), and the two probes work.
 */
class StubAiProviderTest {

    private final StubAiProvider stub = new StubAiProvider("gemini-2.5-flash-lite");
    private final ObjectMapper om = new ObjectMapper();

    private JsonNode json(String text) throws Exception {
        return om.readTree(text);
    }

    private AiResult ask(AiTask task, String question) {
        return stub.generate(task, "m-1", question, "");
    }

    @Test
    void pickAnswersTheLastOptionAndMapsKnownLabels() throws Exception {
        String pick = "Screening question:\nAuthorized?\n\nOptions (choose ONE):\n- Yes\n- No\n";
        assertThat(ask(AiTask.PICK, pick).text()).isEqualTo("No");

        JsonNode map = json(ask(AiTask.MAP, "Task: map...\nVocabulary: a, b\n\nFields:\n1. First name\n2. Your email address\n3. Favourite colour\n\nReply with ONLY a JSON object").text());
        assertThat(map.path("1").asText()).isEqualTo("firstName");
        assertThat(map.path("2").asText()).isEqualTo("email");
        assertThat(map.path("3").asText()).isEqualTo("unknown");
    }

    @Test
    void scoresListEveryIdThePromptNamed() throws Exception {
        JsonNode match = json(ask(AiTask.MATCH, "Resumes:\n[r1] \"A\"\nx\n[r2] \"B\"\ny\n").text());
        assertThat(match.path("scores")).hasSize(2);
        assertThat(match.at("/scores/0/id").asText()).isEqualTo("r1");
        assertThat(match.at("/scores/0/score").asInt()).isGreaterThan(match.at("/scores/1/score").asInt());
        JsonNode jobs = json(ask(AiTask.JOBS, "Jobs:\n[j1] Engineer\n[j2] Analyst\n[j3] Other").text());
        assertThat(jobs.path("scores")).hasSize(3);
    }

    @Test
    void fitIsAFullReport() throws Exception {
        JsonNode fit = json(ask(AiTask.FIT, "Resume \"x\":\nSkills: Java, SQL, Kafka, Docker\n").text());
        assertThat(fit.path("score").isNumber()).isTrue();
        assertThat(fit.path("matched")).extracting(JsonNode::asText).containsExactly("Java", "SQL", "Kafka");
        assertThat(fit.has("missing") && fit.has("redFlags")).isTrue();
    }

    @Test
    void aRewriteGivesAnAcceptableAlternativeAndAnInventedOneThatTheTruthChecksDrop() throws Exception {
        Prompt p = ResumePrompts.get("rewrite.bullets");
        String lines = "[b_one] Built event pipelines handling 1,200 requests per second\n[b_two] Led a team of 4 engineers";
        String rendered = p.render(new LinkedHashMap<>(Map.of("mode", "stronger", "maxChars", "160", "headline", "(none)", "section", "Engineer", "lines", lines)));
        JsonNode changes = json(ask(AiTask.REWRITE, rendered).text()).path("changes");
        assertThat(changes).hasSize(2);

        String original = "Built event pipelines handling 1,200 requests per second";
        Sources src = Sources.of(original + "\nLed a team of 4 engineers").withNumbers(AiTruthChecks.numbers(original)).withBefore(original);
        String good = changes.get(0).path("alternatives").get(0).asText();
        String bad = changes.get(0).path("alternatives").get(1).asText();
        assertThat(AiTruthChecks.check(good, src, Profile.REWRITE)).as("the good alternative passes: %s", good).isEmpty();
        assertThat(AiTruthChecks.check(bad, src, Profile.REWRITE)).extracting(AiTruthChecks.Violation::kind).contains(AiTruthChecks.Kind.NUMBER);

        // the LAST ref carries only the invented text, so a whole change is dropped and the response reports it
        assertThat(changes.get(1).path("alternatives")).hasSize(1);
        assertThat(changes.get(1).at("/alternatives/0").asText()).contains(StubAiProvider.INVENTED_NUMBER);
    }

    @Test
    void aSummaryGivesAnAcceptableVariantAndAnInventedOne() throws Exception {
        Prompt p = ResumePrompts.get("summary.generate");
        String resume = "Role: Engineer at Globex\n  [b_one] Built event pipelines\nSkills: Python, Java, Kafka";
        String rendered = p.render(new LinkedHashMap<>(Map.of("tone", "plain", "maxChars", "400", "headline", "Backend engineer", "target", "(none)", "skills", "Python, Java, Kafka", "resume", resume)));
        JsonNode variants = json(ask(AiTask.SUMMARY, rendered).text()).path("variants");
        Sources src = Sources.of(resume + "\nBackend engineer");
        assertThat(AiTruthChecks.check(variants.get(0).asText(), src, Profile.SUMMARY)).as(variants.get(0).asText()).isEmpty();
        assertThat(AiTruthChecks.check(variants.get(1).asText(), src, Profile.SUMMARY)).isNotEmpty();
    }

    @Test
    void aSuggestionSetHasAGoodCardAndAnInventedOne() throws Exception {
        Prompt p = ResumePrompts.get("resume.suggest");
        String resume = "Role: Engineer at Globex\n  [b_one] Built event pipelines handling 1,200 requests per second\n  [b_two] Led a team of 4 engineers";
        String rendered = p.render(new LinkedHashMap<>(Map.of("max", "4", "gaps", "none", "keywords", "(none)", "jd", "", "resume", resume)));
        JsonNode cards = json(ask(AiTask.SUGGEST, rendered).text()).path("suggestions");
        assertThat(cards).hasSize(2);
        assertThat(cards.at("/0/changes/0/ref").asText()).isEqualTo("b_one");
        assertThat(cards.at("/1/changes/0/after").asText()).contains(StubAiProvider.INVENTED_NUMBER);
    }

    @Test
    void aTailorRewritesTheFirstBulletAndInventsOnTheLast() throws Exception {
        String prompt = "Resume:\n[e0] Engineer at Globex\n  [e0b0] Built the billing service\n  [e0b1] Cut p99 latency by 40%\nSkills: Java, SQL, Kubernetes\n";
        JsonNode t = json(ask(AiTask.TAILOR, prompt).text());
        assertThat(t.path("bullets")).hasSize(2);
        String all = "Built the billing service\nCut p99 latency by 40%";
        Sources src = new Sources(all, Set.of(), AiTruthChecks.numbers(all), Set.of()).withBefore("Built the billing service").withHiringCompany("initech");
        assertThat(AiTruthChecks.check(t.at("/bullets/0/text").asText(), src, Profile.TAILOR)).isEmpty();
        assertThat(t.at("/bullets/1/text").asText()).contains(StubAiProvider.INVENTED_NUMBER);
        assertThat(t.path("skillsOrder")).extracting(JsonNode::asText).containsExactly("Kubernetes", "SQL", "Java");
    }

    @Test
    void parseReturnsACanonicalResumeWithTheEmailFromTheText() throws Exception {
        AiResult r = stub.parseResume("m-1", "Grace Hopper\ngrace@navy.example\nCOBOL", null, null);
        JsonNode j = json(r.text());
        assertThat(j.path("experience")).isNotEmpty();
        assertThat(j.at("/bio/email").asText()).isEqualTo("grace@navy.example");
        assertThat(r.model()).isEqualTo("m-1");
        assertThat(r.inputTokens()).isPositive();
        assertThat(r.outputTokens()).isPositive();
    }

    @Test
    void theSensitiveProbeFiresOnlyWhenAValueReachedTheProvider() {
        assertThat(ask(AiTask.DRAFT, "Tell me about yourself").text()).doesNotContain(StubAiProvider.SAW_SENSITIVE);
        assertThat(ask(AiTask.DRAFT, "My SSN is 123-45-6789").text()).contains(StubAiProvider.SAW_SENSITIVE);
        assertThat(stub.parseResume("m", "SSN 123-45-6789", null, null).text()).contains(StubAiProvider.SAW_SENSITIVE);
    }

    @Test
    void theFailMarkerFailsTheCallAs503() {
        assertThatThrownBy(() -> ask(AiTask.DRAFT, "please " + StubAiProvider.FAIL_MARKER))
            .isInstanceOfSatisfying(AiProviderException.class, e -> assertThat(e.httpStatus()).isEqualTo(503));
    }

    @Test
    void probeAnswersOk() {
        assertThat(stub.generateWithTimeout(AiTask.PROBE, "", "Reply with exactly: OK", "", 16, 15_000).text()).isEqualTo("OK");
        assertThat(stub.isConfigured()).isTrue();
        assertThat(stub.defaultModel()).isEqualTo("gemini-2.5-flash-lite");
    }
}
