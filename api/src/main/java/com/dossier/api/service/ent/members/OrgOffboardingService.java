package com.dossier.api.service.ent.members;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberOffboarding;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberOffboardingRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.dto.ent.MemberDTO;
import com.dossier.api.service.ent.TenantScoped;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Offboarding: the seat ends, the records stay (X4.4, 15-employees-and-teams.md section 5).
 *
 * <p><b>What it does.</b> ACTIVE or SUSPENDED becomes REMOVED with {@code left_at} set; the person's role rows end (history kept); the ordered
 * {@link OffboardingHook} chain runs (sessions, assignments, consent, and whatever later stories register); the audit trail, the person's
 * account and everything they own personally (resumes, applications, their own profile) are untouched. <b>Exception (decision O4, S8):</b> when the account is an
 * ENTERPRISE account of this organization it is disabled and its sessions revoked ({@link EnterpriseAccountOffboardingHook}), kept for
 * {@code org.account.retentionDays}, then erased ({@link EnterpriseAccountRetention}). A removed person is re-invited as a new
 * seat later; the old row keeps the history and frees the email and the account slot (the database's generated unique keys only cover live seats).
 *
 * <p><b>When.</b> {@code effectiveAt} null or not in the future applies now. A future day schedules it: the seat stays as it is and one PENDING
 * {@code org_member_offboarding} row waits for the hourly job (at most one per member, a database fact). A scheduled removal can be cancelled by
 * anyone who may offboard that person, until the job runs.
 *
 * <p><b>Guards</b> (in this order, each answers once): the generic 404 (not reachable, a closed organization); 409 {@code SELF}; 409
 * {@code INVALID_TRANSITION}; 422 {@code ROLE_CEILING} (rank); 409 {@code OWNER_MUST_TRANSFER}; 409 {@code LAST_ADMIN}; 422 validation (reason 10 to 500
 * characters, the typed confirmation, the date); 409 {@code OFFBOARDING_PENDING}. The preview reports the first three as {@code blockers} instead of
 * failing, so the wizard can show them in step 1.
 */
@Service
public class OrgOffboardingService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgOffboardingService.class);

    public static final String CODE_OFFBOARDING_PENDING = "OFFBOARDING_PENDING";
    public static final String CODE_CONFIRM_MISMATCH = "CONFIRM_MISMATCH";
    public static final String LICENSE_NOTICE = "License ends now; the paid period isn't refunded";
    /** How far ahead a last day may be scheduled. */
    static final Duration MAX_AHEAD = Duration.ofDays(366);
    /** A last day within this much of now is "now": a clock a moment slow on the client must not schedule an immediate removal for an hour. */
    static final Duration GRACE = Duration.ofMinutes(2);

    private static final List<String> RECORDS_KEPT = List.of(
        "The organization's audit trail", "Their account and everything they own personally", "Their seat row, ended, for history", "Their past roles, ended"
    );

    private final OrgMemberRepository members;
    private final OrgMemberRoleRepository memberRoles;
    private final OrgMemberOffboardingRepository offboardings;
    private final UserRepository users;
    private final MemberAccess access;
    private final MemberGuards guards;
    private final OffboardingHooks hooks;
    private final OrgAuditService audit;
    private final DataShareService dataShare;
    private final ObjectMapper json;
    private final Clock clock;
    private final TransactionTemplate rowTx;

    @PersistenceContext
    private EntityManager em;

    // Field-injected and optional (O4, doc 19 S8): absent in hand-wired tests, where the preview keeps the legacy "records kept" text.
    @Autowired(required = false)
    private EnterpriseAccountLifecycle accounts;

    @Autowired
    public OrgOffboardingService(
        OrgMemberRepository members,
        OrgMemberRoleRepository memberRoles,
        OrgMemberOffboardingRepository offboardings,
        UserRepository users,
        MemberAccess access,
        MemberGuards guards,
        OffboardingHooks hooks,
        OrgAuditService audit,
        DataShareService dataShare,
        ObjectMapper json,
        PlatformTransactionManager txManager
    ) {
        this(members, memberRoles, offboardings, users, access, guards, hooks, audit, dataShare, json, txManager, Clock.systemUTC());
    }

    OrgOffboardingService(
        OrgMemberRepository members,
        OrgMemberRoleRepository memberRoles,
        OrgMemberOffboardingRepository offboardings,
        UserRepository users,
        MemberAccess access,
        MemberGuards guards,
        OffboardingHooks hooks,
        OrgAuditService audit,
        DataShareService dataShare,
        ObjectMapper json,
        PlatformTransactionManager txManager,
        Clock clock
    ) {
        this.members = members;
        this.memberRoles = memberRoles;
        this.offboardings = offboardings;
        this.users = users;
        this.access = access;
        this.guards = guards;
        this.hooks = hooks;
        this.audit = audit;
        this.dataShare = dataShare;
        this.json = json;
        this.clock = clock;
        this.rowTx = new TransactionTemplate(txManager); // REQUIRED: one transaction per scheduled row when the job runs alone
    }

    /** The permission wall of offboarding, on its own so the endpoint can refuse before it reads the Idempotency-Key. */
    @Transactional(readOnly = true)
    public void requireOffboardable(OrgMembership me, Long memberId) {
        access.requireWritable(me, MemberAccess.KEY_REMOVE);
        reachable(me, memberId);
    }

    // ---- preview ----------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public MemberActionDTO.OffboardPreview preview(OrgMembership me, Long memberId) {
        OrgMember seat = reachable(me, memberId);
        List<MemberActionDTO.Blocker> blockers = new ArrayList<>();
        if (seat.getId().equals(me.memberId())) blockers.add(new MemberActionDTO.Blocker(MemberGuards.CODE_SELF, "You cannot offboard yourself"));
        if (seat.getStatus() != OrgMemberStatus.ACTIVE && seat.getStatus() != OrgMemberStatus.SUSPENDED) {
            blockers.add(new MemberActionDTO.Blocker(OrgMemberLifecycleService.CODE_INVALID_TRANSITION, "Only an active or suspended member can be offboarded"));
        }
        if (guards.rankRefuses(me, seat)) blockers.add(new MemberActionDTO.Blocker("ROLE_CEILING", "Your role may not offboard that person"));
        if (guards.isOwner(seat)) blockers.add(new MemberActionDTO.Blocker(MemberGuards.CODE_OWNER_MUST_TRANSFER, "Transfer ownership first"));
        else {
            OrgException last = guards.lastAdminProblem(me.orgId(), seat);
            if (last != null) blockers.add(new MemberActionDTO.Blocker(MemberGuards.CODE_LAST_ADMIN, last.getMessage()));
        }
        List<String> roleNames = roleNames(me.orgId(), seat);
        String consent = dataShare.viewOf(me.orgId(), seat.getId()).map(v -> v.scope().name()).orElse("NONE");
        List<String> kept = RECORDS_KEPT;
        if (accounts != null && accounts.accountOf(me.orgId(), seat).isPresent()) {
            // O4: the person's account is the organization's: disabled now, exportable, erased after the retention window (the hook lines give the date).
            kept = List.of(
                "The organization's audit trail", "Their organization account, disabled, with its data for " + accounts.retentionDays() + " days, then erased",
                "Their seat row, ended, for history", "Their past roles, ended"
            );
        }
        return new MemberActionDTO.OffboardPreview(
            seat.getId(), nameOf(seat), seat.getStatus().name(), blockers, hooks.preview(me.orgId(), seat.getId()), roleNames, consent, kept, LICENSE_NOTICE
        );
    }

    // ---- offboard ---------------------------------------------------------------------------------------------------------------

    @Transactional
    public MemberActionDTO.LifecycleResult offboard(OrgMembership me, Long memberId, MemberActionDTO.OffboardRequest req) {
        access.requireWritable(me, MemberAccess.KEY_REMOVE);
        OrgMember seat = reachable(me, memberId);
        Long orgId = me.orgId();
        guards.requireNotSelf(me, seat);
        if (seat.getStatus() != OrgMemberStatus.ACTIVE && seat.getStatus() != OrgMemberStatus.SUSPENDED) {
            throw OrgMemberLifecycleService.invalid(seat.getStatus(), OrgMemberStatus.REMOVED, List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED));
        }
        guards.requireRank(me, seat);
        if (guards.isOwner(seat)) {
            throw OrgException.coded(409, MemberGuards.CODE_OWNER_MUST_TRANSFER, "Transfer ownership before offboarding an owner", Map.of());
        }
        guards.requireNotLastAdmin(orgId, seat);
        if (req == null) throw OrgException.invalid("body", "is required");
        String reason = OrgMemberLifecycleService.requireReason(req.reason());
        String name = nameOf(seat);
        if (req.confirm() == null || !req.confirm().strip().equalsIgnoreCase(name)) {
            throw OrgException.coded(422, CODE_CONFIRM_MISMATCH, "Type the person's name exactly to confirm", Map.of());
        }
        List<MemberActionDTO.Reassignment> reassignments = cleanReassignments(req.reassignments());
        Instant now = Instant.now(clock);
        Instant at = req.effectiveAt();
        if (at != null && at.isAfter(now.plus(MAX_AHEAD))) throw OrgException.invalid("effectiveAt", "at most one year ahead");
        boolean scheduled = at != null && at.isAfter(now.plus(GRACE));

        if (scheduled) {
            if (offboardings.findPendingByOrgIdAndMemberId(orgId, seat.getId()).isPresent()) {
                throw OrgException.coded(409, CODE_OFFBOARDING_PENDING, "A last day is already scheduled for this person; cancel it first", Map.of());
            }
            OrgMemberOffboarding row = new OrgMemberOffboarding();
            row.setOrgId(orgId);
            row.setMemberId(seat.getId());
            row.setEffectiveAt(at);
            row.setReason(reason);
            row.setCreatedByMemberId(me.memberId());
            row.setCreatedAt(now);
            row = offboardings.saveAndFlush(row);
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("effectiveAt", at.toString());
            details.put("reason", reason);
            details.put("reassignments", reassignments.size());
            record(orgId, me.login(), me.role(), MemberAuditActions.MEMBER_OFFBOARD_SCHEDULED, seat, details, "MEDIUM");
            return new MemberActionDTO.LifecycleResult(
                seat.getId(), "OFFBOARD", seat.getStatus().name(), seat.getStatus().name(),
                new MemberDTO.ScheduledOffboarding(row.getId(), row.getEffectiveAt(), row.getReason(), row.getCreatedAt()), List.of()
            );
        }

        OrgMemberStatus before = seat.getStatus();
        offboardings.findPendingByOrgIdAndMemberId(orgId, seat.getId()).ifPresent(p -> finish(p, OrgMemberOffboarding.DONE, "SUPERSEDED", now)); // an earlier schedule is overtaken
        List<MemberActionDTO.HookLine> lines = remove(orgId, seat, reason, me.login(), me.role(), me.memberId(), reassignments, "IMMEDIATE", now);
        return new MemberActionDTO.LifecycleResult(seat.getId(), "OFFBOARD", before.name(), seat.getStatus().name(), null, lines);
    }

    // ---- scheduled list and cancel ---------------------------------------------------------------------------------------------

    /** The scheduled last days of the people the caller may offboard, soonest first. */
    @Transactional(readOnly = true)
    public MemberActionDTO.ScheduledList scheduled(OrgMembership me) {
        access.requireScope(me, MemberAccess.KEY_REMOVE);
        List<MemberActionDTO.Scheduled> out = new ArrayList<>();
        for (OrgMemberOffboarding row : offboardings.findPendingByOrgId(me.orgId())) {
            Optional<OrgMember> seat = members.findByOrgIdAndId(me.orgId(), row.getMemberId());
            if (seat.isEmpty() || !access.canAct(me, MemberAccess.KEY_REMOVE, seat.get().getId())) continue;
            out.add(new MemberActionDTO.Scheduled(row.getId(), row.getMemberId(), nameOf(seat.get()), row.getEffectiveAt(), row.getReason(), row.getCreatedAt()));
        }
        return new MemberActionDTO.ScheduledList(out);
    }

    /** Withdraws a scheduled last day before the job runs it. 404 for another organization's row or one the caller may not reach. */
    @Transactional
    public void cancel(OrgMembership me, Long offboardingId) {
        access.requireWritable(me, MemberAccess.KEY_REMOVE);
        OrgMemberOffboarding row = offboardings.findByOrgIdAndId(me.orgId(), offboardingId).orElseThrow(OrgNotFoundException::new);
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), row.getMemberId()).orElseThrow(OrgNotFoundException::new);
        if (!access.canAct(me, MemberAccess.KEY_REMOVE, seat.getId())) throw new OrgNotFoundException();
        if (!OrgMemberOffboarding.PENDING.equals(row.getStatus())) {
            throw OrgException.coded(409, OrgMemberLifecycleService.CODE_INVALID_TRANSITION, "That last day is no longer pending", Map.of("from", row.getStatus(), "to", OrgMemberOffboarding.CANCELLED, "allowed", List.of(OrgMemberOffboarding.PENDING)));
        }
        finish(row, OrgMemberOffboarding.CANCELLED, "CANCELLED", Instant.now(clock));
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("effectiveAt", row.getEffectiveAt().toString());
        record(me.orgId(), me.login(), me.role(), MemberAuditActions.MEMBER_OFFBOARD_CANCELLED, seat, details, "MEDIUM");
    }

    // ---- the job ---------------------------------------------------------------------------------------------------------------

    /** Hourly: applies every scheduled last day that has arrived. */
    @Scheduled(cron = "${dossier.ent.offboarding-cron:0 5 * * * *}", zone = "UTC")
    public void runScheduled() {
        try {
            int done = runDue(Instant.now(clock));
            if (done > 0) LOG.info("Offboarding job applied {} scheduled last day(s)", done);
        } catch (RuntimeException e) {
            LOG.error("Offboarding job failed", e);
        }
    }

    /**
     * Applies every PENDING row whose day is at or before {@code now}, each in its own savepoint. A row that can no longer go ahead (the person
     * was already removed, became the last administrator, became an owner) is marked FAILED with the reason and left for an administrator to see;
     * one failing row never stops the others. Returns how many were applied.
     */
    public int runDue(Instant now) {
        List<OrgMemberOffboarding> due = em
            .createQuery("select o from OrgMemberOffboarding o where o.status = 'PENDING' and o.effectiveAt <= :now order by o.effectiveAt asc, o.id asc", OrgMemberOffboarding.class)
            .setParameter("now", now)
            .getResultList();
        int applied = 0;
        for (OrgMemberOffboarding row : due) {
            Long orgId = row.getOrgId();
            Long rowId = row.getId();
            String[] failure = new String[1];
            try {
                Boolean ok = TenantScoped.get(orgId, () -> rowTx.execute(status -> applyScheduled(orgId, rowId, now, failure)));
                if (Boolean.TRUE.equals(ok)) applied++;
            } catch (RuntimeException e) {
                LOG.warn("Scheduled offboarding {} failed: {}", rowId, e.toString());
                failure[0] = e instanceof OrgException oe ? oe.getCode() : "ERROR";
            }
            if (failure[0] != null) markFailed(orgId, rowId, failure[0], now);
        }
        return applied;
    }

    private Boolean applyScheduled(Long orgId, Long rowId, Instant now, String[] failure) {
        OrgMemberOffboarding row = offboardings.findByOrgIdAndId(orgId, rowId).orElse(null);
        if (row == null || !OrgMemberOffboarding.PENDING.equals(row.getStatus())) return false;
        OrgMember seat = members.findByOrgIdAndId(orgId, row.getMemberId()).orElse(null);
        if (seat == null || (seat.getStatus() != OrgMemberStatus.ACTIVE && seat.getStatus() != OrgMemberStatus.SUSPENDED)) {
            failure[0] = OrgMemberLifecycleService.CODE_INVALID_TRANSITION;
            return false;
        }
        if (guards.isOwner(seat)) {
            failure[0] = MemberGuards.CODE_OWNER_MUST_TRANSFER;
            return false;
        }
        OrgException last = guards.lastAdminProblem(orgId, seat);
        if (last != null) {
            failure[0] = MemberGuards.CODE_LAST_ADMIN;
            return false;
        }
        remove(orgId, seat, row.getReason(), OrgAuditService.SYSTEM_ACTOR, null, row.getCreatedByMemberId(), List.of(), "SCHEDULED", now);
        finish(row, OrgMemberOffboarding.DONE, "APPLIED", now);
        return true;
    }

    private void markFailed(Long orgId, Long rowId, String code, Instant now) {
        offboardings.findByOrgIdAndId(orgId, rowId).ifPresent(row -> {
            if (OrgMemberOffboarding.PENDING.equals(row.getStatus())) finish(row, OrgMemberOffboarding.FAILED, code, now);
        });
    }

    private void finish(OrgMemberOffboarding row, String status, String outcome, Instant now) {
        row.setStatus(status);
        row.setOutcome(outcome);
        row.setDoneAt(now);
        offboardings.saveAndFlush(row);
    }

    // ---- the transition ---------------------------------------------------------------------------------------------------------

    /** Ends the seat now: hooks, roles, status, audit. The caller has already run every guard. */
    private List<MemberActionDTO.HookLine> remove(
        Long orgId,
        OrgMember seat,
        String reason,
        String actorLogin,
        OrgRole actorRole,
        Long actorMemberId,
        List<MemberActionDTO.Reassignment> reassignments,
        String mode,
        Instant now
    ) {
        String login = loginOf(seat);
        List<MemberActionDTO.HookLine> lines = hooks.apply(new OffboardingHook.Context(orgId, seat.getId(), login, reason, actorLogin, reassignments));
        int ended = 0;
        for (OrgMemberRole row : memberRoles.findLiveByOrgIdAndMemberId(orgId, seat.getId())) {
            row.setEndsAt(now);
            row.setPrimary(false);
            memberRoles.saveAndFlush(row);
            ended++;
        }
        OrgMemberStatus before = seat.getStatus();
        seat.setStatus(OrgMemberStatus.REMOVED);
        seat.setLeftAt(now);
        members.saveAndFlush(seat);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("from", before.name());
        details.put("to", OrgMemberStatus.REMOVED.name());
        details.put("mode", mode);
        details.put("reason", reason);
        details.put("rolesEnded", ended);
        details.put("hooks", hooks.keys());
        details.put("reassignments", reassignments.size());
        details.put("actorMemberId", actorMemberId);
        record(orgId, actorLogin, actorRole, OrgAuditService.MEMBER_REMOVE, seat, details, "HIGH");
        return lines;
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------------

    private OrgMember reachable(OrgMembership me, Long memberId) {
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), memberId).orElseThrow(OrgNotFoundException::new);
        if (seat.getStatus() == OrgMemberStatus.ERASED || !access.canAct(me, MemberAccess.KEY_REMOVE, seat.getId())) throw new OrgNotFoundException();
        return seat;
    }

    private String loginOf(OrgMember seat) {
        return seat.getUserId() == null ? null : users.findById(seat.getUserId()).map(User::getLogin).orElse(null);
    }

    /** The name the board shows for the seat (what the typed confirmation must equal). */
    String nameOf(OrgMember seat) {
        User u = seat.getUserId() == null ? null : users.findById(seat.getUserId()).orElse(null);
        return OrgMemberQueryService.personName(u, seat);
    }

    /** The names of the roles that will end, for the wizard (the board's own role chips). */
    private List<String> roleNames(Long orgId, OrgMember seat) {
        List<String> names = new ArrayList<>();
        em
            .createQuery(
                "select d.name from OrgMemberRole m, OrgRoleDefinition d where m.orgId = :orgId and m.memberId = :memberId and m.endsAt is null and d.id = m.roleId order by m.primary desc, m.id asc",
                String.class
            )
            .setParameter("orgId", orgId)
            .setParameter("memberId", seat.getId())
            .getResultList()
            .forEach(names::add);
        if (names.isEmpty() && seat.getRole() != null) names.add(seat.getRole().name());
        return names;
    }

    private static List<MemberActionDTO.Reassignment> cleanReassignments(List<MemberActionDTO.Reassignment> raw) {
        if (raw == null || raw.isEmpty()) return List.of();
        if (raw.size() > 200) throw OrgException.invalid("reassignments", "at most 200");
        for (MemberActionDTO.Reassignment r : raw) {
            if (r == null || r.consultantMemberId() == null || r.newAssigneeMemberId() == null || r.consultantMemberId() <= 0 || r.newAssigneeMemberId() <= 0) {
                throw OrgException.invalid("reassignments", "each needs a consultantMemberId and a newAssigneeMemberId");
            }
        }
        return List.copyOf(raw);
    }

    private void record(Long orgId, String actorLogin, OrgRole actorRole, String action, OrgMember seat, Map<String, Object> details, String risk) {
        String text;
        try {
            text = json.writeValueAsString(details);
        } catch (JsonProcessingException e) {
            text = String.valueOf(details);
        }
        audit.record(orgId, actorLogin, actorRole, action, OrgAuditService.TARGET_MEMBER, loginOf(seat), String.valueOf(seat.getId()), text, null, null, null, risk);
    }
}
