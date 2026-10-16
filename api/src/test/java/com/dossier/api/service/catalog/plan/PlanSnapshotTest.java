package com.dossier.api.service.catalog.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** The snapshot hash is taken over a canonical form, so MySQL re-ordering and re-spacing a JSON column never reads as tampering. */
class PlanSnapshotTest {

    private final PlanSnapshot snapshots = new PlanSnapshot(new ObjectMapper());

    @Test
    void keyOrderAndWhitespaceDoNotChangeTheHash() {
        String a = "{\"planKey\":\"PRO\",\"version\":1,\"components\":[{\"featureKey\":\"a\",\"prices\":[{\"interval\":\"MONTH\",\"amountMinor\":1999}]}]}";
        String b = "{ \"version\": 1, \"components\": [ { \"prices\": [ { \"amountMinor\": 1999, \"interval\": \"MONTH\" } ], \"featureKey\": \"a\" } ], \"planKey\": \"PRO\" }";
        assertThat(snapshots.hash(a)).isEqualTo(snapshots.hash(b)).hasSize(64);
    }

    @Test
    void anyChangeOfAValueChangesTheHash() {
        String a = "{\"amountMinor\":1999}";
        assertThat(snapshots.hash(a)).isNotEqualTo(snapshots.hash("{\"amountMinor\":2000}"));
        assertThat(snapshots.hash("{\"x\":[1,2]}")).as("array order matters").isNotEqualTo(snapshots.hash("{\"x\":[2,1]}"));
    }

    @Test
    void theStoredFormIsCompactAndSorted() {
        var node = snapshots.parse("{\"b\":1,\"a\":{\"d\":2,\"c\":3}}");
        assertThat(snapshots.toJson(node)).isEqualTo("{\"a\":{\"c\":3,\"d\":2},\"b\":1}");
        assertThat(snapshots.hash(snapshots.toJson(node))).isEqualTo(snapshots.hash(node));
    }

    @Test
    void textThatIsNotJsonIsRefused() {
        assertThatThrownBy(() -> snapshots.hash("{not json")).isInstanceOf(IllegalArgumentException.class);
        assertThat(snapshots.parse("{not json")).isNull();
        assertThat(snapshots.parse(null)).isNull();
    }
}
