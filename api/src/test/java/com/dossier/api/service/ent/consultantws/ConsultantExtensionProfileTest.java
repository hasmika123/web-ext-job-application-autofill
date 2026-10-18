package com.dossier.api.service.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Me;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Response;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** The workspace profile to bio mapping the extension fills from. Pure: nothing is read or written. */
class ConsultantExtensionProfileTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final ConsultantExtensionProfile mapping = new ConsultantExtensionProfile(null, null, null, mapper);

    private static Response workspace(String name, String phone, String location, String workMode, String workAuthorization) {
        return new Response(5L, new Me(9L, name, "Engineer", 8, location, workMode, phone, null, null), null, null, null, null, null, null, null, workAuthorization, null);
    }

    private JsonNode map(String personal, Response r, String email) throws Exception {
        return mapper.readTree(mapping.payload(personal, r, email));
    }

    @Test
    void mapsTheWorkspaceFieldsToTheBioKeysTheEngineReads() throws Exception {
        JsonNode bio = map(null, workspace("Anika Rao", "+1 512 555 0100", "Austin, TX", "REMOTE", "AUTHORIZED_NO_SPONSORSHIP"), "anika@acme.test");
        assertThat(bio.get("firstName").asText()).isEqualTo("Anika");
        assertThat(bio.get("lastName").asText()).isEqualTo("Rao");
        assertThat(bio.get("email").asText()).isEqualTo("anika@acme.test");
        assertThat(bio.get("phone").asText()).isEqualTo("+1 512 555 0100");
        assertThat(bio.get("city").asText()).isEqualTo("Austin");
        assertThat(bio.get("state").asText()).isEqualTo("TX");
        assertThat(bio.get("workPreference").asText()).isEqualTo("Remote");
        assertThat(bio.get("authorizedToWork").asText()).isEqualTo("Yes");
        assertThat(bio.get("requireSponsorship").asText()).isEqualTo("No");
    }

    @Test
    void theLastWordIsTheLastNameAndASingleWordIsAFirstNameOnly() throws Exception {
        JsonNode three = map(null, workspace("Mary Ann  Smith", null, null, null, null), null);
        assertThat(three.get("firstName").asText()).isEqualTo("Mary Ann");
        assertThat(three.get("lastName").asText()).isEqualTo("Smith");
        JsonNode one = map(null, workspace("Prince", null, null, null, null), null);
        assertThat(one.get("firstName").asText()).isEqualTo("Prince");
        assertThat(one.has("lastName")).isFalse();
    }

    @Test
    void aLocationThatIsNotCityCommaStateFillsNothing() throws Exception {
        for (String label : new String[] { "Remote", "Austin", "Greater Austin Area, USA, Earth, Sol", "12 Main St, Apt 4", "" }) {
            JsonNode bio = map(null, workspace("A B", null, label, null, null), null);
            assertThat(bio.has("city")).as(label).isFalse();
            assertThat(bio.has("state")).as(label).isFalse();
        }
        JsonNode withCountry = map(null, workspace("A B", null, "Toronto, ON, Canada", null, null), null);
        assertThat(withCountry.get("country").asText()).isEqualTo("Canada");
    }

    @Test
    void theWorkspaceValuesLayOverTheAccountsOwnBioAndBlankOnesNeverEraseIt() throws Exception {
        String own = "{\"firstName\":\"Old\",\"phone\":\"111\",\"addressLine1\":\"1 Main St\",\"linkedin\":\"https://linkedin.com/in/anika\",\"city\":\"Dallas\"}";
        JsonNode bio = map(own, workspace("Anika Rao", "", "Remote", null, null), "anika@acme.test");
        assertThat(bio.get("firstName").asText()).as("workspace wins").isEqualTo("Anika");
        assertThat(bio.get("phone").asText()).as("a blank workspace phone keeps the bio's").isEqualTo("111");
        assertThat(bio.get("city").asText()).as("an unparseable location keeps the bio's").isEqualTo("Dallas");
        assertThat(bio.get("addressLine1").asText()).isEqualTo("1 Main St");
        assertThat(bio.get("linkedin").asText()).isEqualTo("https://linkedin.com/in/anika");
    }

    @Test
    void anUnreadableOwnBioIsIgnoredAndNothingSensitiveIsEverAdded() throws Exception {
        JsonNode bio = map("not json", workspace("Anika Rao", null, null, null, "NOT_AUTHORIZED"), "a@b.test");
        assertThat(bio.get("firstName").asText()).isEqualTo("Anika");
        assertThat(bio.get("authorizedToWork").asText()).isEqualTo("No");
        assertThat(bio.has("requireSponsorship")).isFalse();
        for (String key : new String[] { "dateOfBirth", "dob", "ssn", "gender", "race", "ethnicity", "veteranStatus", "disabilityStatus" }) {
            assertThat(bio.has(key)).as(key).isFalse();
        }
    }
}
