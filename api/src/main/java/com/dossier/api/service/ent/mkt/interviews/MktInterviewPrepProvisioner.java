package com.dossier.api.service.ent.mkt.interviews;

import com.dossier.api.domain.ent.mkt.MktInterviewPrepItem;
import com.dossier.api.repository.ent.mkt.MktInterviewPrepItemRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Get-or-create of an interview's prep checklist, safe against the first-touch race, in the CALLER's transaction.
 *
 * <p>Why: the checklist is created the first time anyone looks at it, and two requests can look at the same moment (the Marketing home page and the
 * Interviews page, or a page and its prefetch); the loser used to hit {@code uk_mkt_interview_prep_position} and fail the page with a 500. Creation is
 * serialised per interview with a MySQL named lock ({@code GET_LOCK}), and inside it the checklist is read with a locking read, which sees what another
 * transaction committed after this one's snapshot was taken (and waits for one still in flight), so the loser uses the winner's rows (the
 * {@code BioProvisioner} pattern).
 *
 * <p>It deliberately does NOT open a transaction of its own ({@code REQUIRES_NEW} was tried first): that needs a second connection beside the caller's,
 * and its insert cannot see an interview the caller created but has not committed yet, so it waits on the caller's lock on that row (the foreign key)
 * until MySQL gives up. Both showed up as 500s, timeouts and 409s in the {@code @Transactional} integration tests.
 */
@Component
public class MktInterviewPrepProvisioner {

    private static final int LOCK_SECONDS = 30;

    private final MktInterviewPrepItemRepository prep;

    public MktInterviewPrepProvisioner(MktInterviewPrepItemRepository prep) {
        this.prep = prep;
    }

    /** The interview's checklist, created from {@code labels} (positions 1..n) when it has none yet. */
    @Transactional(propagation = Propagation.MANDATORY)
    public List<MktInterviewPrepItem> getOrCreate(Long orgId, Long interviewId, List<String> labels, Instant now) {
        prep.takeCreateLock(orgId, interviewId, LOCK_SECONDS);
        try {
            List<MktInterviewPrepItem> current = prep.lockByOrgIdAndInterviewId(orgId, interviewId);
            if (!current.isEmpty()) return new ArrayList<>(current);
            List<MktInterviewPrepItem> out = new ArrayList<>();
            for (int p = 0; p < labels.size(); p++) {
                MktInterviewPrepItem it = new MktInterviewPrepItem();
                it.setOrgId(orgId);
                it.setInterviewId(interviewId);
                it.setLabel(labels.get(p));
                it.setPosition(p + 1);
                it.setCreatedAt(now);
                out.add(prep.save(it)); // IDENTITY id: the insert runs now, before the named lock is released
            }
            return out;
        } finally {
            prep.releaseCreateLock(orgId, interviewId);
        }
    }
}
