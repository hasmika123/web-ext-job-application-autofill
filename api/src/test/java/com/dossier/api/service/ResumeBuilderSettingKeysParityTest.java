package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * Keeps {@link ResumeBuilderSettingKeys} in step with the table in
 * {@code docs/RESUME-BUILDER-DESIGN.md} section 15.2: every key named there is declared, and every
 * default the table states as a plain number, boolean or JSON value is the declared default.
 * (Same idea as the roadmap settings parity test: the document and the code cannot drift apart.)
 */
class ResumeBuilderSettingKeysParityTest {

    private static final Pattern TICKED = Pattern.compile("`([^`]+)`");
    private final ObjectMapper mapper = new ObjectMapper();

    /** One table row: the keys of its first cell, in order, and the raw default cell. */
    private record Row(List<String> keys, String defaults) {}

    private List<Row> rows() throws IOException {
        Path doc = Path.of("..", "docs", "RESUME-BUILDER-DESIGN.md");
        if (!Files.exists(doc)) doc = Path.of("docs", "RESUME-BUILDER-DESIGN.md");
        String text = Files.readString(doc, StandardCharsets.UTF_8);
        int start = text.indexOf("### 15.2");
        int end = text.indexOf("Hard constants", start);
        assertThat(start).as("section 15.2 present").isGreaterThan(0);
        assertThat(end).as("end of the 15.2 table").isGreaterThan(start);

        List<Row> rows = new ArrayList<>();
        for (String line : text.substring(start, end).split("\n")) {
            if (!line.startsWith("| `")) continue;
            String[] cells = line.split("\\|");
            // cells[0] is empty (leading pipe): key, type, default, ...
            String keyCell = cells[1].replaceAll("\\(=[^)]*\\)", " "); // an "(= alias)" note is not a second key
            List<String> keys = new ArrayList<>();
            String prefix = null;
            Matcher m = TICKED.matcher(keyCell);
            while (m.find()) {
                String token = m.group(1).trim();
                String full = token.startsWith(".") ? prefix + token : token;
                prefix = full.substring(0, full.lastIndexOf('.'));
                keys.add(full);
            }
            // A "(note)" after a default is commentary, not part of the value.
            rows.add(new Row(keys, cells.length > 3 ? cells[3].replaceAll("\\([^)]*\\)", " ").trim() : ""));
        }
        return rows;
    }

    @Test
    void everyKeyNamedInDesign152IsDeclared() throws IOException {
        List<Row> rows = rows();
        assertThat(rows).hasSizeGreaterThan(35);
        List<String> missing = new ArrayList<>();
        int named = 0;
        for (Row row : rows) {
            for (String key : row.keys()) {
                named++;
                if (ResumeBuilderSettingKeys.find(key) == null) missing.add(key);
            }
        }
        assertThat(missing).as("keys named in DESIGN 15.2 but not declared").isEmpty();
        assertThat(named).as("keys parsed from the table").isGreaterThan(70);
    }

    @Test
    void defaultsStatedInDesign152MatchTheDeclaredDefaults() throws IOException {
        Map<String, String> mismatches = new LinkedHashMap<>();
        int compared = 0;
        for (Row row : rows()) {
            // Keys that are aliases of another key carry no default of their own.
            List<String> keys = row.keys().stream().filter(k -> !ResumeBuilderSettingKeys.ALIASES.containsKey(k)).toList();
            if (keys.isEmpty()) continue;
            List<String> defaults = splitDefaults(row.defaults());
            if (defaults.size() == 1 && keys.size() > 1) defaults = java.util.Collections.nCopies(keys.size(), defaults.get(0));
            if (defaults.size() != keys.size()) continue; // prose default ("all registered", "the 6 hexes")
            for (int i = 0; i < keys.size(); i++) {
                String stated = defaults.get(i).replace("_", "").replace(" ", "");
                if (stated.isEmpty()) continue;
                ResumeBuilderSettingKeys.Key declared = ResumeBuilderSettingKeys.require(keys.get(i));
                if (!comparable(stated)) continue;
                compared++;
                if (!sameValue(declared.defaultValue(), stated)) mismatches.put(keys.get(i), stated + " vs declared " + declared.defaultValue());
            }
        }
        assertThat(mismatches).as("defaults that differ from DESIGN 15.2").isEmpty();
        assertThat(compared).as("scalar and JSON defaults compared").isGreaterThan(60);
    }

    @Test
    void theDesignDefaultsThatAreProseAreTheOnesTheStoryAnswered() {
        // DESIGN 15.2 gives these in words; the R2.0 decisions fix them here.
        assertThat(ResumeBuilderSettingKeys.require(ResumeBuilderSettingKeys.TEMPLATES_ENABLED).defaultValue()).isEqualTo("[\"modern\"]");
        assertThat(ResumeBuilderSettingKeys.require(ResumeBuilderSettingKeys.THEME_ACCENT_PALETTE).defaultValue())
            .isEqualTo("[\"#16a34a\",\"#2563eb\",\"#7c3aed\",\"#ec4899\",\"#f97316\",\"#eab308\"]");
        assertThat(ResumeBuilderSettingKeys.require(ResumeBuilderSettingKeys.SCORE_GROUP_WEIGHTS).defaultValue())
            .isEqualTo("{\"G1\":15,\"G2\":25,\"G3\":20,\"G4\":20,\"G5\":20,\"G6\":10}");
        assertThat(ResumeBuilderSettingKeys.require(ResumeBuilderSettingKeys.PDF_WAIT_MS).defaultValue()).isEqualTo("30000");
    }

    // ---- helpers ------------------------------------------------------------

    /** Splits "a / b / c" on the slashes outside brackets and braces. */
    private static List<String> splitDefaults(String cell) {
        List<String> out = new ArrayList<>();
        int depth = 0;
        StringBuilder cur = new StringBuilder();
        for (char c : cell.toCharArray()) {
            if (c == '[' || c == '{') depth++;
            if (c == ']' || c == '}') depth--;
            if (c == '/' && depth == 0) {
                out.add(cur.toString().trim());
                cur.setLength(0);
            } else {
                cur.append(c);
            }
        }
        out.add(cur.toString().trim());
        return out;
    }

    /** Only numbers, booleans and valid JSON are compared; prose is skipped. */
    private boolean comparable(String stated) {
        if (stated.matches("-?\\d+(\\.\\d+)?|true|false")) return true;
        if (stated.startsWith("[") || stated.startsWith("{") || stated.startsWith("\"")) {
            try {
                mapper.readTree(stated);
                return true;
            } catch (IOException e) {
                return false;
            }
        }
        return false;
    }

    private boolean sameValue(String declared, String stated) {
        if (stated.startsWith("\"")) return declared.equals(stated.substring(1, stated.length() - 1)); // a STRING/ENUM key
        try {
            if (stated.startsWith("[") || stated.startsWith("{")) {
                JsonNode a = mapper.readTree(declared);
                JsonNode b = mapper.readTree(stated);
                return a.equals(b);
            }
        } catch (IOException e) {
            return declared.equals(stated);
        }
        if (stated.matches("-?\\d+(\\.\\d+)?")) return Double.parseDouble(declared) == Double.parseDouble(stated);
        return declared.equals(stated);
    }
}
