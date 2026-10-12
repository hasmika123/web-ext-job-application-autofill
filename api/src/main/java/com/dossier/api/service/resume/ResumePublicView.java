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
