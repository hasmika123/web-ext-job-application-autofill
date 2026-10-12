package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgScope;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrgOverviewRepository;
import com.dossier.api.service.dto.org.OrgOverviewDTO;
import com.dossier.api.service.dto.org.OrgOverviewDTO.Applications;
import com.dossier.api.service.dto.org.OrgOverviewDTO.Recent;
import com.dossier.api.service.dto.org.OrgOverviewDTO.Seats;
import com.dossier.api.service.dto.org.OrgOverviewDTO.Stage;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The numbers behind the org dashboard (O2.7), live and consent-scoped (consent-data-sharing.md, analytics.md section 1.3):
 * seat counts for everyone who may read reports, and application progress ONLY over members who share at least a SUMMARY.
 * Which members count follows the caller's {@code reports.view} narrowing: the whole org for an owner, admin or finance
 * person, the members a support owner looks after for STAFF, nobody (yet) for a marketer, whose pairing arrives with the
 * marketer workspace. Live queries, not rollups: O7.4 swaps in the nightly rollups when they exist.
 */
@Service
public class OrgOverviewService {

    /** The "recent" feed length. */
    static final int RECENT_LIMIT = 8;

    /** How far back "applications submitted" looks. */
    static final Duration SUBMITTED_WINDOW = Duration.ofDays(30);

    /** The stages of the placement pipeline, in order. */
    static final List<String> PIPELINE = List.of("APPLIED", "IN_REVIEW", "INTERVIEW", "OFFER", "REJECTED");

    private final OrgMemberRepository members;
    private final OrgGroupRepository groups;
    private final OrgOverviewRepository overview;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public OrgOverviewService(OrgMemberRepository members, OrgGroupRepository groups, OrgOverviewRepository overview, OrgAuditService audit) {
        this(members, groups, overview, audit, Clock.systemUTC());
    }

    OrgOverviewService(OrgMemberRepository members, OrgGroupRepository groups, OrgOverviewRepository overview, OrgAuditService audit, Clock clock) {
        this.members = members;
        this.groups = groups;
        this.overview = overview;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public OrgOverviewDTO overview(OrgMembership me) {
        Long orgId = me.orgId();
        Instant now = clock.instant();

        long active = members.countByOrgIdAndStatus(orgId, OrgMemberStatus.ACTIVE);
        long invited = members.countByOrgIdAndStatus(orgId, OrgMemberStatus.INVITED);
        long suspended = members.countByOrgIdAndStatus(orgId, OrgMemberStatus.SUSPENDED);

        OrgScope narrowing = me.scopeOf(OrgPermission.REPORTS_VIEW).orElse(null);
        // null = nothing to count for this caller; ALL_OWNERS = the whole org; otherwise the support owner's own members.
        Long ownerFilter = narrowing == OrgScope.ALL ? OrgOverviewRepository.ALL_OWNERS : narrowing == OrgScope.OWN_MEMBERS ? me.memberId() : null;

        long sharing = 0;
        Applications apps = new Applications(0, 0, 0, 0, 0, emptyPipeline());
        if (ownerFilter != null) {
            sharing = overview.sharingMembers(orgId, ownerFilter);
            if (sharing > 0) apps = applications(orgId, ownerFilter, now);
        }

        return new OrgOverviewDTO(new Seats(active + invited + suspended, active, invited, sharing), groups.countByOrgId(orgId), apps, recent(me));
    }

    private Applications applications(Long orgId, long ownerFilter, Instant now) {
        Map<String, Long> byStage = new HashMap<>();
        long submitted = 0;
        for (Object[] row : overview.stageCounts(orgId, ownerFilter, now.minus(SUBMITTED_WINDOW))) {
            byStage.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
            submitted += ((Number) row[2]).longValue();
        }
        List<Stage> pipeline = PIPELINE.stream().map(s -> new Stage(s, byStage.getOrDefault(s, 0L))).toList();
        return new Applications(
            submitted,
            byStage.getOrDefault("INTERVIEW", 0L),
            byStage.getOrDefault("OFFER", 0L),
            overview.placedMembers(orgId, ownerFilter),
            overview.upcomingInterviews(orgId, ownerFilter, now),
            pipeline
        );
    }

    private static List<Stage> emptyPipeline() {
        return PIPELINE.stream().map(s -> new Stage(s, 0)).toList();
    }

    /** The org's own audit trail, for roles that may read it; finance only sees its billing and ops rows. */
    private List<Recent> recent(OrgMembership me) {
        OrgScope scope = me.scopeOf(OrgPermission.AUDIT_VIEW).orElse(null);
        if (scope != OrgScope.ALL && scope != OrgScope.BILLING_AND_OPS_ROWS) return List.of();
        List<Recent> out = new ArrayList<>();
        // Read a little more than shown: finance's filter may drop rows.
        for (OrgAuditEvent e : audit.findPage(me.orgId(), null, PageRequest.of(0, RECENT_LIMIT * 4, Sort.by(Sort.Direction.DESC, "createdAt", "id"))).getContent()) {
            if (scope == OrgScope.BILLING_AND_OPS_ROWS && !billingOrOps(e.getAction())) continue;
            out.add(new Recent(e.getId(), e.getCreatedAt(), e.getAction(), e.getTargetType(), me.login().equals(e.getActorLogin())));
            if (out.size() == RECENT_LIMIT) break;
        }
        return out;
    }

    private static boolean billingOrOps(String action) {
        return action != null && (action.startsWith(OrgAuditService.PREFIX_BILLING) || action.startsWith(OrgAuditService.PREFIX_OPS));
    }
}
