package com.dossier.api.service.resume;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Iterator;
import java.util.Map;

/**
 * Deterministic JSON writer for the Resume Builder contract. It exists so the Java and TypeScript
 * implementations can agree <b>byte for byte</b>; Jackson's own printers differ from
 * {@code JSON.stringify} in escape casing and in pretty-print spacing.
 *
 * <p>Formatting rules (the TypeScript port must reproduce them exactly):
 * <ul>
 *   <li>Object keys are written in the node's insertion order (callers decide the order).</li>
 *   <li>Compact ({@code indent == 0}) is {@code JSON.stringify(x)}; indented is
 *       {@code JSON.stringify(x, null, indent)} - {@code "key": value}, one element per line,
 *       empty array {@code []}, empty object {@code {}}. Newline is {@code \n}; no trailing newline
 *       is added here.</li>
 *   <li>Strings escape {@code "} {@code \} and the short forms {@code \b \f \n \r \t}; any other
 *       char below U+0020 and any lone UTF-16 surrogate is a backslash, "u" and four <b>lowercase</b> hex digits.
 *       Everything else (including U+007F, U+2028, U+2029 and all non-ASCII) is written raw.</li>
 *   <li>Numbers are integers only (the validator rejects fractions) and are written in plain decimal.</li>
 * </ul>
 */
public final class ResumeDocumentJson {

    private ResumeDocumentJson() {}

    public static String write(JsonNode node, int indent) {
        StringBuilder sb = new StringBuilder(256);
        write(sb, node, indent, 0);
        return sb.toString();
    }

    private static void write(StringBuilder sb, JsonNode n, int indent, int depth) {
        if (n == null || n.isNull() || n.isMissingNode()) {
            sb.append("null");
        } else if (n.isTextual()) {
            string(sb, n.textValue());
        } else if (n.isBoolean()) {
            sb.append(n.booleanValue() ? "true" : "false");
        } else if (n.isNumber()) {
            sb.append(n.asText());
        } else if (n.isArray()) {
            if (n.isEmpty()) {
                sb.append("[]");
                return;
            }
            sb.append('[');
            boolean first = true;
            for (JsonNode child : n) {
                if (!first) sb.append(',');
                first = false;
                newline(sb, indent, depth + 1);
                write(sb, child, indent, depth + 1);
            }
            newline(sb, indent, depth);
            sb.append(']');
        } else if (n.isObject()) {
            if (n.isEmpty()) {
                sb.append("{}");
                return;
            }
            sb.append('{');
            boolean first = true;
            Iterator<Map.Entry<String, JsonNode>> it = n.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                if (!first) sb.append(',');
                first = false;
                newline(sb, indent, depth + 1);
                string(sb, e.getKey());
                sb.append(indent > 0 ? ": " : ":");
                write(sb, e.getValue(), indent, depth + 1);
            }
            newline(sb, indent, depth);
            sb.append('}');
        } else {
            sb.append("null");
        }
    }

    private static void newline(StringBuilder sb, int indent, int depth) {
        if (indent <= 0) return;
        sb.append('\n');
        for (int i = 0; i < indent * depth; i++) sb.append(' ');
    }

    private static void string(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        unicode(sb, c);
                    } else if (Character.isHighSurrogate(c)) {
                        if (i + 1 < s.length() && Character.isLowSurrogate(s.charAt(i + 1))) {
                            sb.append(c).append(s.charAt(++i));
                        } else {
                            unicode(sb, c);
                        }
                    } else if (Character.isLowSurrogate(c)) {
                        unicode(sb, c);
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }

    private static void unicode(StringBuilder sb, char c) {
        sb.append("\\u");
        String hex = Integer.toHexString(c);
        for (int i = hex.length(); i < 4; i++) sb.append('0');
        sb.append(hex);
    }
}
