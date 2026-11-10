package com.dossier.api.service.resume;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * The server-written mirror of resume metadata inside the document (R3.9, DESIGN 8.6): the resume's
 * {@code label} is the name's truth and {@code resume.target} the target's, and {@code doc.meta.title}
 * / {@code doc.meta.target} always repeat them. A client save cannot rename through the document - the
 * mirror overwrites whatever it sent.
 */
public final class ResumeMetaMirror {

    private ResumeMetaMirror() {}

    /**
     * Write {@code title} and {@code target} into {@code doc.meta} in place ({@code target} is removed
     * when blank). A document without a {@code meta} object is left alone: the validator refuses it.
     *
     * @return {@code true} when the document changed
     */
    public static boolean apply(JsonNode doc, String title, String target) {
        if (doc == null || !doc.isObject()) return false;
        JsonNode meta = doc.get("meta");
        if (meta == null || !meta.isObject()) return false;
        ObjectNode m = (ObjectNode) meta;
        boolean changed = false;
        String t = title == null ? "" : title;
        JsonNode oldTitle = m.get("title");
        if (oldTitle == null || !oldTitle.isTextual() || !oldTitle.textValue().equals(t)) {
            m.put("title", t);
            changed = true;
        }
        JsonNode oldTarget = m.get("target");
        if (target == null || target.isBlank()) {
            if (oldTarget != null) {
                m.remove("target");
                changed = true;
            }
        } else if (oldTarget == null || !oldTarget.isTextual() || !oldTarget.textValue().equals(target)) {
            m.put("target", target);
            changed = true;
        }
        return changed;
    }
}
