package com.dossier.api.service.catalog.plan;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.TreeMap;
import org.springframework.stereotype.Component;

/**
 * The rendered composition of a published plan version (docs/subscriptions/02 section 7 invariant 3): every component with its resolved price ids, amounts and
 * allowances. It is what quotes and the public catalog read for a historical version, so a read never joins live catalog rows. Immutable: its hash is stored at
 * publish and the nightly {@code CatalogIntegrityJob} re-checks it.
 *
 * <p>The hash is taken over a <b>canonical</b> form (object keys sorted, no whitespace), because MySQL's JSON column normalises key order and spacing. Only
 * integers, strings and booleans appear in the snapshot (no doubles), and the Stripe price id is deliberately left out: it may be filled in later without the
 * version changing.
 */
@Component
public class PlanSnapshot {

    private final ObjectMapper mapper;

    public PlanSnapshot(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public ObjectNode newObject() {
        return mapper.createObjectNode();
    }

    /** The compact JSON that is stored in {@code snapshot_json}. */
    public String toJson(JsonNode snapshot) {
        return canonical(snapshot);
    }

    /** SHA-256 (hex) of the canonical form of {@code json}; the same value however the database re-serialised it. */
    public String hash(String json) {
        try {
            return hash(mapper.readTree(json));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("snapshot is not JSON", e);
        }
    }

    public String hash(JsonNode node) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical(node).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    String canonical(JsonNode node) {
        try {
            return mapper.writeValueAsString(sorted(node));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static JsonNode sorted(JsonNode n) {
        if (n.isObject()) {
            TreeMap<String, JsonNode> sorted = new TreeMap<>();
            n.fields().forEachRemaining(e -> sorted.put(e.getKey(), sorted(e.getValue())));
            ObjectNode out = JsonNodeFactory.instance.objectNode();
            sorted.forEach(out::set);
            return out;
        }
        if (n.isArray()) {
            ArrayNode out = JsonNodeFactory.instance.arrayNode();
            n.forEach(e -> out.add(sorted(e)));
            return out;
        }
        return n;
    }

    public JsonNode parse(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return mapper.readTree(json);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /** Names of an array of strings (helper for diffing). */
    public static List<String> texts(JsonNode array) {
        List<String> out = new ArrayList<>();
        if (array != null && array.isArray()) array.forEach(e -> out.add(e.asText()));
        Collections.sort(out);
        return out;
    }
}
