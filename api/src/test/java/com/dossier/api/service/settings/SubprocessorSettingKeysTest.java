package com.dossier.api.service.settings;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettingKeys.Type;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** The subprocessor register slots (T1.5): twelve JSON keys, six real defaults, the rest empty, a strict entry shape. */
class SubprocessorSettingKeysTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void twelveSlotsExistAndTheFirstSixAreTheRealSubprocessorsEachWithDpaStatusToBeConfirmed() throws Exception {
        for (int i = 1; i <= AdminSettingKeys.SUBPROCESSOR_SLOTS; i++) {
            Key k = SettingDefinitions.find(AdminSettingKeys.subprocessorKey(i));
            assertThat(k).as("slot %s", i).isNotNull();
            assertThat(k.type()).isEqualTo(Type.JSON);
            assertThat(ResumeBuilderSettings.isValid(k, k.defaultValue(), mapper)).as("default of slot %s", i).isTrue();
            assertThat(k.defaultValue().length()).as("fits the 1000-char column").isLessThanOrEqualTo(1000);
            JsonNode d = mapper.readTree(k.defaultValue());
            if (i <= 6) {
                assertThat(d.get("dpaStatus").asText()).isEqualTo("To be confirmed");
                assertThat(d.get("link").asText()).startsWith("https://");
            } else {
                assertThat(d.isEmpty()).isTrue();
            }
        }
        assertThat(AdminSettingKeys.subprocessorKey(7)).isEqualTo("legal.subprocessor.07");
        assertThat(mapper.readTree(SettingDefinitions.find("legal.subprocessor.01").defaultValue()).get("name").asText()).contains("Amazon Web Services");
    }

    private boolean ok(String json) throws Exception {
        return AdminSettingKeys.subprocessor(mapper.readTree(json));
    }

    @Test
    void theEntryShapeIsStrict() throws Exception {
        assertThat(ok("{}")).isTrue();
        assertThat(ok("{\"name\":\"Acme\"}")).isTrue();
        assertThat(ok("{\"name\":\"Acme\",\"link\":\"https://acme.example/p?x=1\"}")).isTrue();
        assertThat(ok("{\"name\":\"Acme\",\"link\":\"http://acme.example\"}")).isFalse();
        assertThat(ok("{\"name\":\"Acme\",\"link\":\"https://a b\"}")).isFalse();
        assertThat(ok("{\"name\":\"\"}")).isFalse();
        assertThat(ok("{\"purpose\":\"x\"}")).isFalse();
        assertThat(ok("{\"name\":\"A\",\"other\":\"x\"}")).isFalse();
        assertThat(ok("{\"name\":1}")).isFalse();
        assertThat(ok("[]")).isFalse();
        assertThat(ok("{\"name\":\"A\",\"purpose\":\"" + "x".repeat(301) + "\"}")).isFalse();
    }

    @Test
    void anIdentityNumberInAnyTextIsRefused() throws Exception {
        assertThat(ok("{\"name\":\"A\",\"data\":\"SSN 123-45-6789\"}")).isFalse();
        assertThat(ok("{\"name\":\"A\",\"data\":\"Resume text, e-mail address.\"}")).isTrue();
    }
}
