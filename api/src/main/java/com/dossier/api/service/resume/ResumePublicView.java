package com.dossier.api.service.resume;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * What a non-owner may see of a resume document (R3.11, DESIGN 8.7): exactly the content a template draws.
 * Storage keys, the profile-sync clock, the job target and the master a tailored copy came from are the
 * owner's working notes, not the resume; they are removed from the copy a link holder or grantee receives.
 * The input is never modified.
 */
public final class ResumePublicView {

    private ResumePublicView() {}

    private static final java.util.List<String> STORAGE_PREFIXES = java.util.List.of(
        com.dossier.api.service.storage.StorageKeys.RESUMES + "/",
        com.dossier.api.service.storage.StorageKeys.RESUME_ORIGINALS + "/",
        com.dossier.api.service.storage.StorageKeys.RESUME_PHOTOS + "/",
        com.dossier.api.service.storage.StorageKeys.RESUME_THUMBS + "/",
        com.dossier.api.service.storage.StorageKeys.APPLICATION_ATTACHMENTS + "/"
    );

    /**
     * The document for somebody who EDITS it but is not its owner (a marketer acting for a consultant): the content and everything the editor needs, but
     * no storage key. Removes {@code meta.originalFileKey}, the {@code key} of {@code basics.photo} (the photo object stays, without it, so the editor still
     * knows there is one) and, defensively, any other field named like a key (`key`, `...Key`) anywhere in the document whose value is a storage key (starts with a stored-object prefix).
     * The input is never modified.
     */
    public static JsonNode withoutStorageKeys(JsonNode doc) {
        if (doc == null || !doc.isObject()) return doc;
        ObjectNode copy = doc.deepCopy();
        JsonNode meta = copy.get("meta");
        if (meta != null && meta.isObject()) ((ObjectNode) meta).remove("originalFileKey");
        JsonNode basics = copy.get("basics");
        if (basics != null && basics.isObject()) {
            JsonNode photo = basics.get("photo");
            if (photo != null && photo.isObject()) ((ObjectNode) photo).remove("key");
        }
        stripKeyShapedStrings(copy);
        return copy;
    }

    private static void stripKeyShapedStrings(JsonNode node) {
        if (node.isObject()) {
            java.util.List<String> drop = new java.util.ArrayList<>();
            node.fields().forEachRemaining(e -> {
                JsonNode v = e.getValue();
                if (v.isTextual() && isKeyShapedName(e.getKey()) && isStorageKey(v.textValue())) drop.add(e.getKey());
                else stripKeyShapedStrings(v);
            });
            drop.forEach(((ObjectNode) node)::remove);
        } else if (node.isArray()) {
            node.forEach(ResumePublicView::stripKeyShapedStrings);
        }
    }

    /** Only fields NAMED like a key are considered, so a user's own text that happens to start with "resumes/" is never touched. */
    private static boolean isKeyShapedName(String name) {
        return name.equals("key") || name.endsWith("Key");
    }

    private static boolean isStorageKey(String s) {
        for (String p : STORAGE_PREFIXES) if (s.startsWith(p)) return true;
        return false;
    }

    public static JsonNode scrub(JsonNode doc) {
        if (doc == null || !doc.isObject()) return doc;
        ObjectNode copy = doc.deepCopy();
        JsonNode meta = copy.get("meta");
        if (meta != null && meta.isObject()) {
            ObjectNode m = (ObjectNode) meta;
            m.remove("target");
            m.remove("profileSyncedAt");
            m.remove("originalFileKey");
            m.remove("tailoredFrom");
        }
        JsonNode basics = copy.get("basics");
        if (basics != null && basics.isObject()) {
            ((ObjectNode) basics).remove("photo"); // a storage key (it carries the owner's id); the photo is not served to viewers yet
        }
        return copy;
    }
}
