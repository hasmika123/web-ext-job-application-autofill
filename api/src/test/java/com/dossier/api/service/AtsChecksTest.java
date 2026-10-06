package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** The fifteen deterministic ATS checks (Phase 13.5) — each rule, pass and fail. */
class AtsChecksTest {

    private final ObjectMapper om = new ObjectMapper();

    private static final String STRONG =
        "{\"summary\":\"Backend engineer who builds event-driven Java services for payments and logistics teams, with a focus on reliability, observability and cost at scale.\"," +
        "\"skills\":[\"Java\",\"Kafka\",\"Spring Boot\",\"PostgreSQL\",\"AWS\",\"Terraform\"]," +
        "\"experience\":[" +
        "{\"company\":\"Globex\",\"title\":\"Senior Engineer\",\"startDate\":\"Jan 2021\",\"current\":true,\"bullets\":[" +
        "\"Built Kafka pipelines handling 1,200 requests per second across 3 regions\",\"Led a team of 4 engineers through a zero-downtime migration\"," +
        "\"Reduced p99 latency by 40% by rewriting the caching layer\"]}," +
        "{\"company\":\"Initech\",\"title\":\"Engineer\",\"startDate\":\"2018\",\"endDate\":\"2020\",\"bullets\":[" +
        "\"Designed the billing service used by 2 million customers\",\"Automated deploys, cutting release time from a day to an hour\"]}]," +
        "\"education\":[{\"school\":\"State University\",\"degree\":\"BS\",\"field\":\"Computer Science\"}]}";

    private Map<String, AtsChecks.Check> run(String json, boolean hasFile) throws Exception {
        JsonNode p = om.readTree(json);
        return AtsChecks.run(p, hasFile).stream().collect(Collectors.toMap(AtsChecks.Check::id, c -> c));
    }

    @Test
    void thereAreFifteenChecksWeighingOneHundred() throws Exception {
        List<AtsChecks.Check> checks = AtsChecks.run(om.readTree(STRONG), true);
        assertThat(checks).hasSize(15);
        assertThat(checks.stream().mapToInt(AtsChecks.Check::weight).sum()).isEqualTo(AtsChecks.TOTAL_WEIGHT);
    }

    @Test
    void aStrongResumePassesEverything() throws Exception {
        Map<String, AtsChecks.Check> c = run(STRONG, true);
        assertThat(c.values().stream().filter(x -> !x.passed()).map(AtsChecks.Check::id)).isEmpty();
        assertThat(AtsChecks.passedWeight(List.copyOf(c.values()))).isEqualTo(100);
    }

    @Test
    void anEmptyResumeFailsWithHelpfulDetail() throws Exception {
        Map<String, AtsChecks.Check> c = run("{}", false);
        assertThat(c.values()).noneMatch(AtsChecks.Check::passed);
        assertThat(c.get("experience").detail()).contains("No roles");
        assertThat(c.get("file").detail()).contains("Upload");
    }

    @Test
    void measurableResultsNeedAThirdOfBulletsWithANumber() throws Exception {
        String few = STRONG.replace("handling 1,200 requests per second across 3 regions", "handling heavy traffic")
            .replace("of 4 engineers", "of engineers").replace("p99 latency by 40%", "latency a lot").replace("by 2 million customers", "by customers")
            .replace("from a day to an hour", "significantly");
        AtsChecks.Check r = run(few, true).get("results");
        assertThat(r.passed()).isFalse();
        assertThat(r.detail()).contains("0 of 5");
    }

    @Test
    void dutiesAndFirstPersonAreCaught() throws Exception {
        String weak = STRONG.replace("Built Kafka pipelines", "Responsible for Kafka pipelines").replace("Led a team", "I led my team");
        Map<String, AtsChecks.Check> c = run(weak, true);
        assertThat(c.get("action-verbs").passed()).isFalse();
        assertThat(c.get("action-verbs").detail()).contains("Responsible for");
        assertThat(c.get("no-first-person").passed()).isFalse();
    }

    @Test
    void aRoleEndingBeforeItStartsIsCaught() throws Exception {
        String bad = STRONG.replace("\"startDate\":\"2018\",\"endDate\":\"2020\"", "\"startDate\":\"03/2020\",\"endDate\":\"Jan 2019\"");
        assertThat(run(bad, true).get("dates-consistent").passed()).isFalse();
    }

    @Test
    void datesAreReadInCommonShapes() {
        assertThat(AtsChecks.monthIndex("2021-03")).isEqualTo(2021 * 12 + 2);
        assertThat(AtsChecks.monthIndex("03/2021")).isEqualTo(2021 * 12 + 2);
        assertThat(AtsChecks.monthIndex("March 2021")).isEqualTo(2021 * 12 + 2);
        assertThat(AtsChecks.monthIndex("2021")).isEqualTo(2021 * 12);
        assertThat(AtsChecks.monthIndex("sometime")).isNull();
    }

    @Test
    void skillsMustBeListedButNotStuffed() throws Exception {
        assertThat(run(STRONG.replace("\"Terraform\"", "\"Terraform\"" + ",\"x\"".repeat(40)), true).get("skills-focus").passed()).isFalse();
        assertThat(run(STRONG.replace("[\"Java\",\"Kafka\",\"Spring Boot\",\"PostgreSQL\",\"AWS\",\"Terraform\"]", "[\"Java\"]"), true).get("skills").passed()).isFalse();
    }

    @Test
    void actionVerbsAreRecognisedPastBulletMarks() {
        assertThat(AtsChecks.startsWithActionVerb("• Built the thing")).isTrue();
        assertThat(AtsChecks.startsWithActionVerb("Worked on the thing")).isFalse();
    }
}
