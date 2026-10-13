package com.dossier.api.service.dto.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.service.org.OrgException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** O1.3: {@code settings_json} is the typed {@link OrgSettings}, never a free-form bag. */
class OrgSettingsTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static JsonNode json(String s) throws Exception {
        return OM.readTree(s);
    }

    private static void assertInvalid(String patch, String field) {
        assertThatThrownBy(() -> OrgSettings.merge(OrgSettings.defaults(), json(patch)))
            .isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getCode()).isEqualTo("ORG_INVALID");
                assertThat(e.getExtra()).containsEntry("field", field);
            });
    }

    @Test
    void defaultsAreTheDocumentedOnes() {
        OrgSettings d = OrgSettings.defaults();
        assertThat(d.defaultRole()).isEqualTo(OrgRole.MEMBER);
        assertThat(d.defaultShareScope()).isEqualTo("SUMMARY");
        assertThat(d.allowSelfLeave()).isTrue();
        assertThat(d.digestDay()).isEqualTo("DAILY");
        assertThat(d.digestTime()).isEqualTo("08:00");
        assertThat(d.quietHours()).isEqualTo(new OrgSettings.QuietHours("21:00", "08:00"));
        assertThat(d.showPayToConsultant()).isFalse();
        assertThat(d.validated()).isSameAs(d);
    }

    @Test
    void aPartialPatchChangesOnlyWhatItNames() throws Exception {
        OrgSettings s = OrgSettings.merge(OrgSettings.defaults(), json("{\"defaultShareScope\":\"NONE\",\"quietHours\":{\"end\":\"07:30\"}}"));
        assertThat(s.defaultShareScope()).isEqualTo("NONE");
        assertThat(s.quietHours()).isEqualTo(new OrgSettings.QuietHours("21:00", "07:30"));
        assertThat(s.defaultRole()).isEqualTo(OrgRole.MEMBER);
        assertThat(s.allowSelfLeave()).isTrue();
    }

    @Test
    void anEmptyOrNullPatchChangesNothing() throws Exception {
        OrgSettings d = OrgSettings.defaults();
        assertThat(OrgSettings.merge(d, json("{}"))).isEqualTo(d);
        assertThat(OrgSettings.merge(d, null)).isEqualTo(d);
        assertThat(OrgSettings.merge(d, json("null"))).isEqualTo(d);
    }

    @Test
    void everyKeyCanBeSet() throws Exception {
        OrgSettings s = OrgSettings.merge(
            OrgSettings.defaults(),
            json("{\"defaultRole\":\"STAFF\",\"defaultShareScope\":\"NONE\",\"allowSelfLeave\":false,\"digestDay\":\"FRI\",\"digestTime\":\"17:45\",\"quietHours\":{\"start\":\"22:00\",\"end\":\"06:00\"},\"showPayToConsultant\":true}")
        );
        assertThat(s.defaultRole()).isEqualTo(OrgRole.STAFF);
        assertThat(s.allowSelfLeave()).isFalse();
        assertThat(s.digestDay()).isEqualTo("FRI");
        assertThat(s.digestTime()).isEqualTo("17:45");
        assertThat(s.quietHours()).isEqualTo(new OrgSettings.QuietHours("22:00", "06:00"));
        assertThat(s.showPayToConsultant()).isTrue();
    }

    @Test
    void unknownKeysAreRefused() {
        assertInvalid("{\"theme\":\"dark\"}", "settings.theme");
        assertInvalid("{\"quietHours\":{\"from\":\"21:00\"}}", "settings.quietHours.from");
    }

    @Test
    void aDefaultRoleThatCouldMintPrivilegeIsRefused() {
        assertInvalid("{\"defaultRole\":\"ADMIN\"}", "settings.defaultRole");
        assertInvalid("{\"defaultRole\":\"OWNER\"}", "settings.defaultRole");
        assertInvalid("{\"defaultRole\":\"COACH\"}", "settings.defaultRole");
        assertInvalid("{\"defaultRole\":\"nonsense\"}", "settings.defaultRole");
    }

    @Test
    void fullIsNeverADefaultShareScope() {
        assertInvalid("{\"defaultShareScope\":\"FULL\"}", "settings.defaultShareScope");
        assertInvalid("{\"defaultShareScope\":\"summary\"}", "settings.defaultShareScope");
    }

    @Test
    void timesDaysAndTypesAreValidated() {
        assertInvalid("{\"digestDay\":\"MONDAY\"}", "settings.digestDay");
        assertInvalid("{\"digestTime\":\"25:00\"}", "settings.digestTime");
        assertInvalid("{\"digestTime\":\"8:00\"}", "settings.digestTime");
        assertInvalid("{\"quietHours\":{\"start\":\"9pm\"}}", "settings.quietHours.start");
        assertInvalid("{\"quietHours\":\"always\"}", "settings.quietHours");
        assertInvalid("{\"allowSelfLeave\":\"yes\"}", "settings.allowSelfLeave");
        assertInvalid("{\"showPayToConsultant\":1}", "settings.showPayToConsultant");
        assertInvalid("{\"digestDay\":5}", "settings.digestDay");
        assertInvalid("[1]", "settings");
    }

    @Test
    void theRecordSerialisesToExactlyTheSevenKeys() throws Exception {
        JsonNode node = OM.valueToTree(OrgSettings.defaults());
        assertThat(node.fieldNames()).toIterable().containsExactlyInAnyOrder(
            "defaultRole", "defaultShareScope", "allowSelfLeave", "digestDay", "digestTime", "quietHours", "showPayToConsultant"
        );
    }
}
