package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

/**
 * Importing consultants from a CSV (docs/enterprise-v2/ONBOARDING-BUILD.md, A3) through the real chain: the Check's verdict per row with the very rules
 * of "Add consultant", and Apply creating the READY rows, inviting the ticked ones first so the profile links to the invited seat, one row's failure
 * never stopping the others. Not run in a class transaction: Apply commits each row on its own, which a test transaction would hide from it.
 */
@IntegrationTest
@AutoConfigureMockMvc
class ConsultantImportIT extends MemberItSupport {

    @Autowired
    private ConsultantProfileRepository consultants;

    @Autowired
    private OrgMemberRepository memberRows;

    private String url() {
        return "/api/orgs/" + a.getId() + "/consultants/import";
    }

    private static String row(String name, String email, String extra) {
        return "{\"name\":\"" + name + "\",\"email\":\"" + email + "\"" + (extra == null ? "" : "," + extra) + "}";
    }

    private Map<String, JsonNode> byEmail(JsonNode result) {
        Map<String, JsonNode> out = new HashMap<>();
        result.path("rows").forEach(r -> out.put(r.path("email").asText(), r));
        return out;
    }

    @Test
    void theCheckGivesEveryRowAVerdictAndWritesNothing() throws Exception {
        group(a, "Engineering", OrgGroupKind.DEPARTMENT, null);
        String good = "ana@" + p + ".example.org";
        String body = "{\"rows\":["
            + row("Ana Abe", good, "\"jobTitle\":\"Java Developer\",\"workMode\":\"Remote\",\"years\":\"6\",\"skills\":[\"Java\",\"Spring\"],\"department\":\"engineering\",\"invite\":true") + ","
            + row("Bad Mail", "not-an-email", null) + ","
            + row("Ana Again", good.toUpperCase(), null) + ","
            + row("No Dept", "nd@" + p + ".example.org", "\"department\":\"Nowhere\"") + ","
            + row("Pii Row", "pii@" + p + ".example.org", "\"jobTitle\":\"passport A1234567\"") + ","
            + row("Years Bad", "yb@" + p + ".example.org", "\"years\":\"six\"")
            + "]}";
        long consultantsBefore = consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(a.getId(), "ACTIVE").size();
        JsonNode r = json(call(login("owner"), post(url() + "/check"), body));
        Map<String, JsonNode> v = byEmail(r);
        assertThat(r.path("total").asInt()).isEqualTo(6);
        assertThat(r.path("ready").asInt()).isEqualTo(1);
        assertThat(v.get(good).path("status").asText()).isEqualTo("READY");
        assertThat(v.get(good).path("invite").asText()).isEqualTo("WILL_INVITE");
        assertThat(v.get("not-an-email").path("status").asText()).isEqualTo("INVALID");
        assertThat(v.get(good.toUpperCase()).path("status").asText()).as("the same email twice in one file").isEqualTo("DUPLICATE");
        assertThat(v.get("nd@" + p + ".example.org").path("field").asText()).isEqualTo("department");
        assertThat(v.get("pii@" + p + ".example.org").path("status").asText()).isEqualTo("SENSITIVE");
        assertThat(v.get("yb@" + p + ".example.org").path("field").asText()).isEqualTo("years");
        assertThat(consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(a.getId(), "ACTIVE")).hasSize((int) consultantsBefore);
    }

    @Test
    void applyCreatesTheReadyRowsInvitesTheTickedOnesAndLinksTheirSeat() throws Exception {
        String invited = "inv@" + p + ".example.org";
        String quiet = "quiet@" + p + ".example.org";
        String body = "{\"rows\":["
            + row("Ivy Invited", invited, "\"skills\":[\"Python\"],\"invite\":true") + ","
            + row("Quinn Quiet", quiet, "\"invite\":false") + ","
            + row("Bad Mail", "nope", null)
            + "]}";
        long importsBefore = auditCount(a, "CONSULTANT_IMPORT");
        String k = key();
        JsonNode r = json(call(login("owner"), post(url()), body, null, k));
        assertThat(r.path("added").asInt()).isEqualTo(2);
        assertThat(r.path("invited").asInt()).isEqualTo(1);
        assertThat(r.path("skipped").asInt()).isEqualTo(1);
        ConsultantProfile ivy = consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(a.getId(), "ACTIVE").stream().filter(c -> invited.equals(c.getEmail())).findFirst().orElseThrow();
        assertThat(ivy.getMemberId()).as("the profile links to the invited seat").isNotNull();
        assertThat(memberRows.findByOrgIdAndId(a.getId(), ivy.getMemberId()).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.INVITED);
        ConsultantProfile q = consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(a.getId(), "ACTIVE").stream().filter(c -> quiet.equals(c.getEmail())).findFirst().orElseThrow();
        assertThat(q.getMemberId()).as("not invited: no seat").isNull();
        assertThat(auditCount(a, "CONSULTANT_IMPORT")).isEqualTo(importsBefore + 1);

        // the same key again (a retry after a lost reply): the stored summary comes back and nothing runs twice
        JsonNode replay = json(call(login("owner"), post(url()), body, null, k));
        assertThat(replay.path("added").asInt()).isEqualTo(2);
        assertThat(auditCount(a, "CONSULTANT_IMPORT")).isEqualTo(importsBefore + 1);

        // importing the same people again: both are duplicates now, nothing is created twice
        JsonNode again = json(call(login("owner"), post(url()), "{\"rows\":[" + row("Ivy Invited", invited, null) + "," + row("Quinn Quiet", quiet, null) + "]}", null, key()));
        assertThat(again.path("added").asInt()).isZero();
        assertThat(again.path("skipped").asInt()).isEqualTo(2);
    }

    @Test
    void someoneWithoutTheKeyOrOfAnotherOrganizationGetsTheGeneric404() throws Exception {
        String body = "{\"rows\":[" + row("Ana Abe", "x@" + p + ".example.org", null) + "]}";
        assertStatus(call(login("plain"), post(url() + "/check"), body), 404);
        assertStatus(call(login("bowner"), post(url() + "/check"), body), 404);
        assertStatus(call(login("plain"), post(url()), body, null, key()), 404);
    }

    @Test
    void anEmptyOrOversizedFileIsRefusedWhole() throws Exception {
        assertStatus(call(login("owner"), post(url() + "/check"), "{\"rows\":[]}"), 422);
        StringBuilder big = new StringBuilder("{\"rows\":[");
        for (int i = 0; i < 501; i++) big.append(i == 0 ? "" : ",").append(row("Row " + i, "r" + i + "@" + p + ".example.org", null));
        assertStatus(call(login("owner"), post(url() + "/check"), big.append("]}").toString()), 422);
    }
}
