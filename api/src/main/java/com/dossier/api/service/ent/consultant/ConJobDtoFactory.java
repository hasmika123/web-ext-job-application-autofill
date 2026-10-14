package com.dossier.api.service.ent.consultant;

import com.dossier.api.repository.ent.consultant.ConOpportunityRow;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The ONE place a consultant-facing job DTO is built (a single seam). Today it copies the facts that already sit in the {@code client_requirement}
 * columns; when the display-level mapper (doc 60 section 10, {@code JobDetailMapper}) lands it is wired in HERE and nowhere else, so no other class
 * learns how a job is shown. The set is the minimal one: title, employer, location, work mode, employment type, pay LABEL (never the rate
 * numbers), the link and the identity of the posting, the skills. The full posting text is never part of it.
 */
@Component
public class ConJobDtoFactory {

    public ConOpportunityDTO.Job job(ConOpportunityRow row, List<String> skills) {
        return new ConOpportunityDTO.Job(
            row.jobId(),
            row.title(),
            row.employer(),
            row.location(),
            row.workMode(),
            row.employmentLabel(),
            row.payLabel(),
            row.jobUrl(),
            row.atsPlatform(),
            row.externalJobId(),
            row.postedOn(),
            skills == null ? List.of() : List.copyOf(skills)
        );
    }
}
