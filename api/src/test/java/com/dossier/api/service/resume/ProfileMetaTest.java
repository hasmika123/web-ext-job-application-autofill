package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.resume.ProfileMeta.OnboardingCard;
import com.dossier.api.service.resume.ProfileMeta.OnboardingMeta;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** {@code bio.meta_json}: tolerant reads, the provenance stamps, and the onboarding markers (Onboarding v2 R1.8, DESIGN 8.2). */
class ProfileMetaTest {

    private static final Instant T = Instant.parse("2026-10-12T10:00:00Z");

    @Test
    void damagedOrEmptyJsonReadsAsEmpty() {
        assertThat(ProfileMeta.read(null)).isEmpty();
        assertThat(ProfileMeta.read("  ")).isEmpty();
        assertThat(ProfileMeta.read("{not json")).isEmpty();
        assertThat(ProfileMeta.read("[1,2]")).isEmpty();
    }

    @Test
    void provenanceStampsAndUnstamps() {
        ObjectNode meta = ProfileMeta.read(null);
        ProfileMeta.stamp(meta, List.of("firstName", "city"), "user");
        assertThat(ProfileMeta.sourceOf(meta, "city")).isEqualTo("user");
        ProfileMeta.unstamp(meta, List.of("city"));
        assertThat(ProfileMeta.sourceOf(meta, "city")).isNull();
    }

    @Test
    void missingOnboardingReadsAsEmpty() {
        OnboardingMeta o = ProfileMeta.onboarding(ProfileMeta.read(null));
        assertThat(o).isEqualTo(OnboardingMeta.empty());
        assertThat(o.card()).isEqualTo(OnboardingCard.empty());
    }

    @Test
    void onboardingRoundTrips() {
        ObjectNode meta = ProfileMeta.read(null);
        OnboardingMeta written = new OnboardingMeta("student", T, T.plusSeconds(60), "web", new OnboardingCard(T, T.plusSeconds(5), 2, T.plusSeconds(9)));

        ProfileMeta.putOnboarding(meta, written);
        OnboardingMeta back = ProfileMeta.onboarding(ProfileMeta.read(ProfileMeta.write(meta)));

        assertThat(back).isEqualTo(written);
    }

    @Test
    void theWrittenShapeIsTheDesignedOne() {
        ObjectNode meta = ProfileMeta.read(null);
        ProfileMeta.putOnboarding(meta, OnboardingMeta.empty().withPersona("switching").withStarted(T, "web"));

        assertThat(meta.at("/onboarding/persona").asText()).isEqualTo("switching");
        assertThat(meta.at("/onboarding/startedAt").asText()).isEqualTo("2026-10-12T10:00:00Z");
        assertThat(meta.at("/onboarding/finishedAt").isNull()).isTrue();
        assertThat(meta.at("/onboarding/source").asText()).isEqualTo("web");
        assertThat(meta.at("/onboarding/card/dismissedAt").isNull()).isTrue();
        assertThat(meta.at("/onboarding/card/snoozedUntil").isNull()).isTrue();
        assertThat(meta.at("/onboarding/card/resurfaceCount").asInt()).isZero();
    }

    @Test
    void unknownKeysSurviveEveryRewrite() {
        ObjectNode meta = ProfileMeta.read(
            "{\"future\":{\"a\":1},\"provenance\":{\"city\":\"user\"},\"onboarding\":{\"persona\":\"student\",\"someLaterKey\":7,\"card\":{\"resurfaceCount\":1,\"cardLaterKey\":\"x\"}}}"
        );

        OnboardingMeta o = ProfileMeta.onboarding(meta);
        ProfileMeta.putOnboarding(meta, o.withPersona("experienced").withCard(new OnboardingCard(T, null, 1, null)));
        ObjectNode again = ProfileMeta.read(ProfileMeta.write(meta));

        assertThat(again.at("/future/a").asInt()).isEqualTo(1);
        assertThat(again.at("/provenance/city").asText()).isEqualTo("user");
        assertThat(again.at("/onboarding/someLaterKey").asInt()).isEqualTo(7);
        assertThat(again.at("/onboarding/card/cardLaterKey").asText()).isEqualTo("x");
        assertThat(again.at("/onboarding/persona").asText()).isEqualTo("experienced");
    }

    @Test
    void completenessAndOnboardingDoNotDisturbEachOther() {
        ObjectNode meta = ProfileMeta.read(null);
        ProfileMeta.putOnboarding(meta, OnboardingMeta.empty().withPersona("student"));
        ProfileMeta.putCompleteness(meta, new ProfileCompleteness.Result(42, java.util.Map.of(), null), T);

        assertThat(meta.at("/completeness/score").asInt()).isEqualTo(42);
        assertThat(ProfileMeta.onboarding(meta).persona()).isEqualTo("student");
    }

    @Test
    void wronglyTypedOrBadValuesReadAsAbsent() {
        ObjectNode meta = ProfileMeta.read(
            "{\"onboarding\":{\"persona\":5,\"startedAt\":\"yesterday\",\"finishedAt\":12,\"source\":\"\",\"card\":{\"dismissedAt\":\"nope\",\"resurfaceCount\":-4}}}"
        );
        OnboardingMeta o = ProfileMeta.onboarding(meta);

        assertThat(o.persona()).isNull();
        assertThat(o.startedAt()).isNull();
        assertThat(o.finishedAt()).isNull();
        assertThat(o.source()).isNull();
        assertThat(o.card().dismissedAt()).isNull();
        assertThat(o.card().resurfaceCount()).isZero();

        ObjectNode notAnObject = ProfileMeta.read("{\"onboarding\":\"x\"}");
        assertThat(ProfileMeta.onboarding(notAnObject)).isEqualTo(OnboardingMeta.empty());
    }
}
