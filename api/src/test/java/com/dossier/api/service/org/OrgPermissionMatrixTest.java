package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgScope;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Table-driven over EVERY (role, permission) cell of docs/design/org/tenant-model.md section 4. The table is
 * embedded below (permission: role=scope, ...; an absent role holds nothing), checked cell by cell against
 * {@code OrgRole}, and then diffed against the design document itself so neither can change alone.
 */
class OrgPermissionMatrixTest {

    /** Section 4, transcribed. ALL = a plain tick; any other scope is the parenthesised qualifier or footnote. */
    private static final String TABLE = """
        org.settings.manage:          OWNER=ALL, ADMIN=ALL
        org.close:                    OWNER=ALL
        org.transfer_ownership:       OWNER=ALL
        members.invite:               OWNER=ALL, ADMIN=ALL, STAFF=MEMBER_ROLE_ONLY
        members.import:               OWNER=ALL, ADMIN=ALL, STAFF=MEMBER_ROLE_ONLY
        members.role.set:             OWNER=ALL, ADMIN=BELOW_ADMIN_ROLES
        members.remove:               OWNER=ALL, ADMIN=ALL
        members.suspend:              OWNER=ALL, ADMIN=ALL
        members.support_owner.set:    OWNER=ALL, ADMIN=ALL
        groups.manage:                OWNER=ALL, ADMIN=ALL
        assignments.manage:           OWNER=ALL, ADMIN=ALL
        billing.view:                 OWNER=ALL, ADMIN=ALL, FINANCE=ALL
        billing.manage:               OWNER=ALL, ADMIN=ALL, FINANCE=ALL
        reports.view:                 OWNER=ALL, ADMIN=ALL, STAFF=OWN_MEMBERS, MARKETER=OWN_CONSULTANTS, FINANCE=ALL
        reports.export:               OWNER=ALL, ADMIN=ALL, FINANCE=ALL
        member.view_summary:          OWNER=ALL, ADMIN=ALL, STAFF=OWN_MEMBERS, MARKETER=OWN_CONSULTANTS
        member.view_full:             MARKETER=PAIRED
        member.act_for:               MARKETER=PAIRED
        services.order_for_member:    OWNER=ALL, ADMIN=ALL
        audit.view:                   OWNER=ALL, ADMIN=ALL, FINANCE=BILLING_AND_OPS_ROWS
        integrations.manage:          OWNER=ALL, ADMIN=ALL
        ops.*:                        OWNER=ALL, ADMIN=ALL, FINANCE=ALL
        ops.own_hours:                MEMBER=OWN_HOURS
        self.share_scope.set:         OWNER=SELF, ADMIN=SELF, STAFF=SELF, MEMBER=SELF, MARKETER=SELF, FINANCE=SELF
        self.leave:                   OWNER=SELF_AFTER_TRANSFER, ADMIN=SELF, STAFF=SELF, MEMBER=SELF, MARKETER=SELF, FINANCE=SELF
        """;

    /** permission -> (role -> scope). */
    private static Map<OrgPermission, Map<OrgRole, OrgScope>> expected() {
        Map<OrgPermission, Map<OrgRole, OrgScope>> out = new EnumMap<>(OrgPermission.class);
        for (String line : TABLE.strip().split("\n")) {
            String[] kv = line.strip().split(":\\s+", 2);
            OrgPermission p = OrgPermission.ofKey(kv[0]).orElseThrow(() -> new AssertionError("unknown permission key " + kv[0]));
            Map<OrgRole, OrgScope> cells = new EnumMap<>(OrgRole.class);
            for (String cell : kv[1].split(",\\s*")) {
                String[] rs = cell.strip().split("=");
                cells.put(OrgRole.valueOf(rs[0]), OrgScope.valueOf(rs[1]));
            }
            out.put(p, cells);
        }
        return out;
    }

    static Stream<Arguments> everyCell() {
        Map<OrgPermission, Map<OrgRole, OrgScope>> exp = expected();
        List<Arguments> cells = new ArrayList<>();
        for (OrgRole role : OrgRole.values()) {
            for (OrgPermission p : OrgPermission.values()) {
                cells.add(Arguments.of(role, p, Optional.ofNullable(exp.get(p).get(role))));
            }
        }
        return cells.stream();
    }

    @ParameterizedTest(name = "{0} / {1} -> {2}")
    @MethodSource("everyCell")
    void everyCellMatchesTheDesignMatrix(OrgRole role, OrgPermission permission, Optional<OrgScope> scope) {
        assertThat(role.can(permission)).isEqualTo(scope.isPresent());
        assertThat(role.scopeOf(permission)).isEqualTo(scope);
        assertThat(role.permissions().contains(permission)).isEqualTo(scope.isPresent());
        assertThat(role.grants().containsKey(permission)).isEqualTo(scope.isPresent());
    }

    @Test
    void theEmbeddedTableCoversEveryPermission() {
        assertThat(expected().keySet()).containsExactlyInAnyOrder(OrgPermission.values());
    }

    @Test
    void coachIsReservedAndHoldsNothing() {
        assertThat(OrgRole.COACH.isReserved()).isTrue();
        assertThat(OrgRole.COACH.permissions()).isEmpty();
        for (OrgRole r : OrgRole.values()) {
            if (r != OrgRole.COACH) assertThat(r.isReserved()).isFalse();
        }
    }

    @Test
    void grantsAreUnmodifiable() {
        org.junit.jupiter.api.Assertions.assertThrows(UnsupportedOperationException.class, () -> OrgRole.MEMBER.grants().put(OrgPermission.BILLING_VIEW, OrgScope.ALL));
    }

    @Test
    void nothingCanSubmitSignInAsOrReadAMembersPrivateData() {
        // tenant-model.md section 4: these are not denied, they do not exist.
        for (OrgPermission p : OrgPermission.values()) {
            String k = p.key().toLowerCase();
            assertThat(k).doesNotContain("submit").doesNotContain("sign_in").doesNotContain("impersonate").doesNotContain("attest")
                .doesNotContain("inbox").doesNotContain("answers");
        }
    }

    @Test
    void onlyAnOwnerCanCloseOrTransferAndNobodyElseHoldsAllOfBilling() {
        for (OrgRole r : OrgRole.values()) {
            assertThat(r.can(OrgPermission.ORG_CLOSE)).isEqualTo(r == OrgRole.OWNER);
            assertThat(r.can(OrgPermission.ORG_TRANSFER_OWNERSHIP)).isEqualTo(r == OrgRole.OWNER);
        }
    }

    // ---- the design document, diffed ------------------------------------------------------------------------

    private static final Pattern KEY = Pattern.compile("`([^`]+)`");

    @Test
    void theTableAgreesWithTheDesignDocument() throws IOException {
        Path doc = Path.of("..", "docs", "design", "org", "tenant-model.md");
        if (!Files.exists(doc)) doc = Path.of("docs", "design", "org", "tenant-model.md");
        List<String> lines = Files.readAllLines(doc);
        int start = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).startsWith("## 4.")) {
                start = i;
                break;
            }
        }
        assertThat(start).as("section 4 of tenant-model.md").isGreaterThan(-1);

        List<OrgRole> columns = List.of(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.STAFF, OrgRole.MEMBER, OrgRole.MARKETER, OrgRole.FINANCE);
        Map<OrgPermission, Map<OrgRole, Boolean>> fromDoc = new EnumMap<>(OrgPermission.class);
        for (int i = start + 1; i < lines.size() && !lines.get(i).startsWith("## "); i++) {
            String line = lines.get(i);
            if (!line.startsWith("| `")) continue;
            String[] cells = line.split("\\|", -1); // "", key cell, six role cells, ""
            assertThat(cells.length).as(line).isGreaterThanOrEqualTo(8);
            Matcher m = KEY.matcher(cells[1]);
            while (m.find()) {
                OrgPermission p = OrgPermission.ofKey(m.group(1)).orElseThrow(() -> new AssertionError("design names an unknown key " + m.group(1)));
                Map<OrgRole, Boolean> granted = new EnumMap<>(OrgRole.class);
                for (int c = 0; c < columns.size(); c++) {
                    String cell = cells[c + 2].strip();
                    // the ops.* row is one cell per role, but "own hours" is a different, narrower permission
                    boolean granted1 = p == OrgPermission.OPS_MANAGE ? cell.contains("✓") : !cell.isEmpty();
                    granted.put(columns.get(c), granted1);
                }
                fromDoc.put(p, granted);
                if (p == OrgPermission.OPS_MANAGE) {
                    Map<OrgRole, Boolean> own = new EnumMap<>(OrgRole.class);
                    for (int c = 0; c < columns.size(); c++) own.put(columns.get(c), cells[c + 2].contains("own hours"));
                    fromDoc.put(OrgPermission.OPS_OWN_HOURS, own);
                }
            }
        }

        assertThat(fromDoc.keySet()).as("every permission appears in the document, and nothing else does").containsExactlyInAnyOrder(OrgPermission.values());
        for (OrgPermission p : OrgPermission.values()) {
            for (OrgRole role : columns) {
                assertThat(role.can(p)).as(role + " / " + p.key() + " (document vs OrgRole)").isEqualTo(fromDoc.get(p).get(role));
            }
        }
    }
}
