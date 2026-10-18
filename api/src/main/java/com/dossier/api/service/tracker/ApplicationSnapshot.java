package com.dossier.api.service.tracker;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import java.time.Instant;
import java.util.Objects;

/**
 * What the sync writers (the extension's upsert and the board's PUT) can change on an application, captured before and after the write so the
 * difference - and only the difference - lands in the history (docs/change-audit/README.md section 2.4). Enum and flag fields carry their values; the free
 * text ones (company, title, link, place, email, salary, description, ...) report their NAME only.
 */
public record ApplicationSnapshot(
    ApplicationStatus status,
    boolean starred,
    boolean archived,
    Long resumeId,
    String resumeLabel,
    Boolean submissionConfirmed,
    Instant appliedAt,
    String jobType,
    String jobMode,
    String company,
    String roleTitle,
    String jobUrl,
    String location,
    String email,
    String salary,
    String externalJobId,
    String atsPlatform,
    String jobDescription,
    String source,
    Long postingId
) {
    private static final String DETAILS = "Details updated";

    public static ApplicationSnapshot of(Application a) {
        return new ApplicationSnapshot(
            a.getStatus(),
            Boolean.TRUE.equals(a.getStarred()),
            Boolean.TRUE.equals(a.getArchived()),
            a.getResume() == null ? null : a.getResume().getId(),
            a.getResume() == null ? null : a.getResume().getLabel(),
            a.getSubmissionConfirmed(),
            a.getAppliedAt(),
            a.getJobType() == null ? null : a.getJobType().name(),
            a.getJobMode() == null ? null : a.getJobMode().name(),
            a.getCompany(),
            a.getRoleTitle(),
            a.getJobUrl(),
            a.getLocation(),
            a.getEmail(),
            a.getSalary(),
            a.getExternalJobId(),
            a.getAtsPlatform(),
            a.getJobDescription(),
            a.getSource(),
            a.getPostingId()
        );
    }

    /** Reports every difference between this (before) and {@code after} to {@code rec}, headline fields first. */
    public void report(ApplicationSnapshot after, ChangeRecorder rec) {
        rec.status(status, after.status, null);
        if (archived != after.archived) rec.flag("archived", archived, after.archived, after.archived ? "Archived" : "Restored from archive");
        if (starred != after.starred) rec.flag("starred", starred, after.starred, after.starred ? "Starred" : "Unstarred");
        if (after.resumeId != null && !after.resumeId.equals(resumeId)) {
            rec.resume(resumeId, after.resumeId, after.resumeLabel == null ? "Resume changed" : "Resume: " + after.resumeLabel);
        }
        if (!Objects.equals(submissionConfirmed, after.submissionConfirmed)) rec.flag("submissionConfirmed", submissionConfirmed, after.submissionConfirmed, DETAILS);
        if (!Objects.equals(appliedAt, after.appliedAt)) rec.instant("appliedAt", appliedAt, after.appliedAt, DETAILS);
        if (!Objects.equals(jobType, after.jobType)) rec.code("jobType", jobType, after.jobType, DETAILS);
        if (!Objects.equals(jobMode, after.jobMode)) rec.code("jobMode", jobMode, after.jobMode, DETAILS);
        if (!Objects.equals(company, after.company)) rec.text("company", DETAILS);
        if (!Objects.equals(roleTitle, after.roleTitle)) rec.text("roleTitle", DETAILS);
        if (!Objects.equals(jobUrl, after.jobUrl)) rec.text("jobUrl", DETAILS);
        if (!Objects.equals(location, after.location)) rec.text("location", DETAILS);
        if (!Objects.equals(email, after.email)) rec.text("email", DETAILS);
        if (!Objects.equals(salary, after.salary)) rec.text("salary", DETAILS);
        if (!Objects.equals(externalJobId, after.externalJobId)) rec.text("externalJobId", DETAILS);
        if (!Objects.equals(atsPlatform, after.atsPlatform)) rec.text("atsPlatform", DETAILS);
        if (!Objects.equals(jobDescription, after.jobDescription)) rec.text("jobDescription", DETAILS);
        if (!Objects.equals(source, after.source)) rec.text("source", DETAILS);
        if (!Objects.equals(postingId, after.postingId)) rec.number("postingId", postingId, after.postingId, DETAILS);
    }
}
