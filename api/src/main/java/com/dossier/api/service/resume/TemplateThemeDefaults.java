package com.dossier.api.service.resume;

import com.dossier.api.service.ResumeDocException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * The Java twin of a template's {@code meta.defaults} (packages/ui {@code TemplateMeta.defaults}) and of the
 * rule that applies it on a template switch (Resume Builder DESIGN 4 + 6.5, R3.4): the new template's
 * default for every theme key the user has not touched ({@code theme._touched}); touched keys keep the
 * user's value. {@code PATCH .../doc/template} applies it, so the stored theme, the version row and the PDF
 * all see the same result the editor shows.
 *
 * <p>A template story (R7.1) adds its entry to {@link #BUILT_IN} and to {@code meta.defaults} in the web
 * registry; {@code template-defaults.json}, a fixture shared byte-for-byte with the TypeScript registry
 * test, fails when the two sides differ. Only the theme keys in {@link #DEFAULTABLE} can be defaulted
 * (the derived {@code size/density/margin}, {@code fit} and {@code _touched} cannot).
 */
@Component
public class TemplateThemeDefaults {

    /** Theme keys a template may default (the user-facing, stored ones). */
    static final Set<String> DEFAULTABLE = Set.of("accent", "fontPair", "spacing", "pageSize", "dateStyle", "showPhoto");

    /**
     * Per-template defaults, by template id: the twin of each web template's {@code meta.defaults}, in gallery order
     * (docs/resume-builder/templates/TEMPLATES-DESIGN.md section 0). Modern leaves the user's theme alone. Each
     * template story adds its entry here and to {@code template-defaults.json}.
     */
    static final Map<String, Map<String, Object>> BUILT_IN = Map.ofEntries(
        Map.entry("modern", Map.of()),
        Map.entry("classic", Map.of("fontPair", "source-serif", "spacing", "normal"))
    );

    /** The defaults the template declares, as a JSON object (empty when it declares none or is unknown). */
    public ObjectNode defaultsFor(String templateId) {
        return toJson(templateId == null ? null : BUILT_IN.get(templateId));
    }

    static ObjectNode toJson(Map<String, Object> declared) {
        ObjectNode out = JsonNodeFactory.instance.objectNode();
        if (declared == null) return out;
        declared.forEach((k, v) -> {
            if (!DEFAULTABLE.contains(k)) return;
            if (v == null) out.putNull(k);
            else if (v instanceof Boolean b) out.put(k, b);
            else out.put(k, v.toString());
        });
        return out;
    }

    /**
     * The theme after a template switch: {@code current} (the stored theme, possibly {@code null}) with every
     * key of {@code defaults} that is not in {@code current._touched} set to the template's default. Returns
     * the validated, canonically ordered theme ({@link ResumeThemeValidator#sanitize}), or {@code null} when
     * nothing changes (no write needed).
     */
    public static ObjectNode apply(JsonNode current, JsonNode defaults) {
        if (defaults == null || !defaults.isObject() || defaults.isEmpty()) return null;
        ObjectNode base;
        try {
            base = ResumeThemeValidator.sanitize(current == null || !current.isObject() ? JsonNodeFactory.instance.objectNode() : current);
        } catch (ResumeDocException e) {
            return null; // a stored theme we cannot read is left alone rather than rewritten
        }
        List<String> touched = new ArrayList<>();
        JsonNode t = base.get("_touched");
        if (t != null && t.isArray()) t.forEach(n -> touched.add(n.asText()));

        ObjectNode next = base.deepCopy();
        boolean changed = false;
        for (Iterator<Map.Entry<String, JsonNode>> it = defaults.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            if (!DEFAULTABLE.contains(e.getKey()) || touched.contains(e.getKey())) continue;
            if (!e.getValue().equals(next.get(e.getKey()))) {
                next.set(e.getKey(), e.getValue());
                changed = true;
            }
        }
        return changed ? ResumeThemeValidator.sanitize(next) : null;
    }
}
