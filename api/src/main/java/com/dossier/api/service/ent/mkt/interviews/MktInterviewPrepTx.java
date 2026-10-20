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
 * The interview prep checklist's first-touch write and its fresh read, each in its OWN transaction ({@code REQUIRES_NEW}).
 *
 * <p>Why: the checklist of an interview is created the first time anyone looks at it, and two requests can look at the same moment (the Marketing
 * home page and the Interviews page, or a page and its prefetch). The loser of that race hits {@code uk_mkt_interview_prep_position} and used to fail
 * the whole page with a 500 ("Couldn't load the Marketing home"). Here the insert aborts only this small transaction, and the caller, whose MySQL
 * snapshot predates the winner's commit, re-reads through {@link #read} in a fresh transaction to see the winner's rows (the same pattern as
 * {@code JobIdentityTx}). A separate bean because {@code @Transactional} applies through the proxy: a self-call would join the caller's transaction.
 */
@Component
public class MktInterviewPrepTx {

    private final MktInterviewPrepItemRepository prep;

    public MktInterviewPrepTx(MktInterviewPrepItemRepository prep) {
        this.prep = prep;
    }

    /** Creates the default checklist; throws {@code DataIntegrityViolationException} when another request created it first. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public List<MktInterviewPrepItem> create(Long orgId, Long interviewId, List<String> labels, Instant now) {
        List<MktInterviewPrepItem> out = new ArrayList<>();
        for (int p = 0; p < labels.size(); p++) {
            MktInterviewPrepItem it = new MktInterviewPrepItem();
            it.setOrgId(orgId);
            it.setInterviewId(interviewId);
            it.setLabel(labels.get(p));
            it.setPosition(p + 1);
            it.setCreatedAt(now);
            out.add(prep.save(it));
        }
        return out;
    }

    /** The checklist as committed right now, read in a fresh transaction. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public List<MktInterviewPrepItem> read(Long orgId, Long interviewId) {
        return new ArrayList<>(prep.findByOrgIdAndInterviewIdOrderByPositionAsc(orgId, interviewId));
    }
}
