package com.dossier.api.service.privacy;

import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The subprocessor register (REAL-GAPS-C T1.5): who processes personal data on our behalf, why, which data, where, with a link to their terms. It is admin-configured
 * ({@code legal.subprocessor.01..12} in the settings registry; the code defaults list the services this product actually uses, each with the DPA status "To be confirmed").
 * The public page shows {@link #publicList}; the admin page also gets the DPA status ({@link #adminList}), which is the admin's own tracker and is not published.
 */
@Service
public class SubprocessorRegister {

    private static final Logger LOG = LoggerFactory.getLogger(SubprocessorRegister.class);

    /** One slot: {@code slot} is 1..12; {@code empty} slots carry only the number and the key. */
    public record Entry(int slot, String key, boolean empty, String name, String purpose, String data, String location, String link, String dpaStatus) {}

    private final ResumeBuilderSettings settings;

    public SubprocessorRegister(ResumeBuilderSettings settings) {
        this.settings = settings;
    }

    /** All twelve slots in order, unused ones included, with the DPA status: what the admin page edits. */
    public List<Entry> adminList() {
        List<Entry> out = new ArrayList<>();
        for (int i = 1; i <= AdminSettingKeys.SUBPROCESSOR_SLOTS; i++) out.add(read(i));
        return out;
    }

    /** The used slots only, without the DPA status: what the public page shows. */
    public List<Entry> publicList() {
        return adminList()
            .stream()
            .filter(e -> !e.empty())
            .map(e -> new Entry(e.slot(), e.key(), false, e.name(), e.purpose(), e.data(), e.location(), e.link(), null))
            .toList();
    }

    private Entry read(int slot) {
        String key = AdminSettingKeys.subprocessorKey(slot);
        try {
            JsonNode n = settings.getJson(key, JsonNode.class);
            if (n == null || !n.isObject() || n.isEmpty() || text(n, "name").isBlank()) return new Entry(slot, key, true, null, null, null, null, null, null);
            return new Entry(slot, key, false, text(n, "name"), text(n, "purpose"), text(n, "data"), text(n, "location"), text(n, "link"), text(n, "dpaStatus"));
        } catch (RuntimeException e) {
            LOG.warn("Subprocessor register slot {} could not be read ({})", slot, e.getClass().getSimpleName());
            return new Entry(slot, key, true, null, null, null, null, null, null);
        }
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || !v.isTextual() ? "" : v.textValue().trim();
    }
}
