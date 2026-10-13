package com.dossier.api.service.ent.authz;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * "05 section 2's table matches the reason codes in code" (X1.7 definition of done): every step 1-11 of the evaluation order in
 * the design document names its failure codes and their HTTP status; {@link AuthzReason} must carry exactly those codes at the
 * same step and status, and nothing else. Changing the order, a code or a status in one place without the other fails here.
 */
class AuthorizationOrderDocSyncTest {

    private static final Pattern CODE = Pattern.compile("`([A-Z][A-Z_]+)`");
    private static final Pattern NUMBER = Pattern.compile("\\b([1-5][0-9]{2})\\b");

    private record Row(int step, String failureCell) {}

    private static List<Row> rows() throws IOException {
        Path doc = Path.of("..", "docs", "enterprise-v2", "05-permission-model.md");
        if (!Files.exists(doc)) doc = Path.of("docs", "enterprise-v2", "05-permission-model.md");
        List<String> lines = Files.readAllLines(doc);
        int start = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).startsWith("## 2.")) {
                start = i;
            } else if (start >= 0 && lines.get(i).startsWith("## 3.")) {
                break;
            }
        }
        assertThat(start).as("section 2 of 05-permission-model.md").isGreaterThan(-1);
        List<Row> out = new ArrayList<>();
        for (int i = start + 1; i < lines.size() && !lines.get(i).startsWith("## 3."); i++) {
            String line = lines.get(i);
            if (!line.matches("^\\|\\s*\\d+\\s*\\|.*")) continue;
            String[] cells = line.split("\\|", -1); // "", step, check, source, failure, ""
            assertThat(cells.length).as(line).isGreaterThanOrEqualTo(6);
            out.add(new Row(Integer.parseInt(cells[1].trim()), cells[4]));
        }
        return out;
    }

    /** The status the document gives {@code code} in {@code cell}: a number written just before it ("409 `ORG_STATE`"), else the first number after it ("`X` -> 404"). */
    private static int statusOf(String cell, String code) {
        Matcher before = Pattern.compile("([1-5][0-9]{2})\\s+`" + code + "`").matcher(cell);
        if (before.find()) return Integer.parseInt(before.group(1));
        int at = cell.indexOf("`" + code + "`");
        Matcher after = NUMBER.matcher(cell.substring(at + code.length() + 2));
        assertThat(after.find()).as("a status after %s in %s", code, cell).isTrue();
        return Integer.parseInt(after.group(1));
    }

    @Test
    void theDocumentHasElevenStepsInOrder() throws IOException {
        List<Row> rows = rows();
        assertThat(rows).extracting(Row::step).containsExactly(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
    }

    @Test
    void everyFailureCodeOfTheDocumentIsInTheEnumAtTheSameStepAndStatus() throws IOException {
        Set<AuthzReason> seen = EnumSet.noneOf(AuthzReason.class);
        for (Row row : rows()) {
            Matcher m = CODE.matcher(row.failureCell());
            int found = 0;
            while (m.find()) {
                found++;
                String code = m.group(1);
                AuthzReason reason = AuthzReason.valueOf(code); // an unknown code in the document fails here
                assertThat(reason.step()).as("%s is a step-%d failure in the document", code, row.step()).isEqualTo(row.step());
                assertThat(reason.httpStatus()).as("HTTP status of %s", code).isEqualTo(statusOf(row.failureCell(), code));
                seen.add(reason);
            }
            assertThat(found).as("step %d names at least one failure code", row.step()).isGreaterThan(0);
        }
        assertThat(seen).as("the enum has no code the document does not list").containsExactlyInAnyOrder(AuthzReason.values());
    }

    @Test
    void theTokenCaseOfStepOneIsTheFilters401NotThisServices() throws IOException {
        // "(401 for the token case)": TenantTokenBindingFilter answers it before any handler runs; the service refuses the same condition
        // as a 404 TENANT_MISMATCH and never produces a 401
        Row one = rows().get(0);
        assertThat(one.failureCell()).contains("401 for the token case");
        assertThat(AuthzReason.TENANT_MISMATCH.httpStatus()).isEqualTo(404);
        for (AuthzReason r : AuthzReason.values()) assertThat(r.httpStatus()).isNotEqualTo(401);
    }

    @Test
    void onlyTheHookStepsAreHooksAndTheOthersAreImplementedInTheService() {
        Set<Integer> implemented = new HashSet<>(Set.of(1, 2, 3, 4, 5, 9));
        Set<Integer> hooks = new HashSet<>(Set.of(6, 7, 8, 10, 11));
        Set<Integer> all = new HashSet<>(implemented);
        all.addAll(hooks);
        assertThat(all).containsExactlyInAnyOrder(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
        Set<Integer> reasonSteps = new HashSet<>();
        for (AuthzReason r : AuthzReason.values()) reasonSteps.add(r.step());
        assertThat(reasonSteps).isEqualTo(all);
    }
}
