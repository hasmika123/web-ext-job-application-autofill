package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.repository.ent.consultant.ConInterviewProjectionRepository;
import com.dossier.api.repository.ent.consultant.ConProfileRepository;
import com.dossier.api.repository.ent.consultant.ConProjectionRepository;
import com.dossier.api.service.InboxInterviewChanged;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * What {@link LinkedInterviewMirror} does for ONE organization, in a transaction of its own: shows an interview that the consultant's own inbox created
 * (or moved, or cancelled) on the organization's Interviews page, next to the ones the organization scheduled.
 *
 * <p>The same gates as the stage mirror ({@link PipelineApplicationLinkWork}): the consultant jobs flag is on, the seat has exactly one ACTIVE consultant
 * profile, and the consultant shares their applications in <b>full</b> ({@link DataShareService#scopeOf}); NONE and SUMMARY mirror nothing. It only
 * follows a personal application that already has a projection row (the application is linked to the organization's job), so it never creates a row for
 * an application the organization does not know.
 *
 * <p><b>The privacy wall.</b> The organization row gets a time, a duration, the kind and a status. Never the meeting link, the location, the interviewer,
 * a note, or a word of the mail: the event carries none of them and this class would not copy them if it did.
 */
@Component
public class LinkedInterviewMirrorWork {

    private final ConProfileRepository profiles;
    private final EnterpriseFeatureFlag flags;
    private final DataShareService shares;
    private final ConProjectionRepository projections;
    private final ConInterviewProjectionRepository interviews;
    private final Clock clock;

    @Autowired
    public LinkedInterviewMirrorWork(
        ConProfileRepository profiles,
        EnterpriseFeatureFlag flags,
        DataShareService shares,
        ConProjectionRepository projections,
        ConInterviewProjectionRepository interviews
    ) {
        this(profiles, flags, shares, projections, interviews, Clock.systemUTC());
    }

    LinkedInterviewMirrorWork(
        ConProfileRepository profiles,
        EnterpriseFeatureFlag flags,
        DataShareService shares,
        ConProjectionRepository projections,
        ConInterviewProjectionRepository interviews,
        Clock clock
    ) {
        this.profiles = profiles;
        this.flags = flags;
        this.shares = shares;
        this.projections = projections;
        this.interviews = interviews;
        this.clock = clock;
    }

    /** @return how many organization rows were written (0 when a gate said no) */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int process(Long orgId, Long memberId, InboxInterviewChanged e) {
        if (orgId == null || memberId == null || e == null || e.applicationId() == null || e.interviewId() == null || e.startsAt() == null) return 0;
        if (!flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, orgId)) return 0;
        List<ConsultantProfile> mine = profiles.findByOrgIdAndMemberId(orgId, memberId);
        if (mine.size() != 1 || !"ACTIVE".equals(mine.get(0).getStatus()) || mine.get(0).getId() == null) return 0;
        ShareScope consent = shares.scopeOf(orgId, memberId);
        if (consent != ShareScope.FULL) return 0;

        Instant now = clock.instant();
        int written = 0;
        for (TalentApplication row : projections.findByOrgIdAndPersonalApplicationId(orgId, e.applicationId())) {
            if (!mine.get(0).getId().equals(row.getConsultantId())) continue;
            TalentInterview iv = interviews.findFirstByOrgIdAndPersonalInterviewId(orgId, e.interviewId()).orElseGet(() -> {
                TalentInterview n = new TalentInterview();
                n.setOrgId(orgId);
                n.setPersonalInterviewId(e.interviewId());
                n.setCreatedAt(now);
                return n;
            });
            iv.setApplicationId(row.getId());
            iv.setConsultantId(row.getConsultantId());
            iv.setClientId(row.getClientId());
            iv.setScheduledAt(e.startsAt());
            iv.setDurationMinutes(minutes(e.startsAt(), e.endsAt()));
            iv.setStatus(e.cancelled() ? "CANCELLED" : "SCHEDULED");
            iv.setMode(modeOf(e.kind()));
            iv.setRoundLabel(labelOf(e.kind()));
            iv.setUpdatedAt(now);
            iv.setUpdatedByMemberId(null); // the system wrote it: no person behind it
            interviews.save(iv);
            written++;
        }
        return written;
    }

    static int minutes(Instant start, Instant end) {
        if (start == null || end == null) return 45;
        long m = Duration.between(start, end).toMinutes();
        return m >= 15 && m <= 480 ? (int) m : 45;
    }

    static String modeOf(String kind) {
        return switch (kind == null ? "" : kind) {
            case "PHONE" -> "PHONE";
            case "ONSITE" -> "ONSITE";
            default -> "VIDEO";
        };
    }

    static String labelOf(String kind) {
        return switch (kind == null ? "" : kind) {
            case "PHONE" -> "Phone screen";
            case "VIDEO" -> "Video";
            case "ONSITE" -> "Onsite";
            case "TECHNICAL" -> "Technical";
            case "PANEL" -> "Panel";
            case "BEHAVIORAL" -> "Behavioral";
            default -> null;
        };
    }
}
