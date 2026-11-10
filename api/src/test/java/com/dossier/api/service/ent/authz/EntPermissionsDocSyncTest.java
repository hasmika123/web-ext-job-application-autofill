package com.dossier.api.service.ent.authz;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.ent.RoleTemplates;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * The permission registry against everything that names a key: the legacy {@link OrgPermission} enum, the role templates, and
 * 05-permission-model.md sections 3 and 3.1 (the {@code ShareMatrixTest} idea). A key a template grants that is not registered, a
 * key the document names that is not registered, a registered key nothing grants and metadata that contradicts the templates all fail.
 */
class EntPermissionsDocSyncTest {

    private static final Pattern KEY_TOKEN = Pattern.compile("`([a-z_]+(?:\\.[a-z_*]+)+)`");
    private static final Pattern KEY_SHAPE = Pattern.compile("[a-z_]+(\\.[a-z_*]+)+");

    private static Set<String> templateKeys() {
        Set<String> keys = new HashSet<>();
        RoleTemplates.all().forEach(t -> t.grants().forEach(g -> keys.add(g.key())));
        return keys;
    }

    @Test
    void everyLegacyPermissionIsRegisteredInOrderAndNothingElseComesBeforeThem() {
        List<String> legacy = new ArrayList<>();
        for (OrgPermission p : OrgPermission.values()) legacy.add(p.key());
        List<String> registered = EntPermissions.all().stream().map(EntPermissions.Def::key).toList();
        assertThat(registered.subList(0, legacy.size())).isEqualTo(legacy);
        assertThat(registered).doesNotHaveDuplicates();
    }

    @Test
    void everyKeyATemplateGrantsIsRegisteredAndEveryRegisteredKeyIsGrantedByATemplate() {
        Set<String> granted = templateKeys();
        for (String key : granted) assertThat(EntPermissions.isRegistered(key)).as("template grants unregistered key %s", key).isTrue();
        for (EntPermissions.Def d : EntPermissions.all()) assertThat(granted).as("registered key %s is granted by no template", d.key()).contains(d.key());
        for (String alias : EntPermissions.aliases().keySet()) assertThat(granted).as("an alias is never a stored row").doesNotContain(alias);
    }

    @Test
    void metadataIsWellFormed() {
        for (EntPermissions.Def d : EntPermissions.all()) {
            assertThat(d.key().length()).as(d.key()).isLessThanOrEqualTo(60);
            assertThat(KEY_SHAPE.matcher(d.key()).matches()).as(d.key()).isTrue();
            assertThat(d.family()).as(d.key()).isNotBlank();
            assertThat(d.description()).as(d.key()).isNotBlank().hasSizeLessThanOrEqualTo(200);
            assertThat(d.defaultScope()).as(d.key()).isNotNull();
            assertThat(d.family().matches("[a-z_]+")).as(d.key() + " family " + d.family()).isTrue();
        }
    }

    @Test
    void theDefaultScopeIsAScopeSomeTemplateGrantsTheKeyAt() {
        for (EntPermissions.Def d : EntPermissions.all()) {
            Set<PermissionScope> granted = new HashSet<>();
            RoleTemplates.all().forEach(t -> {
                RoleTemplates.Grant g = t.byKey().get(d.key());
                if (g != null) granted.add(g.scope());
            });
            assertThat(granted).as("%s default scope %s", d.key(), d.defaultScope()).contains(d.defaultScope());
        }
    }

    @Test
    void theKeysThatActForAnotherPersonAreExactlyTheMarketerSetAndApprovals() {
        Set<String> acting = new HashSet<>();
        EntPermissions.all().forEach(d -> {
            if (d.actsFor()) acting.add(d.key());
        });
        assertThat(acting).containsExactlyInAnyOrder(
            "member.act_for", "resumes.edit_for", "opportunities.manage", "matches.run", "submissions.prepare", "submissions.record", "followups.manage",
            "interviews.coordinate", "approvals.decide"
        );
        for (String key : acting) {
            Set<AssignmentKind> kinds = EntPermissions.actingKinds(key);
            if (key.equals("approvals.decide")) assertThat(kinds).containsExactly(AssignmentKind.MANAGER);
            else assertThat(kinds).containsExactlyInAnyOrder(AssignmentKind.PRIMARY, AssignmentKind.BACKUP, AssignmentKind.DELEGATE);
            for (RoleTemplates.Template t : RoleTemplates.all()) {
                RoleTemplates.Grant g = t.byKey().get(key);
                if (g != null) assertThat(g.scope()).as("%s must never be an OWN-scope key (%s)", key, t.key()).isNotEqualTo(PermissionScope.OWN);
            }
        }
        assertThat(EntPermissions.actingKinds("billing.view")).isEmpty();
        assertThat(EntPermissions.actingKinds("nonsense")).isEmpty();
    }

    @Test
    void theDangerousKeysAreTheOnesThatChangeWhoCanDoWhatOrMoveMoneyRecords() {
        Set<String> dangerous = new HashSet<>();
        EntPermissions.all().forEach(d -> {
            if (d.dangerous()) dangerous.add(d.key());
        });
        assertThat(dangerous).contains(
            "org.close", "org.transfer_ownership", "members.role.set", "members.remove", "members.suspend", "roles.manage", "domains.manage", "billing.manage",
            "licenses.manage", "integrations.manage", "finance.manage", "hr.manage", "reports.export"
        );
        assertThat(dangerous).doesNotContain("reports.view", "billing.view", "self.leave", "members.invite");
    }

    @Test
    void aliasesResolveToRegisteredKeys() {
        assertThat(EntPermissions.canonical("departments.manage")).isEqualTo("groups.manage");
        assertThat(EntPermissions.canonical("teams.manage")).isEqualTo("groups.manage");
        assertThat(EntPermissions.canonical("billing.view")).isEqualTo("billing.view");
        assertThat(EntPermissions.canonical(null)).isNull();
        assertThat(EntPermissions.find("teams.manage")).isPresent();
        assertThat(EntPermissions.isRegistered("teams.manage")).isTrue();
        assertThat(EntPermissions.isRegistered("nope.nope")).isFalse();
        assertThat(EntPermissions.isRegistered(null)).isFalse();
    }

    // ---- the design document -----------------------------------------------------------------------------------------

    @Test
    void everyKeyTheDocumentNamesIsRegistered() throws IOException {
        Path doc = Path.of("..", "docs", "enterprise-v2", "05-permission-model.md");
        if (!Files.exists(doc)) doc = Path.of("docs", "enterprise-v2", "05-permission-model.md");
        List<String> lines = Files.readAllLines(doc);
        int s3 = -1;
        int s4 = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).startsWith("## 3.")) s3 = i;
            if (lines.get(i).startsWith("## 4.")) {
                s4 = i;
                break;
            }
        }
        assertThat(s3).isGreaterThan(-1);
        assertThat(s4).isGreaterThan(s3);
        Set<String> named = new HashSet<>();
        for (int i = s3; i < s4; i++) {
            String line = lines.get(i);
            if (!line.startsWith("|")) continue;
            String[] cells = line.split("\\|", -1);
            if (cells.length < 3) continue;
            // section 3.1 rows: the key column; rows marked "not a key" are explanatory
            boolean section31 = i > s3 && lines.subList(s3, i).stream().anyMatch(l -> l.startsWith("### 3.1"));
            if (section31) {
                if (cells[3].contains("not a key")) continue;
                Matcher m = KEY_TOKEN.matcher(cells[1]);
                while (m.find()) named.add(m.group(1));
            } else {
                Matcher m = KEY_TOKEN.matcher(cells.length > 3 ? cells[3] : "");
                while (m.find()) named.add(m.group(1));
            }
        }
        assertThat(named).isNotEmpty();
        // wildcards (members.*, self.*) stand for registered keys with that prefix; a literal key (ops.*) is registered itself
        Map<String, String> aliases = EntPermissions.aliases();
        for (String key : named) {
            if (key.endsWith(".*") && !EntPermissions.isRegistered(key)) {
                String prefix = key.substring(0, key.length() - 1);
                assertThat(EntPermissions.all().stream().anyMatch(d -> d.key().startsWith(prefix))).as("wildcard %s matches no registered key", key).isTrue();
            } else {
                assertThat(EntPermissions.isRegistered(key) || aliases.containsKey(key)).as("the document names `%s`, which is not registered", key).isTrue();
            }
        }
    }
}
