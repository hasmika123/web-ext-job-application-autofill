package com.dossier.api.service.ent.export;

/**
 * One CSV cell, safe to open in a spreadsheet (X4.9). A value a spreadsheet would read as a formula (it starts with {@code =}, {@code +}, {@code -},
 * {@code @}, a tab or a carriage return, also after leading blanks) gets a leading apostrophe so it stays text; a value with a comma, quote or line
 * break is quoted. Every organization CSV export goes through here, so no export can carry a formula-injection payload from a name or a free-text field.
 */
public final class CsvSafe {

    private CsvSafe() {}

    public static String cell(String raw) {
        if (raw == null) return "";
        String v = raw;
        int i = 0;
        while (i < v.length() && (v.charAt(i) == ' ' || v.charAt(i) == ' ')) i++;
        if (i < v.length() && "=+-@\t\r".indexOf(v.charAt(i)) >= 0) v = "'" + v;
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) v = "\"" + v.replace("\"", "\"\"") + "\"";
        return v;
    }

    public static String cell(Object raw) {
        return cell(raw == null ? null : raw.toString());
    }

    /** One CRLF-terminated row. */
    public static String row(Object... cells) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(cell(cells[i]));
        }
        return sb.append("\r\n").toString();
    }
}
