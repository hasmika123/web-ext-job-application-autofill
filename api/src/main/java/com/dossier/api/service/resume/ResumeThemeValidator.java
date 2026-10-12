package com.dossier.api.service.resume;

import com.dossier.api.service.ResumeDocException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The server twin of {@code sanitizeTheme} (packages/ui/src/resume/theme.ts) for {@code PATCH /doc/theme}
 * (Resume Builder DESIGN 4, R2.4): bounded fields only. Known keys are checked and re-written in a fixed
 * order; an unknown key is dropped; a known key with a value outside its bounds is refused
 * ({@code 422 THEME_INVALID}, with the {@code $.theme...} path). {@code size}/{@code density}/{@code margin}
 * are DERIVED from {@code spacing} + {@code fit.step} on every read, so they are accepted and discarded
 * rather than stored (a stale derived number could otherwise disagree with the preset).
 *
 * <p>Which control the template allows (accent, fonts, spacing, page length) is a capability rule the
 * editor enforces and the renderer applies (the TypeScript {@code applyCapabilities}); the server stores
 * the user's choice so that switching back to a capable template shows it again. The enum values below
 * must stay in step with {@code types.ts} ({@code FONT_PAIRS}, spacings) and {@code fit.ts}
 * ({@code MAX_FIT_STEP}).
 */
public final class ResumeThemeValidator {

    private ResumeThemeValidator() {}

    /** The whole theme object, as sent, in bytes (DESIGN 4: at most 8 KB). */
    public static final int MAX_THEME_BYTES = 8 * 1024;

    static final List<String> FONT_PAIRS = List.of("inter", "source-serif", "georgia-arial");
    static final List<String> SPACINGS = List.of("compact", "normal", "spacious");
    static final List<String> PAGE_SIZES = List.of("letter", "a4");
    static final List<String> DATE_STYLES = List.of("range", "year");
    static final List<String> FIT_MODES = List.of("auto", "manual");
    /** Index of the last rung of the fit ladder ({@code FIT_LADDER.length - 1}). */
    static final int MAX_FIT_STEP = 6;
    /** The keys a theme may mark as touched by the user (so a template switch keeps them). */
    static final Set<String> TOUCHABLE = Set.of("accent", "fontPair", "spacing", "pageSize", "dateStyle", "showPhoto", "fit");
    private static final Pattern HEX = Pattern.compile("#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})");

    /** The validated theme: known keys only, fixed order, no derived numbers. */
    public static ObjectNode sanitize(JsonNode theme) {
        if (theme == null || !theme.isObject()) throw bad("$.theme", "must be an object");
        if (ResumeDocumentJson.write(theme, 0).length() > MAX_THEME_BYTES) {
            throw bad("$.theme", "must be at most " + MAX_THEME_BYTES + " bytes");
        }
        ObjectNode out = JsonNodeFactory.instance.objectNode();

        JsonNode accent = theme.get("accent");
        if (accent != null && !accent.isNull()) {
            if (!accent.isTextual() || !HEX.matcher(accent.textValue()).matches()) throw bad("$.theme.accent", "must be a #rgb or #rrggbb colour");
            out.put("accent", accent.textValue());
        }
        oneOf(theme, out, "fontPair", FONT_PAIRS, "$.theme.fontPair");
        oneOf(theme, out, "spacing", SPACINGS, "$.theme.spacing");
        oneOf(theme, out, "pageSize", PAGE_SIZES, "$.theme.pageSize");
        oneOf(theme, out, "dateStyle", DATE_STYLES, "$.theme.dateStyle");

        if (theme.has("showPhoto")) {
            JsonNode sp = theme.get("showPhoto");
            if (sp.isNull()) out.putNull("showPhoto");
            else if (sp.isBoolean()) out.put("showPhoto", sp.booleanValue());
            else throw bad("$.theme.showPhoto", "must be true, false or null");
        }

        JsonNode fit = theme.get("fit");
        if (fit != null && !fit.isNull()) {
            if (!fit.isObject()) throw bad("$.theme.fit", "must be an object");
            ObjectNode f = out.putObject("fit");
            oneOf(fit, f, "mode", FIT_MODES, "$.theme.fit.mode");
            JsonNode target = fit.get("target");
            if (target != null && !target.isNull()) {
                if (!target.isInt() || (target.intValue() != 1 && target.intValue() != 2)) throw bad("$.theme.fit.target", "must be 1 or 2");
                f.put("target", target.intValue());
            }
            JsonNode step = fit.get("step");
            if (step != null && !step.isNull()) {
                if (!step.isInt() || step.intValue() < 0 || step.intValue() > MAX_FIT_STEP) {
                    throw bad("$.theme.fit.step", "must be a whole number from 0 to " + MAX_FIT_STEP);
                }
                f.put("step", step.intValue());
            }
        }

        JsonNode touched = theme.get("_touched");
        if (touched != null && !touched.isNull()) {
            if (!touched.isArray() || touched.size() > TOUCHABLE.size()) throw bad("$.theme._touched", "must be a short list of theme keys");
            ArrayNode arr = out.putArray("_touched");
            for (JsonNode t : touched) {
                if (!t.isTextual() || !TOUCHABLE.contains(t.textValue())) throw bad("$.theme._touched", "unknown theme key");
                if (!contains(arr, t.textValue())) arr.add(t.textValue());
            }
        }
        return out;
    }

    private static void oneOf(JsonNode in, ObjectNode out, String key, List<String> allowed, String path) {
        JsonNode v = in.get(key);
        if (v == null || v.isNull()) return;
        if (!v.isTextual() || !allowed.contains(v.textValue())) throw bad(path, "must be one of " + String.join(", ", allowed));
        out.put(key, v.textValue());
    }

    private static boolean contains(ArrayNode arr, String s) {
        for (JsonNode n : arr) if (s.equals(n.textValue())) return true;
        return false;
    }

    private static ResumeDocException bad(String path, String message) {
        return ResumeDocException.themeInvalid(path, message);
    }
}
