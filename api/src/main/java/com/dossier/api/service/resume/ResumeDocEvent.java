package com.dossier.api.service.resume;

/**
 * Something happened to a resume document that other parts of the product may want to follow (Enterprise V2, doc 30: the organization
 * directory links to a person's resume and has to know when it is created, changed or renamed). Published synchronously, inside the
 * transaction of the write, by {@code ResumeDocService} and {@code ResumeMetaService}; a personal account's resume simply has no listener
 * that cares. {@code actorLogin} is who made the change (the owner, or a marketer acting for them, see {@link ResumeActAs}).
 */
public record ResumeDocEvent(Type type, Long resumeId, Long ownerUserId, String actorLogin) {
    public enum Type {
        /** A built resume and its first document were just created (from the profile, an upload, a copy or scratch). */
        CREATED,
        /** The document content changed (autosave, restore, AI apply, import): the version moved on. */
        CONTENT_CHANGED,
        /** The resume was renamed (or its target role changed). */
        RENAMED,
    }
}
