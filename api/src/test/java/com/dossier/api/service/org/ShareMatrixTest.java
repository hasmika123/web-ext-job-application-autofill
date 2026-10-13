package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ShareScope;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * O6.1: the {@link ShareField} enum is the visibility matrix of docs/design/org/consent-data-sharing.md section 3, and
 * the two must not drift. The test parses the document's table (row label, then one cell per scope) and compares every
 * cell with {@link ShareField#visibleAt}; a row added to either side without the other fails here.
 */
class ShareMatrixTest {

    private static final String TICK = "✓";

    private record Row(String label, boolean none, boolean summary, boolean full) {}

    private static Path doc() {
        for (String p : new String[] { "../docs/design/org/consent-data-sharing.md", "docs/design/org/consent-data-sharing.md" }) {
            if (Files.exists(Path.of(p))) return Path.of(p);
        }
        throw new AssertionError("consent-data-sharing.md not found from " + Path.of("").toAbsolutePath());
    }

    private static List<Row> docRows() throws IOException {
        List<String> lines = Files.readAllLines(doc(), StandardCharsets.UTF_8);
        int start = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).startsWith("## 3. Visibility matrix")) start = i;
        }
        assertThat(start).as("section 3 of the consent doc").isGreaterThanOrEqualTo(0);
        List<Row> rows = new ArrayList<>();
        boolean inTable = false;
        for (int i = start + 1; i < lines.size(); i++) {
            String line = lines.get(i);
            if (line.startsWith("|")) {
                inTable = true;
                String[] cells = line.split("\\|", -1);
                String label = cells[1].strip();
                if (label.startsWith("data about the member") || label.startsWith("---")) continue;
                rows.add(new Row(label, cells[2].contains(TICK), cells[3].contains(TICK), cells[4].contains(TICK)));
            } else if (inTable) {
                break;
            }
        }
        return rows;
    }

    @Test
    void everyRowOfTheDocumentIsAFieldAndBack() throws IOException {
        List<Row> rows = docRows();
        assertThat(rows).hasSameSizeAs(ShareField.values());
        for (int i = 0; i < rows.size(); i++) {
            ShareField f = ShareField.values()[i];
            Row r = rows.get(i);
            assertThat(r.label()).as("row " + i + " is " + f).startsWith(f.docLabel());
            assertThat(f.visibleAt(ShareScope.NONE)).as(f + " at NONE").isEqualTo(r.none());
            assertThat(f.visibleAt(ShareScope.SUMMARY)).as(f + " at SUMMARY").isEqualTo(r.summary());
            assertThat(f.visibleAt(ShareScope.FULL)).as(f + " at FULL").isEqualTo(r.full());
        }
    }

    @Test
    void aWiderScopeNeverShowsLessThanANarrowerOne() {
        for (ShareField f : ShareField.values()) {
            if (f.visibleAt(ShareScope.NONE)) assertThat(f.visibleAt(ShareScope.SUMMARY)).as(f.name()).isTrue();
            if (f.visibleAt(ShareScope.SUMMARY)) assertThat(f.visibleAt(ShareScope.FULL)).as(f.name()).isTrue();
        }
    }

    @Test
    void privateDataIsVisibleAtNoScopeNotEvenFull() {
        assertThat(ShareField.PRIVATE_DATA.minScope()).isNull();
        for (ShareScope s : ShareScope.values()) assertThat(ShareField.PRIVATE_DATA.visibleAt(s)).isFalse();
        assertThat(ShareField.PRIVATE_DATA.visibleAt(null)).isFalse();
    }

    @Test
    void employerNamesAndDocumentsNeedFull() {
        for (ShareField f : List.of(ShareField.EMPLOYER_DETAILS, ShareField.APPLICATION_DETAIL, ShareField.RESUMES, ShareField.INTERVIEW_CALENDAR, ShareField.JOB_ASSIGNMENTS)) {
            assertThat(f.visibleAt(ShareScope.SUMMARY)).as(f.name()).isFalse();
            assertThat(f.visibleAt(ShareScope.FULL)).as(f.name()).isTrue();
        }
    }
}
