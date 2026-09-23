package com.dossier.api.service.jobs;

import java.time.Instant;

/**
 * One posting as read from a job board, before it's stored (Phase 13.6a). The three ATSs name
 * things differently; {@link JobBoardParsers} maps each onto this.
 *
 * @param workplaceType REMOTE, HYBRID or ONSITE, or null when the board doesn't say
 * @param remote true when the job can be done remotely (from any of the board's signals), else null
 * @param description plain text, not HTML; may be blank on a list read (Greenhouse fills it later)
 */
public record FetchedPosting(
    String externalId,
    String title,
    String company,
    String location,
    String workplaceType,
    Boolean remote,
    String employmentType,
    String department,
    String url,
    String applyUrl,
    Instant publishedAt,
    String description
) {
    /** The same posting with the description (and department, when known) filled in from a detail read. */
    public FetchedPosting withDetail(String text, String dept) {
        return new FetchedPosting(
            externalId,
            title,
            company,
            location,
            workplaceType,
            remote,
            employmentType,
            dept != null ? dept : department,
            url,
            applyUrl,
            publishedAt,
            text
        );
    }
}
