package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ent.EnterpriseAllowList.State;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** X1.11: the per-organization enterprise switch edits the flag's lists without ever switching anybody else on. */
class EnterpriseAllowListTest {

    private static State parse(String json) throws Exception {
        return State.parse(new ObjectMapper().readTree(json));
    }

    @Test
    void anAbsentOrMalformedFlagReadsAsOffWithEmptyLists() throws Exception {
        assertThat(State.parse(null)).isEqualTo(new State(false, 0, Set.of(), Set.of()));
        assertThat(parse("{\"on\":\"yes\"}").on()).isFalse();
    }

    @Test
    void onFromADarkFlagMakesAPilotOfJustThatOrganization() throws Exception {
        State after = EnterpriseAllowList.turnOn(parse("{\"on\":false,\"pct\":0,\"allow\":[],\"deny\":[]}"), 7);
        assertThat(after.on()).isTrue();
        assertThat(after.allow()).containsExactly(7L);
        assertThat(after.everyone()).isFalse();
    }

    @Test
    void onAddsToAnExistingPilotAndLiftsADeny() throws Exception {
        State after = EnterpriseAllowList.turnOn(parse("{\"on\":true,\"pct\":0,\"allow\":[3],\"deny\":[7]}"), 7);
        assertThat(after.allow()).containsExactly(3L, 7L);
        assertThat(after.deny()).isEmpty();
    }

    @Test
    void onWhenTheFlagIsAlreadyOnForEveryoneChangesNothing() throws Exception {
        State before = parse("{\"on\":true,\"pct\":0,\"allow\":[],\"deny\":[]}");
        assertThat(EnterpriseAllowList.turnOn(before, 7)).isEqualTo(before);
    }

    @Test
    void onForADeniedOrganizationUnderAnEveryoneFlagOnlyLiftsTheDeny() throws Exception {
        State after = EnterpriseAllowList.turnOn(parse("{\"on\":true,\"pct\":0,\"allow\":[],\"deny\":[7]}"), 7);
        assertThat(after.allow()).isEmpty();
        assertThat(after.deny()).isEmpty();
        assertThat(after.everyone()).isTrue();
    }

    @Test
    void offRemovesFromTheAllowListAndKeepsTheRestOfThePilot() throws Exception {
        State after = EnterpriseAllowList.turnOff(parse("{\"on\":true,\"pct\":0,\"allow\":[3,7],\"deny\":[]}"), 7);
        assertThat(after.allow()).containsExactly(3L);
        assertThat(after.deny()).isEmpty();
    }

    @Test
    void offOfTheLastPilotOrganizationDeniesItSoTheFlagDoesNotFallThroughToEveryone() throws Exception {
        State after = EnterpriseAllowList.turnOff(parse("{\"on\":true,\"pct\":0,\"allow\":[7],\"deny\":[]}"), 7);
        assertThat(after.allow()).isEmpty();
        assertThat(after.deny()).containsExactly(7L);
        assertThat(after.everyone()).isTrue(); // the master flag is untouched; deny wins for this organization
    }

    @Test
    void offWhileTheMasterFlagIsOffJustRemovesIt() throws Exception {
        State after = EnterpriseAllowList.turnOff(parse("{\"on\":false,\"pct\":0,\"allow\":[7],\"deny\":[]}"), 7);
        assertThat(after.allow()).isEmpty();
        assertThat(after.deny()).isEmpty();
    }

    @Test
    void theJsonRoundTripsThroughTheRealFlagParser() throws Exception {
        State s = EnterpriseAllowList.turnOn(State.parse(null), 12);
        EnterpriseFeatureFlag.Rule rule = EnterpriseFeatureFlag.Rule.parse(s.toJson());
        assertThat(rule.appliesTo(12L)).isTrue();
        assertThat(rule.appliesTo(13L)).isFalse();
    }
}
