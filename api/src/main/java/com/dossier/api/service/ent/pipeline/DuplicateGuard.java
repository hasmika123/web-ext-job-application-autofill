package com.dossier.api.service.ent.pipeline;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.repository.ent.PipelineGuardRepository;
import com.dossier.api.repository.ent.PipelineGuardRepository.Prior;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.service.ApplicationKeys;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The duplicate-submission guard and the open-assignment cap (Sprint 2 / B1; REAL-GAPS-B X8.4 and X8.8). One service, one answer shape, used at
 * assignment time ({@code OpportunityAssignmentService}) and at record time (applications and submissions).
 *
 * <p>What counts as a duplicate for one consultant and one job (all identity comparisons go through {@link ApplicationKeys}, the system's one definition
 * of "the same job"):
 * <ul>
 *   <li>{@code SAME_POSTING}: the consultant already holds another row for the same posting (same stored link key, or the same board and job id).
 *       No time window: it is the same page.</li>
 *   <li>{@code SAME_JOB}: the same employer, the same role (title key) and a compatible location, under a different row. Within the window.</li>
 *   <li>{@code VENDOR_CHAIN}: the same role (title key, compatible location) offered through a DIFFERENT client or vendor. Within the window. The data has
 *       no end-client field, so this is a heuristic on role and place: it asks, and it only refuses when the policy is BLOCK.</li>
 *   <li>{@code TOO_MANY_CONSULTANTS}: other consultants already hold this posting and the admin-set maximum is reached (off by default).</li>
 * </ul>
 * A row for the very same job id is never a finding here: that pair is handled by the pair rules and the unique keys.
 *
 * <p>Policy (admin-configured, {@link PipelineGuardSettings}): WARN answers 409 {@code DUPLICATE_WARNING} until the caller confirms with a reason (written
 * to the audit trail as {@code PIPELINE_DUPLICATE_OVERRIDE}); BLOCK answers 409 {@code DUPLICATE_BLOCKED} and nothing overrides it. The cap answers 409
 * {@code ASSIGNMENT_CAP}. Nothing here submits anything; it only refuses or asks.
 */
@Service
public class DuplicateGuard {

    public static final String SAME_POSTING = "SAME_POSTING";
    public static final String SAME_JOB = "SAME_JOB";
    public static final String VENDOR_CHAIN = "VENDOR_CHAIN";
    public static final String TOO_MANY_CONSULTANTS = "TOO_MANY_CONSULTANTS";
    public static final String CODE_WARNING = "DUPLICATE_WARNING";
    public static final String CODE_BLOCKED = "DUPLICATE_BLOCKED";
    public static final String CODE_CAP = "ASSIGNMENT_CAP";
    public static final String AUDIT_OVERRIDE = "PIPELINE_DUPLICATE_OVERRIDE";
    public static final int REASON_MAX = 200;

    /**
     * The caller's answer to a warning. {@code approvedByMemberId} / {@code requestedByMemberId} are set only when a Marketing Manager has decided a held override
     * (MM-02, policy REQUIRE_APPROVAL): the guard then lets the call through under the manager's authority and names both people in the audit row.
     */
    public record Confirm(boolean confirmed, String reason, Long approvedByMemberId, Long requestedByMemberId) {
        public static final Confirm NONE = new Confirm(false, null, null, null);

        public Confirm(boolean confirmed, String reason) {
            this(confirmed, reason, null, null);
        }

        public static Confirm of(Boolean confirmed, String reason) {
            return confirmed == null && reason == null ? NONE : new Confirm(Boolean.TRUE.equals(confirmed), reason);
        }

        /** A manager's approval of the override the marketer asked for with {@code reason}. */
        public static Confirm approved(String reason, Long approvedByMemberId, Long requestedByMemberId) {
            return new Confirm(true, reason, approvedByMemberId, requestedByMemberId);
        }

        /** True when a manager decided this override (the hold is lifted for the call). */
        public boolean approvedByManager() {
            return approvedByMemberId != null;
        }
    }

    /**
     * Where an override that policy REQUIRE_APPROVAL sends to a manager goes: given the findings and the marketer's stated reason, it records the request and
     * returns the 409 to throw ({@code DUPLICATE_APPROVAL_REQUIRED} with the request id). Absent (record-time callers), REQUIRE_APPROVAL refuses like BLOCK.
     */
    @FunctionalInterface
    public interface Hold {
        OrgException hold(List<Finding> findings, String reason);
    }

    /** One reason the pair looks like a duplicate. */
    public record Finding(String rule, String message, Long otherRequirementId, String otherTitle, String otherClient, String where, Instant since, Long otherConsultants) {
        Map<String, Object> asMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("rule", rule);
            m.put("message", message);
            if (otherRequirementId != null) m.put("otherRequirementId", otherRequirementId);
            if (otherTitle != null) m.put("otherTitle", otherTitle);
            if (otherClient != null) m.put("otherClient", otherClient);
            if (where != null) m.put("where", where);
            if (since != null) m.put("since", since.toString());
            if (otherConsultants != null) m.put("otherConsultants", otherConsultants);
            return m;
        }
    }

    private final PipelineGuardRepository repo;
    private final ClientAccountRepository clients;
    private final PipelineGuardSettings settings;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public DuplicateGuard(PipelineGuardRepository repo, ClientAccountRepository clients, PipelineGuardSettings settings, OrgAuditService audit) {
        this(repo, clients, settings, audit, Clock.systemUTC());
    }

    DuplicateGuard(PipelineGuardRepository repo, ClientAccountRepository clients, PipelineGuardSettings settings, OrgAuditService audit, Clock clock) {
        this.repo = repo;
        this.clients = clients;
        this.settings = settings;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- findings ---------------------------------------------------------------------------------------------------------------

    /** Every reason {@code job} looks like a duplicate for {@code consultantId}; empty when it does not. Reads only. */
    @Transactional(readOnly = true)
    public List<Finding> findings(Long orgId, Long consultantId, ClientRequirement job) {
        List<Finding> out = new ArrayList<>();
        if (orgId == null || consultantId == null || job == null || job.getId() == null) return out;
        Instant now = Instant.now(clock);
        int windowDays = settings.sameClientWindowDays(orgId);
        Instant since = now.minus(Duration.ofDays(windowDays));
        String clientName = clients.findByOrgIdAndId(orgId, job.getClientId()).map(ClientAccount::getName).orElse(null);
        String company = ApplicationKeys.company(clientName);
        String title = ApplicationKeys.title(job.getTitle());

        List<Prior> held = new ArrayList<>(repo.liveAssignments(orgId, consultantId));
        held.addAll(repo.applications(orgId, consultantId));
        held.addAll(repo.submissions(orgId, consultantId));
        Set<String> seen = new LinkedHashSet<>(); // one finding per (rule, other requirement)
        for (Prior p : held) {
            if (job.getId().equals(p.requirementId())) continue;
            String rule = null;
            String message = null;
            if (samePosting(job, p)) {
                rule = SAME_POSTING;
                message = "This consultant already has this same posting (" + shortTitle(p) + ") under another entry.";
            } else if (p.at() != null && !p.at().isBefore(since) && !title.isEmpty() && title.equals(ApplicationKeys.title(p.title())) && ApplicationKeys.locationsCompatible(job.getLocation(), p.location())) {
                String other = ApplicationKeys.company(p.clientName());
                if (!company.isEmpty() && company.equals(other)) {
                    rule = SAME_JOB;
                    message = "This consultant already has the same role at " + p.clientName() + " (" + shortTitle(p) + ") from the last " + windowDays + " days.";
                } else if (!company.isEmpty() && !other.isEmpty()) {
                    rule = VENDOR_CHAIN;
                    message = "This consultant already has the same role through another vendor: " + p.clientName() + " (" + shortTitle(p) + ") from the last " + windowDays + " days. Sending the same person to the same end client twice can cost the relationship.";
                }
            }
            if (rule != null && seen.add(rule + ":" + p.requirementId())) {
                out.add(new Finding(rule, message, p.requirementId(), p.title(), p.clientName(), p.location(), p.at(), null));
            }
        }

        int max = settings.maxPerRequirement(orgId);
        if (max > 0) {
            Set<Long> same = new LinkedHashSet<>();
            same.add(job.getId());
            if (job.getUrlKeyHash() != null && !job.getUrlKeyHash().isBlank()) same.addAll(repo.requirementIdsWithUrlKeyHash(orgId, job.getUrlKeyHash()));
            long others = repo.countOtherConsultantsHolding(orgId, same, consultantId);
            if (others >= max) {
                out.add(new Finding(TOO_MANY_CONSULTANTS, others + " other consultant" + (others == 1 ? " already holds" : "s already hold") + " this posting; the limit is " + max + ".", job.getId(), job.getTitle(), clientName, job.getLocation(), null, others));
            }
        }
        return out;
    }

    private static boolean samePosting(ClientRequirement job, Prior p) {
        if (job.getUrlKey() != null && !job.getUrlKey().isBlank() && job.getUrlKey().equals(p.urlKey())) return true;
        return job.getAtsPlatform() != null && !job.getAtsPlatform().isBlank() && job.getExternalJobId() != null && !job.getExternalJobId().isBlank()
            && job.getAtsPlatform().equalsIgnoreCase(p.atsPlatform()) && job.getExternalJobId().equals(p.externalJobId());
    }

    private static String shortTitle(Prior p) {
        String t = p.title() == null ? "a job" : p.title();
        return t.length() > 80 ? t.substring(0, 80) : t;
    }

    // ---- enforcement ------------------------------------------------------------------------------------------------------------

    /**
     * Refuses or asks when the pair is a duplicate. WARN without a confirmation: 409 DUPLICATE_WARNING with the findings; WARN with {@code confirmed} and a
     * reason (1 to 200 characters, scanned for sensitive data): the override is audited and the call goes on; BLOCK: 409 DUPLICATE_BLOCKED.
     *
     * @return the findings that were overridden (empty when there was nothing to override)
     */
    @Transactional(noRollbackFor = OrgException.class)
    public List<Finding> enforce(OrgMembership me, Long consultantId, ClientRequirement job, Confirm confirm) {
        return enforce(me, consultantId, job, confirm, null);
    }

    /**
     * {@link #enforce(OrgMembership, Long, ClientRequirement, Confirm)} with somewhere to send an override that policy REQUIRE_APPROVAL holds for a manager (MM-02).
     * REQUIRE_APPROVAL: without a confirmation it is 409 DUPLICATE_WARNING (asking for the reason to send); with one it is {@code hold}'s exception, and a call a
     * manager has already approved ({@link Confirm#approvedByManager}) goes through and is audited at HIGH naming the approver and the requester. With no
     * {@code hold} (the caller cannot park the work) it is refused as DUPLICATE_BLOCKED. WARN and BLOCK behave exactly as before.
     */
    @Transactional(noRollbackFor = OrgException.class)
    public List<Finding> enforce(OrgMembership me, Long consultantId, ClientRequirement job, Confirm confirm, Hold hold) {
        Long orgId = me.orgId();
        List<Finding> found = findings(orgId, consultantId, job);
        if (found.isEmpty()) return found;
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("findings", found.stream().map(Finding::asMap).toList());
        extra.put("consultantId", consultantId);
        extra.put("requirementId", job.getId());
        String policy = settings.duplicatePolicy(orgId);
        String first = found.get(0).message();
        if (PipelineGuardSettings.BLOCK.equals(policy)) {
            throw OrgException.coded(409, CODE_BLOCKED, first + " Your organization does not allow this.", extra);
        }
        Confirm c = confirm == null ? Confirm.NONE : confirm;
        boolean needsApproval = PipelineGuardSettings.REQUIRE_APPROVAL.equals(policy);
        if (!c.confirmed()) {
            if (needsApproval) extra.put("policy", PipelineGuardSettings.REQUIRE_APPROVAL);
            throw OrgException.coded(409, CODE_WARNING, first + (needsApproval ? " Send it to a manager for approval with a reason." : " Confirm with a reason to go ahead."), extra);
        }
        String reason = c.reason() == null ? "" : c.reason().strip();
        if (reason.isEmpty() || reason.length() > REASON_MAX) throw OrgException.coded(400, "VALIDATION", "duplicateReason: enter 1 to " + REASON_MAX + " characters", Map.of("field", "duplicateReason"));
        SensitiveContent.check("duplicateReason", "duplicateReason", reason);
        if (needsApproval) {
            if (c.approvedByManager()) {
                audit.record(
                    orgId, me.login(), me.role(), AUDIT_OVERRIDE, "CONSULTANT", null, String.valueOf(consultantId),
                    "requirement " + job.getId() + "; " + String.join(",", found.stream().map(Finding::rule).toList()) + "; approved by member " + c.approvedByMemberId()
                        + (c.requestedByMemberId() == null ? "" : ", requested by member " + c.requestedByMemberId()) + "; reason: " + reason,
                    null, null, null, "HIGH"
                );
                return found;
            }
            if (hold == null) throw OrgException.coded(409, CODE_BLOCKED, first + " Your organization needs a manager's approval for this and it cannot be asked for here.", extra);
            throw hold.hold(found, reason);
        }
        audit.record(me, AUDIT_OVERRIDE, "CONSULTANT", null, String.valueOf(consultantId),
            "requirement " + job.getId() + "; " + String.join(",", found.stream().map(Finding::rule).toList()) + "; reason: " + reason);
        return found;
    }

    /** 409 ASSIGNMENT_CAP when the consultant already holds the admin-set maximum of open opportunities (0 = off). */
    @Transactional(readOnly = true, noRollbackFor = OrgException.class)
    public void assertOpenCap(Long orgId, Long consultantId) {
        int cap = settings.openMatchesMax(orgId);
        if (cap <= 0) return;
        long open = repo.countOpenMatches(orgId, consultantId);
        if (open >= cap) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("open", open);
            extra.put("cap", cap);
            extra.put("consultantId", consultantId);
            throw OrgException.coded(409, CODE_CAP, "This consultant already has " + open + " open opportunities, the most your organization allows (" + cap + ").", extra);
        }
    }
}
