package com.dossier.api.service.ent.marketing;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What happens to a marketer's consultants when the marketer is offboarded (Sprint 2 / H-assign; before this the offboarding hook only logged the
 * {@code reassignments} of the request and left {@code marketer_assignment} pointing at a person who had left). It uses the same lifecycle as the board
 * ({@link AssignmentLifecycleService}: history line, handover of the open work, projection, notices), so nothing here is a second way to move a consultant.
 *
 * <ol>
 *   <li><b>Plans.</b> Plans that start with or for the person are cancelled; a cover they give goes back to the marketer it was taken from; a cover they were
 *       taken from ends and leaves the cover where it is.</li>
 *   <li><b>Named reassignments.</b> Each {@code {consultantMemberId, newAssigneeMemberId}} of the request names the consultant by their SEAT; if that
 *       consultant's profile has the leaving person as marketer, the new assignee becomes the marketer (as backup if the leaving person was the backup). The new
 *       assignee must be an active marketer; anything else is skipped and handled as below.</li>
 *   <li><b>Everyone else.</b> A consultant whose marketer leaves goes to their backup when there is one (the open work goes with them); without a backup they become
 *       unassigned, which shows on the board as the next thing to do. Where the person was only the backup, the backup is cleared.</li>
 *   <li>The marketer's capacity row is paused, so nobody is assigned to them again. Nothing is deleted.</li>
 * </ol>
 *
 * One {@code MARKETER_OFFBOARD} audit row summarises it with counts. Runs inside the offboarding transaction. Nothing here submits anything.
 */
@Service
public class MarketerOffboardingService {

    public static final String AUDIT_OFFBOARD = "MARKETER_OFFBOARD";

    /** What an offboarding changed (or, for a preview, would change). */
    public record Result(int reassigned, int promotedBackup, int unassigned, int backupCleared, int plans, int skipped) {
        public int total() {
            return reassigned + promotedBackup + unassigned + backupCleared + plans;
        }
    }

    private final MarketerAssignmentRepository assignments;
    private final MarketerCapacityRepository capacities;
    private final ConsultantProfileRepository consultants;
    private final OrgMemberRepository members;
    private final AssignmentLifecycleService lifecycle;
    private final AssignmentScheduleService schedules;
    private final OrgAuditService audit;
    private final ObjectMapper json;
    private final Clock clock;

    @Autowired
    public MarketerOffboardingService(
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        AssignmentLifecycleService lifecycle,
        AssignmentScheduleService schedules,
        OrgAuditService audit,
        ObjectMapper json
    ) {
        this(assignments, capacities, consultants, members, lifecycle, schedules, audit, json, Clock.systemUTC());
    }

    MarketerOffboardingService(
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        AssignmentLifecycleService lifecycle,
        AssignmentScheduleService schedules,
        OrgAuditService audit,
        ObjectMapper json,
        Clock clock
    ) {
        this.assignments = assignments;
        this.capacities = capacities;
        this.consultants = consultants;
        this.members = members;
        this.lifecycle = lifecycle;
        this.schedules = schedules;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    /** What would change for {@code memberId} as marketer and as backup, for the wizard's preview (reads only). */
    @Transactional(readOnly = true)
    public Result preview(Long orgId, Long memberId) {
        int asMarketer = assignments.findByOrgIdAndMarketerMemberId(orgId, memberId).size();
        int asBackup = assignments.findByOrgIdAndBackupMemberId(orgId, memberId).size();
        return new Result(0, 0, asMarketer, asBackup, 0, 0);
    }

    /** Applies the offboarding of {@code leaver} to every consultant they carry. */
    @Transactional
    public Result apply(Long orgId, Long leaver, String actorLogin, String reason, List<MemberActionDTO.Reassignment> reassignments) {
        OrgMembership actor = AssignmentScheduleService.system(orgId, actorLogin);
        Instant now = Instant.now(clock);
        String why = "Marketer left the organization"; // a fixed sentence: the free-text reason of the offboarding stays on its own audit row
        int reassigned = 0, promoted = 0, unassigned = 0, cleared = 0, skipped = 0;

        int plans = schedules.onMemberLeaving(actor, orgId, leaver);

        Set<Long> handled = new HashSet<>();
        if (reassignments != null) {
            for (MemberActionDTO.Reassignment r : reassignments) {
                Long target = r.newAssigneeMemberId();
                ConsultantProfile p = consultants.findByOrgIdAndMemberId(orgId, r.consultantMemberId()).orElse(null);
                MarketerAssignment a = p == null ? null : assignments.findByOrgIdAndConsultantId(orgId, p.getId()).orElse(null);
                boolean asMarketer = a != null && leaver.equals(a.getMarketerMemberId());
                boolean asBackup = a != null && leaver.equals(a.getBackupMemberId());
                if (!asMarketer && !asBackup || !validTarget(orgId, target, leaver)) {
                    skipped++;
                    continue;
                }
                AssignmentLifecycleService.Snap before = AssignmentLifecycleService.snap(a);
                if (asMarketer) {
                    a.setMarketerMemberId(target);
                    a.setAssignedAt(now);
                    if (a.getBackupMemberId() != null && a.getBackupMemberId().equals(target)) a.setBackupMemberId(null);
                } else {
                    a.setBackupMemberId(target.equals(a.getMarketerMemberId()) ? null : target);
                }
                a.setLastActivityAt(now);
                assignments.save(a);
                lifecycle.record(actor, p.getId(), before, AssignmentLifecycleService.snap(a), why, null);
                if (asMarketer) schedules.onMarketerChanged(orgId, p.getId(), target);
                handled.add(p.getId());
                reassigned++;
            }
        }

        for (MarketerAssignment a : new ArrayList<>(assignments.findByOrgIdAndMarketerMemberId(orgId, leaver))) {
            if (handled.contains(a.getConsultantId())) continue;
            AssignmentLifecycleService.Snap before = AssignmentLifecycleService.snap(a);
            Long backup = a.getBackupMemberId();
            if (backup != null && validTarget(orgId, backup, leaver)) {
                a.setMarketerMemberId(backup);
                a.setBackupMemberId(null);
                a.setAssignedAt(now);
                a.setLastActivityAt(now);
                assignments.save(a);
                lifecycle.record(actor, a.getConsultantId(), before, AssignmentLifecycleService.snap(a), why, null);
                schedules.onMarketerChanged(orgId, a.getConsultantId(), backup);
                promoted++;
            } else {
                assignments.delete(a);
                lifecycle.record(actor, a.getConsultantId(), before, null, why, null);
                schedules.onMarketerChanged(orgId, a.getConsultantId(), null);
                unassigned++;
            }
        }
        for (MarketerAssignment a : new ArrayList<>(assignments.findByOrgIdAndBackupMemberId(orgId, leaver))) {
            if (handled.contains(a.getConsultantId())) continue;
            AssignmentLifecycleService.Snap before = AssignmentLifecycleService.snap(a);
            a.setBackupMemberId(null);
            assignments.save(a);
            lifecycle.record(actor, a.getConsultantId(), before, AssignmentLifecycleService.snap(a), why, null);
            cleared++;
        }

        capacities.findByOrgIdAndMemberId(orgId, leaver).ifPresent(c -> {
            if (!"PAUSED".equals(c.getStatus())) {
                c.setStatus("PAUSED");
                capacities.save(c);
            }
        });

        Result result = new Result(reassigned, promoted, unassigned, cleared, plans, skipped);
        if (result.total() > 0 || skipped > 0) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("reassigned", reassigned);
            d.put("promotedBackup", promoted);
            d.put("unassigned", unassigned);
            d.put("backupCleared", cleared);
            d.put("plans", plans);
            d.put("skipped", skipped);
            audit.record(orgId, actor.login(), null, AUDIT_OFFBOARD, OrgAuditService.TARGET_MEMBER, null, String.valueOf(leaver), text(d), null, null, null, "MEDIUM");
        }
        return result;
    }

    /** An active marketer (capacity row, ACTIVE) with an active seat, who is not the person leaving. */
    private boolean validTarget(Long orgId, Long memberId, Long leaver) {
        if (memberId == null || memberId.equals(leaver)) return false;
        MarketerCapacity c = capacities.findByOrgIdAndMemberId(orgId, memberId).orElse(null);
        if (c == null || !"ACTIVE".equals(c.getStatus())) return false;
        return members.findByOrgIdAndId(orgId, memberId).map(m -> m.getStatus() == OrgMemberStatus.ACTIVE).orElse(false);
    }

    private String text(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            return String.valueOf(o);
        }
    }

}
