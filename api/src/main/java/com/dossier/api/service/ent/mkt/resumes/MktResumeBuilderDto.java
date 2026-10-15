package com.dossier.api.service.ent.mkt.resumes;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;

/** Wire shapes of "New resume for a consultant" (Marketing workspace, Resumes board): {@code /api/orgs/{orgId}/mkt/resumes/consultants}. */
public final class MktResumeBuilderDto {

    private MktResumeBuilderDto() {}

    /** One consultant the caller may start a resume for. {@code hasAccount} is false for a consultant who has no sign-in yet: nobody could approve their resume. */
    public record NewResumeConsultant(Long consultantId, String name, String title, boolean hasAccount) {}

    /** What the chooser says about the consultant's saved profile (never the values themselves, only counts and the headline). */
    public record NewResumeProfileSummary(int itemCount, int roles, int schools, int skills, String headline) {}

    /** A resume of the consultant the "copy" source can start from. {@code id} is the Resume Builder resume id. */
    public record NewResumeCopyable(Long id, String name, String kind, Instant updatedAt) {}

    /** The sources the chooser offers for one consultant. */
    public record NewResumeSources(Long consultantId, String name, NewResumeProfileSummary profile, List<NewResumeCopyable> resumes) {}

    /** Body of {@code POST .../consultants/{consultantId}/built}: the same as the personal builder's create (template, target, name, source). */
    public record NewResumeBody(String templateId, String target, String label, JsonNode source) {}

    /** The new resume: the directory row's id, the builder resume id (to open it) and the board's detail of the row. */
    public record NewResumeCreated(Long orgResumeId, Long resumeId, Long consultantId, MktResumesDto.Detail detail) {}
}
