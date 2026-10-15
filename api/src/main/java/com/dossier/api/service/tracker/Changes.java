package com.dossier.api.service.tracker;

import com.dossier.api.service.dto.TrackerDTOs.ChangeDTO;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * "What changed" on a history row (docs/change-audit/README.md section 2.4): a JSON array of {@code {f, from, to}}, at most {@value #MAX_CHARS}
 * characters, built from typed entries that REFUSE free text by construction. Only these can enter it:
 * <ul>
 *   <li>{@link #enumValue} / {@link #code}: an enum name or an upper-snake code (status, outcome, interview kind) - {@code from} and {@code to};</li>
 *   <li>{@link #flag}: a boolean (starred, archived, pinned);</li>
 *   <li>{@link #instant}: an ISO-8601 instant (next-step date, interview start);</li>
 *   <li>{@link #number}: a number (a resume id);</li>
 *   <li>{@link #text}: the NAME of a free-text field and nothing else - the value stays on the record, never in the history.</li>
 * </ul>
 * The first entry is the headline: when the array would be longer than the column, entries are dropped from the end, never from the front.
 */
public final class Changes {

    /** The column's width. */
    public static final int MAX_CHARS = 1000;

    private static final Pattern FIELD = Pattern.compile("[A-Za-z][A-Za-z0-9]{0,31}");
    private static final Pattern CODE = Pattern.compile("[A-Z0-9_]{1,24}");
    private static final ObjectMapper JSON = new ObjectMapper();

    private record Entry(String f, String from, String to) {}

    private final List<Entry> entries = new ArrayList<>();

    public static Changes none() {
        return new Changes();
    }

    public Changes enumValue(String field, Enum<?> from, Enum<?> to) {
        return code(field, from == null ? null : from.name(), to == null ? null : to.name());
    }

    /** An upper-snake code such as {@code ACCEPTED} or {@code VIDEO}; anything else is a programming error (free text must use {@link #text}). */
    public Changes code(String field, String from, String to) {
        return add(field, checkCode(from), checkCode(to));
    }

    public Changes flag(String field, Boolean from, Boolean to) {
        return add(field, from == null ? null : String.valueOf(from), to == null ? null : String.valueOf(to));
    }

    public Changes instant(String field, Instant from, Instant to) {
        return add(field, from == null ? null : from.toString(), to == null ? null : to.toString());
    }

    public Changes number(String field, Long from, Long to) {
        return add(field, from == null ? null : String.valueOf(from), to == null ? null : String.valueOf(to));
    }

    /** A free-text field changed: its name only. */
    public Changes text(String field) {
        return add(field, null, null);
    }

    public boolean isEmpty() {
        return entries.isEmpty();
    }

    public int size() {
        return entries.size();
    }

    /** The changed field names, headline first. */
    public List<String> fields() {
        return entries.stream().map(Entry::f).toList();
    }

    /** The column value; {@code null} when nothing changed. */
    public String toJson() {
        if (entries.isEmpty()) return null;
        List<Entry> kept = new ArrayList<>(entries);
        String json = write(kept);
        while (json.length() > MAX_CHARS && kept.size() > 1) {
            kept.remove(kept.size() - 1);
            json = write(kept);
        }
        return json;
    }

    /** The entries of a stored column value; empty for null, blank or anything that is not the expected array (a bad row must never break a timeline). */
    public static List<ChangeDTO> parse(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            JsonNode n = JSON.readTree(json);
            if (n == null || !n.isArray()) return List.of();
            List<ChangeDTO> out = new ArrayList<>();
            for (JsonNode e : n) {
                if (!e.hasNonNull("f")) continue;
                out.add(new ChangeDTO(e.get("f").asText(), e.hasNonNull("from") ? e.get("from").asText() : null, e.hasNonNull("to") ? e.get("to").asText() : null));
            }
            return out;
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    // ---- internals ------------------------------------------------------------------------------------------

    private Changes add(String field, String from, String to) {
        if (field == null || !FIELD.matcher(field).matches()) throw new IllegalArgumentException("not a field name: " + field);
        entries.add(new Entry(field, from, to));
        return this;
    }

    private static String checkCode(String v) {
        if (v == null) return null;
        if (!CODE.matcher(v).matches()) throw new IllegalArgumentException("a change value must be a code, not free text");
        return v;
    }

    private static String write(List<Entry> list) {
        ArrayNode arr = JSON.createArrayNode();
        for (Entry e : list) {
            ObjectNode o = arr.addObject();
            o.put("f", e.f());
            if (e.from() != null) o.put("from", e.from());
            if (e.to() != null) o.put("to", e.to());
        }
        return arr.toString();
    }
}
