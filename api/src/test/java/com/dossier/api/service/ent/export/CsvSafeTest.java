package com.dossier.api.service.ent.export;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.dto.ent.ReportsDTO;
import com.dossier.api.service.ent.reports.OrgReportsExportService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** X4.9: every organization CSV cell is safe to open in a spreadsheet. */
class CsvSafeTest {

    @Test
    void formulaStartsAreNeutralisedAlsoAfterLeadingBlanks() {
        assertThat(CsvSafe.cell("=HYPERLINK(\"http://evil\")")).isEqualTo("\"'=HYPERLINK(\"\"http://evil\"\")\"");
        assertThat(CsvSafe.cell("+1")).isEqualTo("'+1");
        assertThat(CsvSafe.cell("-2+3")).isEqualTo("'-2+3");
        assertThat(CsvSafe.cell("@SUM(A1)")).isEqualTo("'@SUM(A1)");
        assertThat(CsvSafe.cell("\tcmd")).isEqualTo("'\tcmd");
        assertThat(CsvSafe.cell("  =1+1")).isEqualTo("'  =1+1");
    }

    @Test
    void ordinaryValuesPassAndSpecialCharactersAreQuoted() {
        assertThat(CsvSafe.cell((String) null)).isEmpty();
        assertThat(CsvSafe.cell("Priya Nair")).isEqualTo("Priya Nair");
        assertThat(CsvSafe.cell("a,b")).isEqualTo("\"a,b\"");
        assertThat(CsvSafe.cell("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
        assertThat(CsvSafe.cell(42)).isEqualTo("42");
        assertThat(CsvSafe.row("a", 1, null)).isEqualTo("a,1,\r\n");
    }

    @Test
    void theReportsCsvGuardsNamesAndCarriesNoSurprises() {
        ReportsDTO.Overview o = new ReportsDTO.Overview(
            1L,
            Instant.parse("2026-10-16T00:00:00Z"),
            30,
            List.of(new ReportsDTO.Tile("a", "Active consultants", 3.0, 2.0, null)),
            new ReportsDTO.Roster(3, List.of(new ReportsDTO.Slice("ACTIVE", "Active", 2)), List.of()),
            new ReportsDTO.Funnel(0, 0, 0, null, List.of(), List.of()),
            new ReportsDTO.Interviews(0, 0, 0, 0, 0, List.of()),
            new ReportsDTO.Placements(0, 0, 0, List.of()),
            List.of(new ReportsDTO.ClientRow("=cmd|' /C calc'!A0", 2)),
            List.of(new ReportsDTO.MarketerRow(9L, "@evil", 1, 1)),
            new ReportsDTO.FirstSubmission(null, 0)
        );
        String csv = OrgReportsExportService.toCsv(o);
        assertThat(csv).startsWith("Section,Item,Value,Detail\r\n").contains("Active consultants,3.0").contains("'=cmd|").contains("'@evil");
        assertThat(csv.lines().filter(l -> l.startsWith("Top clients")).findFirst().orElseThrow()).doesNotContain(",=cmd");
    }
}
