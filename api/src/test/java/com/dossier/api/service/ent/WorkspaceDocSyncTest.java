package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.ent.WorkspaceDefinitions.NavDef;
import com.dossier.api.service.ent.WorkspaceDefinitions.WorkspaceDef;
import com.dossier.api.service.ent.authz.EntPermissions;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * "The menu is exactly what 16-ui-ux-page-inventory.md says" (the {@code RoleTemplateDocSyncTest} idea, for the workspace
 * definitions of X2.2): the packaged {@code config/ent/workspaces.json} must agree with the workspace table (section 3) and with
 * the page tables of section 5, and a malformed definition must stop the application from starting. Adding a page in the
 * document without the data, or the reverse, fails this test.
 */
class WorkspaceDocSyncTest {

    private static final WorkspaceDefinitions DEFS = new WorkspaceDefinitions();

    /** Section 5 sub-sections that list their pages as {@code Name -> `/w/...`} table rows. */
    private static final Map<String, String> SECTIONS = Map.of(
        "ADMIN", "### 5.1 ADMIN", "MARKETING", "### 5.2 MARKETING", "MARKETING_MGMT", "### 5.3 MARKETING_MGMT", "CONSULTANT", "### 5.4 CONSULTANT",
        "HR", "### 5.5 HR", "FINANCE", "### 5.6 FINANCE"
    );

    private static String doc() throws IOException {
        Path doc = Path.of("..", "docs", "enterprise-v2", "16-ui-ux-page-inventory.md");
        if (!Files.exists(doc)) doc = Path.of("docs", "enterprise-v2", "16-ui-ux-page-inventory.md");
        return Files.readString(doc);
    }

    private static String section(String doc, String heading) {
        int start = doc.indexOf(heading);
        assertThat(start).as("heading " + heading).isGreaterThanOrEqualTo(0);
        int end = doc.indexOf("\n### ", start + heading.length());
        int endMajor = doc.indexOf("\n## ", start + heading.length());
        if (end < 0 || (endMajor >= 0 && endMajor < end)) end = endMajor;
        return doc.substring(start, end < 0 ? doc.length() : end);
    }

    @Test
    void theWorkspaceTableOfSection3MatchesTheDefinitions() throws IOException {
        String s3 = section(doc(), "## 3. Workspaces and landing");
        Pattern row = Pattern.compile("\\|\\s*`([A-Z_]+)`\\s*\\|\\s*([^|]+?)\\s*\\|\\s*`(/w/[a-z-]+)`\\s*\\|[^|]*\\|\\s*([^|]+?)\\s*\\|");
        Matcher m = row.matcher(s3);
        Map<String, String[]> rows = new LinkedHashMap<>();
        while (m.find()) rows.put(m.group(1), new String[] { m.group(2), m.group(3), m.group(4) });
        assertThat(rows.keySet()).as("workspaces in the document").containsExactlyElementsOf(DEFS.all().stream().map(WorkspaceDef::key).toList());
        for (WorkspaceDef w : DEFS.all()) {
            String[] r = rows.get(w.key());
            assertThat(w.label()).as(w.key() + " label").isEqualTo(r[0]);
            assertThat(w.home()).as(w.key() + " home").isEqualTo(r[1]);
            List<String> documented = List.of(r[2].split(",\\s*"));
            assertThat(w.primaryFor()).as(w.key() + " primary for").containsExactlyElementsOf(documented);
            for (String templateKey : w.primaryFor()) {
                assertThat(RoleTemplates.find(templateKey).orElseThrow().workspaceKey()).as(templateKey + " opens " + w.key()).isEqualTo(w.key());
            }
        }
        // and every template that has a workspace is some workspace's primary
        for (RoleTemplates.Template t : RoleTemplates.all()) {
            if (t.workspaceKey() == null) continue;
            assertThat(DEFS.find(t.workspaceKey())).as(t.key() + " workspace exists").isPresent();
            assertThat(DEFS.find(t.workspaceKey()).orElseThrow().primaryFor()).contains(t.key());
        }
    }

    @Test
    void thePagesOfSections51To56AreExactlyTheNavData() throws IOException {
        String d = doc();
        for (Map.Entry<String, String> e : SECTIONS.entrySet()) {
            String s = section(d, e.getValue());
            Set<String> documented = new LinkedHashSet<>();
            for (String line : s.split("\n")) {
                if (!line.startsWith("|") || line.startsWith("| Page") || line.startsWith("|---")) continue;
                String firstCell = line.split("\\|")[1];
                Matcher m = Pattern.compile("`(/w/[^`]+)`").matcher(firstCell);
                while (m.find()) documented.add(m.group(1));
            }
            Set<String> data = new LinkedHashSet<>();
            for (NavDef n : DEFS.find(e.getKey()).orElseThrow().nav()) data.add(n.href());
            assertThat(data).as(e.getKey() + " pages (document vs workspaces.json)").containsExactlyInAnyOrderElementsOf(documented);
        }
    }

    @Test
    void theAccountManagerAndExecutivePagesOfSections57And58AreTheNavData() throws IOException {
        String d = doc();
        for (String slug : List.of("accounts")) {
            String s = section(d, "### 5.7 ACCOUNTS");
            Set<String> documented = new LinkedHashSet<>();
            documented.add("/w/accounts");
            Matcher m = Pattern.compile("`(/[a-z-]+)`").matcher(s.substring(s.indexOf("Clients")));
            while (m.find()) documented.add("/w/" + slug + m.group(1));
            Set<String> data = new LinkedHashSet<>();
            DEFS.find("ACCOUNTS").orElseThrow().nav().forEach(n -> data.add(n.href()));
            assertThat(data).containsExactlyInAnyOrderElementsOf(documented);
        }
        String exec = section(d, "### 5.8 EXEC");
        assertThat(DEFS.find("EXEC").orElseThrow().nav().stream().map(NavDef::href).toList()).containsExactly("/w/exec", "/w/exec/reports");
        assertThat(exec).contains("`/w/exec`").contains("`/w/exec/reports`");
    }

    @Test
    void everyPermissionAPageNeedsIsNamedInTheDocumentOrIsADeclaredDeviation() throws IOException {
        // The "Permission" column of section 5 is what the page's API checks; the menu may be wider (HR templates) but never names a key
        // the document does not mention anywhere in section 5 apart from the few declared below.
        String d = doc();
        int from = d.indexOf("### 5.1 ADMIN");
        String s5 = d.substring(from, d.indexOf("### 5.9"));
        Set<String> declared = Set.of(
            "self.share_scope.set", // "self.*": any member of the workspace
            "clients.manage", // 5.7 names the family as `clients.*`
            "ops.*", // doc: ops.approve (not a registered key); the registry's ops.* is the permission the templates grant
            "members.invite", "onboarding.coordinate", "candidates.manage", "talent_pools.manage" // HR home / employees for Talent Acquisition, who has no hr.view
        );
        List<String> unexplained = new ArrayList<>();
        for (WorkspaceDef w : DEFS.all()) {
            for (NavDef n : w.nav()) {
                for (String need : n.needs()) {
                    if (!s5.contains("`" + need + "`") && !declared.contains(need)) unexplained.add(w.key() + "/" + n.key() + " needs " + need);
                }
            }
        }
        assertThat(unexplained).isEmpty();
    }

    @Test
    void theResourceIsVersionedAndEveryPermissionAndModuleResolves() {
        assertThat(DEFS.version()).isEqualTo(1);
        assertThat(DEFS.all()).hasSize(8);
        for (WorkspaceDef w : DEFS.all()) {
            assertThat(w.homeItem().key()).isEqualTo("home");
            for (NavDef n : w.nav()) {
                n.needs().forEach(k -> assertThat(EntPermissions.isRegistered(k)).as(k).isTrue());
                if (n.module() != null) assertThat(TenantModule.ofWire(n.module())).as(n.module()).isPresent();
            }
        }
    }

    @Test
    void aBrokenDefinitionRefusesToLoad() {
        for (String resource : List.of("bad-unknown-permission", "bad-unknown-module", "bad-home", "bad-duplicate", "bad-href")) {
            assertThatThrownBy(() -> new WorkspaceDefinitions(new ObjectMapper(), "config/ent/test/" + resource + ".json")).as(resource).isInstanceOf(IllegalStateException.class);
        }
    }
}
