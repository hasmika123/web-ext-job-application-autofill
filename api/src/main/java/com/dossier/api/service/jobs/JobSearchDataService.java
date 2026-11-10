package com.dossier.api.service.jobs;

import com.dossier.api.domain.JobFeedback;
import com.dossier.api.repository.JobFeedbackRepository;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What job search stores about one user beyond the public postings (E2E-U4.0 / U4.5), as far as the account's
 * life goes: erased with the account and included in the data export. The DB cascades would remove the rows with the
 * user anyway; the erasure is explicit so it is self-contained and testable, like {@code TrackerDataService}.
 */
@Service
public class JobSearchDataService {

    private final JobFeedbackRepository feedback;

    public JobSearchDataService(JobFeedbackRepository feedback) {
        this.feedback = feedback;
    }

    /** Erase everything job search keeps for the user. */
    @Transactional
    public void deleteAllForUser(Long userId) {
        feedback.deleteByUser(userId);
    }

    /** The user's job-search data as plain maps for the account export. */
    @Transactional(readOnly = true)
    public Map<String, Object> exportForUser(Long userId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jobFeedback", feedback.findByUserId(userId).stream().map(JobSearchDataService::toExport).toList());
        return out;
    }

    private static Map<String, Object> toExport(JobFeedback f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("signal", f.getSignal());
        m.put("postingId", f.getPostingId());
        m.put("companyKey", f.getCompanyKey());
        m.put("createdAt", f.getCreatedAt());
        return m;
    }

}
