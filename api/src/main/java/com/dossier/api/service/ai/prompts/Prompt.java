package com.dossier.api.service.ai.prompts;

import com.dossier.api.service.AiInputs;
import com.dossier.api.service.ai.AiTask;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A versioned prompt, in exactly the I2.1 registry shape (prompt-registry-evals doc section 2) so the
 * {@code PromptRegistry} adopts these records unchanged. Prompts are code: a text change needs a new
 * {@code version}, and the ledger row of every call that uses one stamps its id and version.
 *
 * <p>{@code user} is a template. {@code {{name}}} is replaced by the value given to {@link #render};
 * {@code {{name|untrusted}}} marks a third-party text (a job description) that is rendered as a delimited,
 * cleaned block the system prompt calls data ({@link AiInputs#untrusted}). Each declared slot appears once.
 *
 * @param schemaId   the output schema the reply is checked against (a name, not a provider feature)
 * @param changelog  one line on what this version changed
 */
public record Prompt(String id, int version, AiTask task, String system, String user, String schemaId, Hints hints, String changelog) {

    /** Provider hints; the output ceiling here is only the default, the call reads its real one from a setting. */
    public record Hints(int maxOutputTokens, double temperature, String effort) {}

    /** One template slot. */
    public record Slot(String name, boolean untrusted) {}

    private static final Pattern SLOT = Pattern.compile("\\{\\{\\s*([A-Za-z][A-Za-z0-9_]*)\\s*(\\|\\s*untrusted)?\\s*}}");

    /** The slots of the user template, in order of appearance (a repeated slot appears repeatedly). */
    public List<Slot> slots() {
        List<Slot> out = new ArrayList<>();
        Matcher m = SLOT.matcher(user);
        while (m.find()) out.add(new Slot(m.group(1), m.group(2) != null));
        return out;
    }

    /** The system prompt and the user template rendered with {@code values} (every slot must be given). */
    public String render(Map<String, String> values) {
        Matcher m = SLOT.matcher(user);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String name = m.group(1);
            if (!values.containsKey(name)) throw new IllegalArgumentException("Prompt " + id + " v" + version + " needs a value for '" + name + "'");
            String raw = values.get(name) == null ? "" : values.get(name);
            String value;
            if (m.group(2) != null) {
                String block = AiInputs.untrusted(raw, AiInputs.MAX_JD_CHARS, name.toUpperCase(java.util.Locale.ROOT));
                value = block.isEmpty() ? "(none)" : block;
            } else {
                value = raw;
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(value));
        }
        m.appendTail(sb);
        return system + "\n\n" + sb;
    }
}
