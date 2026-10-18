package com.dossier.api.service.ent.members;

import com.dossier.api.domain.org.DataShareEvent;
import com.dossier.api.service.ent.marketing.MarketerOffboardingService;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.org.DataShareService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The offboarding steps that exist today: the sessions note, the assignments extension point (preview is real, apply waits for X4.7) and the
 * consent step. The remaining steps (resume links, licences, pipeline, employment record) belong to later stories, which register their own
 * {@link OffboardingHook} bean with the order constant of the interface.
 */
public final class DefaultOffboardingHooks {

    private DefaultOffboardingHooks() {}

    /**
     * Step 100. The seat status is what signs a person out of the workspace: every organization call needs an ACTIVE seat and a refresh of a
     * tenant-bound session re-checks it, so ending the seat ends the sessions with nothing more to revoke. The line tells the wizard so.
     */
    @Component
    public static class Sessions implements OffboardingHook {

        @Override
        public int getOrder() {
            return ORDER_SESSIONS;
        }

        @Override
        public String key() {
            return "sessions";
        }

        @Override
        public List<MemberActionDTO.HookLine> preview(Long orgId, Long memberId) {
            return List.of(new MemberActionDTO.HookLine(key(), "SESSIONS", "Signed out of this workspace; their other Kiwiply sessions are not affected", Map.of()));
        }

        @Override
        public void apply(Context context) {
            // nothing to revoke: the seat's new status refuses the next call and the next refresh
        }
    }

    /**
     * Step 200, the assignments step. The preview reads the real open assignments so the wizard can warn. The apply hands the leaving marketer's consultants
     * over through the same lifecycle as the Marketing Assignments board ({@link MarketerOffboardingService}): the reassignments of the request first, then
     * the backup (or nobody) for everyone else, then plans that involve the person are cancelled or ended. Without that service (a bare unit test) it only logs.
     */
    @Component
    public static class Assignments implements OffboardingHook {

        private static final Logger LOG = LoggerFactory.getLogger(Assignments.class);

        @PersistenceContext
        private EntityManager em;

        private MarketerOffboardingService marketers;

        @Autowired(required = false)
        void setMarketers(MarketerOffboardingService marketers) {
            this.marketers = marketers;
        }

        @Override
        public int getOrder() {
            return ORDER_ASSIGNMENTS;
        }

        @Override
        public String key() {
            return "assignments";
        }

        @Override
        public List<MemberActionDTO.HookLine> preview(Long orgId, Long memberId) {
            Instant now = Instant.now();
            long asConsultant = count(orgId, "a.consultantMemberId = :id", memberId, now);
            long asAssignee = count(orgId, "a.assigneeMemberId = :id", memberId, now);
            long primary = count(orgId, "a.assigneeMemberId = :id and a.kind = com.dossier.api.domain.enumeration.AssignmentKind.PRIMARY", memberId, now);
            List<MemberActionDTO.HookLine> lines = new java.util.ArrayList<>();
            if (asConsultant > 0 || asAssignee > 0) {
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("asConsultant", asConsultant);
                data.put("asAssignee", asAssignee);
                data.put("primaryAsAssignee", primary);
                String text = asAssignee > 0
                    ? asAssignee + " consultant assignment(s) will need a new marketer"
                    : asConsultant + " marketer assignment(s) to them will end";
                lines.add(new MemberActionDTO.HookLine(key(), "ASSIGNMENTS", text, data));
            }
            if (marketers != null) {
                MarketerOffboardingService.Result r = marketers.preview(orgId, memberId);
                if (r.unassigned() > 0 || r.backupCleared() > 0) {
                    Map<String, Object> data = new LinkedHashMap<>();
                    data.put("asMarketer", r.unassigned());
                    data.put("asBackup", r.backupCleared());
                    String text = r.unassigned() + " consultant(s) lose this marketer: those named below get the new marketer, the rest go to their backup, or to nobody when they have none"
                        + (r.backupCleared() > 0 ? "; " + r.backupCleared() + " lose this person as their backup" : "");
                    lines.add(new MemberActionDTO.HookLine(key(), "MARKETER_CONSULTANTS", text, data));
                }
            }
            return lines;
        }

        @Override
        public void apply(Context context) {
            if (marketers == null) {
                if (context.reassignments() != null && !context.reassignments().isEmpty()) {
                    LOG.info("Offboarding org={} member={}: {} reassignment(s) not applied (no assignment lifecycle in this context)", context.orgId(), context.memberId(), context.reassignments().size());
                }
                return;
            }
            MarketerOffboardingService.Result r = marketers.apply(context.orgId(), context.memberId(), context.actorLogin(), context.reason(), context.reassignments());
            if (r.total() > 0 || r.skipped() > 0) {
                LOG.info("Offboarding org={} member={}: {} reassigned, {} to backup, {} unassigned, {} backup cleared, {} plan(s), {} skipped", context.orgId(), context.memberId(), r.reassigned(), r.promotedBackup(), r.unassigned(), r.backupCleared(), r.plans(), r.skipped());
            }
        }

        private long count(Long orgId, String condition, Long memberId, Instant now) {
            return em
                .createQuery(
                    "select count(a) from OrgAssignment a where a.orgId = :orgId and " + condition + " and a.startsAt <= :now and (a.endsAt is null or a.endsAt > :now)",
                    Long.class
                )
                .setParameter("orgId", orgId)
                .setParameter("id", memberId)
                .setParameter("now", now)
                .getSingleResult();
        }
    }

    /** Step 300: what the person shared with the organization ends, and every FULL share that named them as the viewer drops to SUMMARY. */
    @Component
    public static class Consent implements OffboardingHook {

        private final DataShareService dataShare;

        public Consent(DataShareService dataShare) {
            this.dataShare = dataShare;
        }

        @Override
        public int getOrder() {
            return ORDER_CONSENT;
        }

        @Override
        public String key() {
            return "consent";
        }

        @Override
        public List<MemberActionDTO.HookLine> preview(Long orgId, Long memberId) {
            String scope = dataShare.viewOf(orgId, memberId).map(v -> v.scope().name()).orElse("NONE");
            if ("NONE".equals(scope)) return List.of(new MemberActionDTO.HookLine(key(), "CONSENT", "They were not sharing anything with the organization", Map.of("scope", scope)));
            return List.of(new MemberActionDTO.HookLine(key(), "CONSENT", "Sharing with the organization ends (it was " + scope + ")", Map.of("scope", scope)));
        }

        @Override
        public void apply(Context context) {
            dataShare.endPairingsTo(context.orgId(), context.memberId(), context.memberLogin());
            dataShare.endFor(context.orgId(), context.memberId(), context.memberLogin(), DataShareEvent.REASON_REMOVED, DataShareEvent.ACTOR_ORG_ADMIN);
        }
    }
}
