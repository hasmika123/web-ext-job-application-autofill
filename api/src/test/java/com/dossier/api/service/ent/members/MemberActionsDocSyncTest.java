package com.dossier.api.service.ent.members;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.web.rest.ent.OrgMemberBulkResource;
import com.dossier.api.web.rest.ent.OrgMemberLifecycleResource;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

/**
 * "The document and the code say the same thing" for the people actions (the {@code RoleTemplateDocSyncTest} idea, for X4.3 and X4.4): the bulk
 * actions of 15-employees-and-teams.md section 3.2 and the seat transitions of section 2 must each be either implemented (with the route or the audit
 * action to prove it) or listed here, by name, as owned by a story that has not built it. Adding an action to the document without code, or a
 * route without the document, fails this test and says which.
 */
class MemberActionsDocSyncTest {

    /** Bulk actions the document lists that another story owns: resend is the invitation framework's (X1.8). */
    private static final Set<String> BULK_DEFERRED = Set.of("resend");

    /** Seat actions of section 2, by the first words of their row, implemented here. */
    private static final Set<String> TRANSITIONS_IMPLEMENTED = Set.of("Assign roles", "Assign department / team", "Set manager", "Suspend", "Reinstate", "Deactivate / Offboard");

    /** Rows another story owns (invitations X1.8/X1.15, self-service leave, ownership transfer) or that have no endpoint by design (activation is by acceptance only). */
    private static final Set<String> TRANSITIONS_DEFERRED = Set.of("Invite", "Accept invitation", "Reinstate after removal", "Leave", "Transfer ownership");

    private static final Set<String> TRANSITIONS_NO_ENDPOINT = Set.of("Activate");

    private static String doc() throws IOException {
        Path doc = Path.of("..", "docs", "enterprise-v2", "15-employees-and-teams.md");
        if (!Files.exists(doc)) doc = Path.of("docs", "enterprise-v2", "15-employees-and-teams.md");
        return Files.readString(doc);
    }

    private static String section(String doc, String heading) {
        int start = doc.indexOf(heading);
        assertThat(start).as("heading " + heading).isGreaterThanOrEqualTo(0);
        int next = doc.indexOf("\n## ", start + heading.length());
        int nextSub = doc.indexOf("\n### ", start + heading.length());
        int end = next < 0 ? doc.length() : next;
        if (nextSub >= 0 && nextSub < end && heading.startsWith("### ")) end = nextSub;
        return doc.substring(start, end);
    }

    @Test
    void everyBulkActionOfTheDocumentIsBuiltOrNamedAsDeferred() throws IOException {
        String s32 = section(doc(), "### 3.2 Bulk actions");
        Set<String> documented = new TreeSet<>();
        Matcher m = Pattern.compile("/bulk/([a-z]+)").matcher(s32);
        while (m.find()) documented.add(m.group(1));
        assertThat(documented).as("the bulk table of doc 15 section 3.2").isNotEmpty();

        Set<String> built = new TreeSet<>();
        for (Method method : OrgMemberBulkResource.class.getDeclaredMethods()) {
            PostMapping post = method.getAnnotation(PostMapping.class);
            if (post != null) for (String path : post.value()) built.add(path.replaceFirst("^/", ""));
        }
        assertThat(built).as("the bulk routes in OrgMemberBulkResource").isNotEmpty();

        Set<String> expected = new TreeSet<>(built);
        expected.addAll(BULK_DEFERRED);
        assertThat(documented).as("doc 15 section 3.2 lists exactly the built bulk actions plus the deferred ones").isEqualTo(expected);
        assertThat(built).as("a deferred action must not also be built").doesNotContainAnyElementsOf(BULK_DEFERRED);
    }

    @Test
    void theBulkStatusActionsAreTheOnesTheDocumentNames() throws IOException {
        String s32 = section(doc(), "### 3.2 Bulk actions");
        assertThat(s32).contains("SUSPEND\\|REINSTATE");
        assertThat(OrgMemberBulkServiceActions.statusActions()).containsExactlyInAnyOrder("SUSPEND", "REINSTATE");
        assertThat(s32).as("every bulk call writes a MEMBER_BULK summary").contains(MemberAuditActions.MEMBER_BULK);
        assertThat(s32).as("every bulk call is idempotent-keyed and returns per-row results").contains("ok: n, skipped");
    }

    @Test
    void everySeatActionOfTheLifecycleTableIsBuiltOrNamedAsDeferred() throws IOException {
        String s2 = section(doc(), "## 2. The seat lifecycle");
        Set<String> documented = new LinkedHashSet<>();
        Matcher m = Pattern.compile("(?m)^\\|\\s*([A-Z][^|]*?)\\s*\\|\\s*[^|]*\\|\\s*[^|]*\\|").matcher(s2);
        while (m.find()) {
            String action = m.group(1).trim();
            if (action.startsWith("Action") || action.startsWith("---")) continue;
            documented.add(action);
        }
        assertThat(documented).as("the seat lifecycle table of doc 15 section 2").hasSizeGreaterThanOrEqualTo(10);

        Set<String> classified = new TreeSet<>();
        classified.addAll(TRANSITIONS_IMPLEMENTED);
        classified.addAll(TRANSITIONS_DEFERRED);
        classified.addAll(TRANSITIONS_NO_ENDPOINT);
        assertThat(documented).as("every row of doc 15 section 2 must be classified in this test as implemented, deferred or no-endpoint").isEqualTo(classified);
    }

    @Test
    void everyImplementedTransitionHasItsRouteAndItsAuditAction() {
        Set<String> routes = new TreeSet<>();
        for (Method method : OrgMemberLifecycleResource.class.getDeclaredMethods()) {
            for (PostMapping a : List.of(method.getAnnotationsByType(PostMapping.class))) for (String p : a.value()) routes.add("POST " + p);
            for (GetMapping a : List.of(method.getAnnotationsByType(GetMapping.class))) for (String p : a.value()) routes.add("GET " + p);
            for (DeleteMapping a : List.of(method.getAnnotationsByType(DeleteMapping.class))) for (String p : a.value()) routes.add("DELETE " + p);
        }
        assertThat(routes).contains(
            "POST /{memberId}/suspend", "POST /{memberId}/reinstate", "POST /{memberId}/offboard", "GET /{memberId}/offboard-preview", "GET /offboarding",
            "DELETE /offboarding/{offboardingId}"
        );
        // the audit actions the table names for the transitions exist as constants
        assertThat(MemberAuditActions.MEMBER_REINSTATE).isEqualTo("MEMBER_REINSTATE");
        assertThat(MemberAuditActions.MEMBER_GROUP).isEqualTo("MEMBER_GROUP");
        assertThat(MemberAuditActions.MEMBER_MANAGER).isEqualTo("MEMBER_MANAGER");
        assertThat(com.dossier.api.service.org.OrgAuditService.MEMBER_SUSPEND).isEqualTo("MEMBER_SUSPEND");
        assertThat(com.dossier.api.service.org.OrgAuditService.MEMBER_REMOVE).isEqualTo("MEMBER_REMOVE");
    }

    @Test
    void theDocumentNamesTheAuditActionsTheCodeWrites() throws IOException {
        String s2 = section(doc(), "## 2. The seat lifecycle");
        for (String action : List.of("MEMBER_SUSPEND", "MEMBER_REINSTATE", "MEMBER_REMOVE", "MEMBER_GROUP", "MEMBER_MANAGER")) {
            assertThat(s2).as("doc 15 section 2 names " + action).contains(action);
        }
    }

    /** The statuses the bulk status action accepts, read from the service's own constants. */
    private static final class OrgMemberBulkServiceActions {

        static List<String> statusActions() {
            return List.of(com.dossier.api.service.ent.members.OrgMemberBulkService.ACTION_SUSPEND, com.dossier.api.service.ent.members.OrgMemberBulkService.ACTION_REINSTATE);
        }
    }
}
