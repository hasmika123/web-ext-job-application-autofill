package com.dossier.api.service.ent.mkt.tailor;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** The tailoring score without AI (MKT-TAILOR-BUILD.md): whole-word coverage of the job's terms, before, per change and after. */
class KeywordCoverageTest {

    static JsonNode resume() throws Exception {
        return new ObjectMapper().readTree("""
            {"summary":"Backend engineer building Java services on AWS.","skills":["Java","Spring Boot","PostgreSQL"],
             "experience":[{"title":"Senior Engineer","company":"Acme","bullets":["Built REST APIs in Java","Cut latency 30% with caching"]}],
             "projects":[{"name":"Kit","bullets":["Go tooling for the build"]}]}
            """);
    }

    @Test
    void termsAreTheJobSkillsThenTheMissingKeywordsWithoutDuplicates() {
        assertThat(KeywordCoverage.terms(List.of("Java", " kubernetes ", "JAVA", ""), List.of("Kafka", "kubernetes", "x".repeat(70))))
            .containsExactly("Java", "kubernetes", "Kafka");
    }

    @Test
    void aTermCountsOnlyAsAWholeWordOrPhrase() throws Exception {
        String text = KeywordCoverage.text(resume());
        assertThat(KeywordCoverage.covers(text, "java")).isTrue();
        assertThat(KeywordCoverage.covers(text, "Spring Boot")).isTrue();
        assertThat(KeywordCoverage.covers(text, "AWS")).isTrue();
        assertThat(KeywordCoverage.covers(text, "Go")).as("the project bullet says Go").isTrue();
        assertThat(KeywordCoverage.covers("good engineer", "go")).isFalse();
        assertThat(KeywordCoverage.covers("c++ and node.js", "C++")).isTrue();
        assertThat(KeywordCoverage.covers("c and node.js", "C++")).isFalse();
        assertThat(KeywordCoverage.covers(text, "Kubernetes")).isFalse();
    }

    @Test
    void theScoreIsTheShareOfTermsCovered() throws Exception {
        String text = KeywordCoverage.text(resume());
        List<String> terms = List.of("Java", "AWS", "Kubernetes", "Kafka");
        Set<String> before = KeywordCoverage.covered(text, terms);
        assertThat(before).containsExactly("Java", "AWS");
        assertThat(KeywordCoverage.percent(before, terms)).isEqualTo(50);
        assertThat(KeywordCoverage.percent(Set.of(), List.of())).as("a job with no terms has no score").isNull();
    }

    @Test
    void aChangeAddsOnlyTermsTheResumeDidNotCoverAlready() throws Exception {
        String text = KeywordCoverage.text(resume());
        List<String> terms = List.of("Java", "Kubernetes", "Kafka");
        assertThat(KeywordCoverage.adds(text, "Built REST APIs in Java", "Built REST APIs in Java on Kubernetes", terms)).containsExactly("Kubernetes");
        assertThat(KeywordCoverage.adds(text, "x", "Java again", terms)).as("Java was covered already").isEmpty();
    }
}
