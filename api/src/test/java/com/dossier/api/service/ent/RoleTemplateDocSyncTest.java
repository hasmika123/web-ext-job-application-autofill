package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.PermissionScope;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * "Roles are exactly what 05-permission-model.md section 3 says" (the {@code ShareMatrixTest} idea). Three-way: the matrix
 * embedded below is the reviewed contract; {@link RoleTemplates} must equal it cell by cell; and the design document must
 * agree with it (every key the document names for a template is held by it, every key it holds is named in the document, in
 * section 3.1 or by the rule that every template holds {@code self.*}, and a scope written next to a key is the scope held).
 * Changing a template in code or in the document without the other fails this test.
 */
class RoleTemplateDocSyncTest {

    /** template: key=SCOPE, ... ({@code self.*} is the two OWN keys, asserted separately for every template). */
    private static final String MATRIX = """
        OWNER: org.settings.manage=ORG branding.manage=ORG domains.manage=ORG roles.manage=ORG members.invite=ORG members.import=ORG members.role.set=ORG members.remove=ORG members.suspend=ORG members.support_owner.set=ORG members.group.set=ORG members.manager.set=ORG groups.manage=ORG assignments.manage=ORG consultants.view=ORG consultants.edit=ORG resumes.view_for=ORG resumes.approve_request=ORG licenses.view=ORG licenses.manage=ORG billing.view=ORG billing.manage=ORG usage.view=ORG pipeline.view=ORG clients.view=ORG placements.view=ORG hr.view=ORG finance.view=ORG reports.view=ORG reports.export=ORG audit.view=ORG integrations.manage=ORG dashboard.view_org=ORG member.view_summary=ORG services.order_for_member=ORG ops.*=ORG org.close=ORG org.transfer_ownership=ORG
        ORG_ADMIN: org.settings.manage=ORG branding.manage=ORG domains.manage=ORG roles.manage=ORG members.invite=ORG members.import=ORG members.role.set=ORG members.remove=ORG members.suspend=ORG members.support_owner.set=ORG members.group.set=ORG members.manager.set=ORG groups.manage=ORG assignments.manage=ORG consultants.view=ORG consultants.edit=ORG resumes.view_for=ORG resumes.approve_request=ORG licenses.view=ORG licenses.manage=ORG billing.view=ORG billing.manage=ORG usage.view=ORG pipeline.view=ORG clients.view=ORG placements.view=ORG hr.view=ORG finance.view=ORG reports.view=ORG reports.export=ORG audit.view=ORG integrations.manage=ORG dashboard.view_org=ORG member.view_summary=ORG services.order_for_member=ORG ops.*=ORG
        STAFF: members.invite=ORG members.import=ORG reports.view=ASSIGNED member.view_summary=ASSIGNED
        MEMBER: ops.own_hours=OWN
        CONSULTANT: opportunities.respond=OWN submissions.authorize=OWN applications.manage=OWN interviews.manage=OWN offers.respond=OWN resumes.manage=OWN features.view=OWN
        MARKETING_SPECIALIST: member.view_summary=ASSIGNED member.view_full=ASSIGNED member.act_for=ASSIGNED consultants.view=ASSIGNED resumes.view_for=ASSIGNED resumes.edit_for=ASSIGNED opportunities.manage=ASSIGNED matches.run=ASSIGNED submissions.prepare=ASSIGNED submissions.record=ASSIGNED followups.manage=ASSIGNED interviews.coordinate=ASSIGNED pipeline.view=ASSIGNED reports.view=ASSIGNED
        MARKETING_MANAGER: member.view_summary=TEAM member.view_full=TEAM member.act_for=TEAM consultants.view=TEAM resumes.view_for=TEAM resumes.edit_for=TEAM opportunities.manage=TEAM matches.run=TEAM submissions.prepare=TEAM submissions.record=TEAM followups.manage=TEAM interviews.coordinate=TEAM pipeline.view=TEAM reports.view=TEAM assignments.manage=TEAM approvals.decide=TEAM workload.view=TEAM escalations.manage=TEAM reports.export=TEAM members.manager.set=TEAM
        HR_SPECIALIST: members.invite=ORG members.suspend=ORG members.group.set=ORG members.manager.set=ORG hr.view=ORG hr.manage=ORG groups.manage=ORG lifecycle.manage=ORG reports.view=ORG
        FINANCE_SPECIALIST: billing.view=ORG billing.manage=ORG licenses.view=ORG usage.view=ORG finance.view=ORG finance.manage=ORG placements.view=ORG ops.*=ORG reports.view=ORG reports.export=ORG audit.view=ORG
        ACCOUNT_MANAGER: clients.view=ORG clients.manage=ORG requirements.manage=ORG submissions.record=ORG interviews.coordinate=ORG offers.manage=ORG placements.manage=ORG reports.view=ORG
        TALENT_ACQUISITION: members.invite=ORG candidates.manage=ORG talent_pools.manage=ORG consultants.view=ORG onboarding.coordinate=ORG
        EXECUTIVE_VIEWER: dashboard.view_org=ORG reports.view=ORG pipeline.view=ORG billing.view=ORG
        """;

    /** Keys the document names that are deliberately not stored as separate rows (aliases of groups.manage, 05 section 3.1). */
    private static final Set<String> ALIASES = Set.of("departments.manage", "teams.manage");

    /** Templates whose document row is a prose pointer, not a key list: the code is checked against the matrix only. */
    private static final Set<String> PROSE_ROWS = Set.of("OWNER", "STAFF", "MEMBER", "MARKETING_MANAGER");

    private static final Pattern TOKEN = Pattern.compile("`([a-z_.*]+)`(?:\\*\\*)?(\\s*\\(([^)]*)\\))?");
    private static final Pattern SCOPE_WORD = Pattern.compile("\\b(OWN|ASSIGNED|TEAM|DEPARTMENT|ORG)\\b");

    private static Map<String, Map<String, PermissionScope>> matrix() {
        Map<String, Map<String, PermissionScope>> out = new LinkedHashMap<>();
        for (String line : MATRIX.strip().split("\n")) {
            String[] kv = line.strip().split(":\\s+", 2);
            Map<String, PermissionScope> cells = new LinkedHashMap<>();
            for (String cell : kv[1].trim().split("\\s+")) {
                String[] ks = cell.split("=");
                cells.put(ks[0], PermissionScope.valueOf(ks[1]));
            }
            out.put(kv[0], cells);
        }
        return out;
    }

    private static List<String> doc() throws IOException {
        Path doc = Path.of("..", "docs", "enterprise-v2", "05-permission-model.md");
        if (!Files.exists(doc)) doc = Path.of("docs", "enterprise-v2", "05-permission-model.md");
        return Files.readAllLines(doc);
    }

    // ---- code == matrix -------------------------------------------------------------------------------------------

    @Test
    void theCodeEqualsTheEmbeddedMatrixCellByCell() {
        Map<String, Map<String, PermissionScope>> expected = matrix();
        assertThat(RoleTemplates.all()).extracting(RoleTemplates.Template::key).containsExactlyElementsOf(expected.keySet());
        for (RoleTemplates.Template t : RoleTemplates.all()) {
            Map<String, PermissionScope> actual = new LinkedHashMap<>();
            t.grants().forEach(g -> {
                if (!g.key().startsWith("self.")) actual.put(g.key(), g.scope());
            });
            assertThat(actual).as(t.key()).containsExactlyInAnyOrderEntriesOf(expected.get(t.key()));
        }
    }

    // ---- doc == matrix --------------------------------------------------------------------------------------------

    private record DocRow(String templates, String grants) {}

    private static List<DocRow> section3Rows(List<String> lines) {
        int start = -1;
        int end = lines.size();
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).startsWith("## 3.")) start = i;
            else if (start >= 0 && (lines.get(i).startsWith("### 3.1") || lines.get(i).startsWith("## 4."))) {
                end = i;
                break;
            }
        }
        assertThat(start).as("section 3 of 05-permission-model.md").isGreaterThan(-1);
        List<DocRow> rows = new ArrayList<>();
        for (int i = start + 1; i < end; i++) {
            String line = lines.get(i);
            if (!line.startsWith("| `")) continue;
            String[] cells = line.split("\\|", -1);
            assertThat(cells.length).as(line).isGreaterThanOrEqualTo(5);
            rows.add(new DocRow(cells[1], cells[3]));
        }
        return rows;
    }

    /** section 3.1 rows: key -> the document text of "granted to". */
    private static Map<String, String> section31(List<String> lines) {
        int start = -1;
        for (int i = 0; i < lines.size(); i++) if (lines.get(i).startsWith("### 3.1")) start = i;
        assertThat(start).as("section 3.1").isGreaterThan(-1);
        Map<String, String> out = new LinkedHashMap<>();
        for (int i = start + 1; i < lines.size() && !lines.get(i).startsWith("## "); i++) {
            String line = lines.get(i);
            if (!line.startsWith("| `")) continue;
            String[] cells = line.split("\\|", -1);
            Matcher m = Pattern.compile("`([a-z_.*]+)`").matcher(cells[1]);
            while (m.find()) out.put(m.group(1), cells[2]);
        }
        return out;
    }

    private static boolean satisfies(String token, Set<String> codeKeys) {
        if (codeKeys.contains(token)) return true;
        if (token.endsWith(".*")) {
            String prefix = token.substring(0, token.length() - 1);
            return codeKeys.stream().anyMatch(k -> k.startsWith(prefix));
        }
        return false;
    }

    private static boolean covered(String key, Set<String> docTokens) {
        if (docTokens.contains(key)) return true;
        return docTokens.stream().anyMatch(t -> t.endsWith(".*") && key.startsWith(t.substring(0, t.length() - 1)));
    }

    @Test
    void theDesignDocumentAgreesWithTheMatrix() throws IOException {
        List<String> lines = doc();
        List<DocRow> rows = section3Rows(lines);
        Map<String, String> s31 = section31(lines);
        Map<String, Map<String, PermissionScope>> expected = matrix();

        for (String template : expected.keySet()) {
            DocRow row = rows.stream().filter(r -> r.templates().contains("`" + template + "`")).findFirst().orElse(null);
            assertThat(row).as("section 3 has a row for " + template).isNotNull();
            if (PROSE_ROWS.contains(template)) continue; // checked below
            Set<String> codeKeys = expected.get(template).keySet();

            Set<String> docTokens = new HashSet<>();
            Matcher m = TOKEN.matcher(row.grants().replace("No `org.close`/transfer.", "")); // the negated sentence names keys the template must NOT hold
            while (m.find()) {
                String token = m.group(1);
                if (ALIASES.contains(token)) {
                    docTokens.add("groups.manage"); // departments.manage / teams.manage are the same row as groups.manage
                    continue;
                }
                if (token.equals("self.*")) continue;
                docTokens.add(token);
                assertThat(satisfies(token, codeKeys)).as("%s: the document names `%s` but the template does not hold it", template, token).isTrue();
                if (m.group(3) != null && !token.endsWith(".*")) { // a scope written next to the key is the scope held
                    Matcher sw = SCOPE_WORD.matcher(m.group(3));
                    if (sw.find()) {
                        PermissionScope written = PermissionScope.valueOf(sw.group(1));
                        assertThat(expected.get(template).get(token)).as("%s / %s scope in the document", template, token).isEqualTo(written);
                    }
                }
            }
            // keys that section 3.1 grants to this template count as documented
            for (Map.Entry<String, String> e : s31.entrySet()) if (e.getValue().contains(template) && !ALIASES.contains(e.getKey())) docTokens.add(e.getKey());
            for (String key : codeKeys) {
                assertThat(covered(key, docTokens)).as("%s holds `%s` which neither section 3 nor 3.1 names for it", template, key).isTrue();
            }
        }
    }

    @Test
    void theProseRowsMeanWhatTheCodeDoes() throws IOException {
        List<String> lines = doc();
        List<DocRow> rows = section3Rows(lines);
        Map<String, Map<String, PermissionScope>> expected = matrix();
        DocRow owner = rows.stream().filter(r -> r.templates().contains("`OWNER`")).findFirst().orElseThrow();
        assertThat(owner.grants()).contains("`org.close`").contains("`org.transfer_ownership`").contains("everything");
        assertThat(expected.get("OWNER").keySet()).containsAll(expected.get("ORG_ADMIN").keySet()).contains("org.close", "org.transfer_ownership");
        Set<String> ownerOnly = new HashSet<>(expected.get("OWNER").keySet());
        ownerOnly.removeAll(expected.get("ORG_ADMIN").keySet());
        assertThat(ownerOnly).containsExactlyInAnyOrder("org.close", "org.transfer_ownership");

        DocRow mm = rows.stream().filter(r -> r.templates().contains("`MARKETING_MANAGER`")).findFirst().orElseThrow();
        assertThat(mm.grants()).contains("all of MARKETING_SPECIALIST at (TEAM)");
        Map<String, PermissionScope> mgr = expected.get("MARKETING_MANAGER");
        for (String k : expected.get("MARKETING_SPECIALIST").keySet()) assertThat(mgr.get(k)).as(k).isEqualTo(PermissionScope.TEAM);
        for (String key : new String[] { "assignments.manage", "approvals.decide", "workload.view", "escalations.manage", "reports.export" }) {
            assertThat(mm.grants()).contains("`" + key + "`");
            assertThat(mgr.get(key)).as(key).isEqualTo(PermissionScope.TEAM);
        }

        assertThat(section31(lines).get("members.manager.set")).contains("MARKETING_MANAGER (TEAM)");
        assertThat(mgr.get("members.manager.set")).isEqualTo(PermissionScope.TEAM);

        DocRow staffMember = rows.stream().filter(r -> r.templates().contains("`STAFF`")).findFirst().orElseThrow();
        assertThat(staffMember.templates()).contains("`MEMBER`");
        assertThat(staffMember.grants()).contains("unchanged");
    }

    @Test
    void everyTemplateHoldingSelfServiceIsStatedInTheRules() throws IOException {
        String text = String.join("\n", doc());
        assertThat(text).contains("**Every template** also holds `self.share_scope.set` and `self.leave` (OWN)");
        for (RoleTemplates.Template t : RoleTemplates.all()) {
            assertThat(t.byKey().get("self.share_scope.set").scope()).isEqualTo(PermissionScope.OWN);
            assertThat(t.byKey().get("self.leave").scope()).isEqualTo(PermissionScope.OWN);
        }
    }
}
