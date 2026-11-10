package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.repository.ent.consultant.ConOpportunityRow;
import com.dossier.api.service.ent.jobs.JobDetailMapper;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The ONE place a consultant-facing job DTO is built (a single seam), and it builds it through {@link JobDetailMapper} (doc 60 section 10): the mapper
 * picks the fields the effective level allows (the lower of the job's stored level and the organization's cap) and this class only copies them into the
 * consultant shape. The set is the minimal one: title, employer, location, work mode, employment type, pay LABEL (never the rate numbers), the link and
 * the identity of the posting, the skills, and the {@code detailLevel} the page may use to say "view the full posting on the source". The posting text is
 * never part of it.
 */
@Component
public class ConJobDtoFactory {

    public ConOpportunityDTO.Job job(ConOpportunityRow row, List<String> skills, String orgCap) {
        // The row is the consultant's trimmed read model (no rate, no contact): lift its job columns back into a transient entity so the ONE mapper decides.
        ClientRequirement facts = new ClientRequirement();
        facts.setId(row.jobId());
        facts.setTitle(row.title());
        facts.setLocation(row.location());
        facts.setWorkMode(row.workMode());
        facts.setEmploymentLabel(row.employmentLabel());
        facts.setPayLabel(row.payLabel());
        facts.setJobUrl(row.jobUrl());
        facts.setAtsPlatform(row.atsPlatform());
        facts.setExternalJobId(row.externalJobId());
        facts.setPostedOn(row.postedOn());
        facts.setDetailLevel(row.detailLevel());
        JobDetailMapper.View view = JobDetailMapper.view(facts, row.employer(), skills, orgCap);
        JobDetailMapper.MinimalJob m = view.job();
        return new ConOpportunityDTO.Job(
            m.id(),
            m.title(),
            m.employer(),
            m.location(),
            m.workMode(),
            m.employmentType(),
            m.payLabel(),
            m.jobUrl(),
            m.atsPlatform(),
            m.externalJobId(),
            m.postedOn(),
            m.skills(),
            view.detailLevel()
        );
    }
}
