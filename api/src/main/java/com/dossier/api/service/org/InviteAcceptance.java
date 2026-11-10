package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.org.InviteCeilingChecker.RoleView;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What accepting an invitation does to the seat's roles and placement (X1.15, 42-threat-model.md T32). Runs inside the accept
 * transaction, right after the seat became ACTIVE:
 *
 * <ol>
 *   <li>Every invited role is checked AGAIN against the inviter's rights as they are NOW ({@link InviteCeilingChecker#rightsOf}). A
 *       person whose own rights shrank (or who left, or was suspended) since they sent the invitation cannot have granted what they no
 *       longer could.</li>
 *   <li>Roles no longer grantable are TRIMMED. The invitee joins with the ones that remain; when none remain they join with the
 *       organization's default role (CONSULTANT for a consultancy-type organization, else MEMBER). The seat's live role rows are
 *       replaced (the old ones end, never deleted: they are history), the legacy enum mirrors the new primary role.</li>
 *   <li>A trim is audited ({@code INVITE_ROLES_TRIMMED}, the roles listed) and the inviter is told in-app.</li>
 *   <li>A manager who is no longer an active member is dropped from the seat; a deleted department or team already cleared itself
 *       (ON DELETE SET NULL).</li>
 * </ol>
 */
@Service
public class InviteAcceptance {

    private static final Logger LOG = LoggerFactory.getLogger(InviteAcceptance.class);
    private static final Set<OrgType> CONSULTANT_ORGS = EnumSet.of(OrgType.CONSULTANCY, OrgType.STAFFING, OrgType.PROFESSIONAL_SERVICES);

    private final InviteCeilingChecker ceiling;
    private final OrgMemberRoleRepository memberRoles;
    private final OrgMemberRepository members;
    private final OrgAuditService audit;
    private final NotificationService notifications;
    private final OrgRoleService roleService;

    public InviteAcceptance(
        InviteCeilingChecker ceiling,
        OrgMemberRoleRepository memberRoles,
        OrgMemberRepository members,
        OrgAuditService audit,
        NotificationService notifications,
        OrgRoleService roleService
    ) {
        this.ceiling = ceiling;
        this.memberRoles = memberRoles;
        this.members = members;
        this.audit = audit;
        this.notifications = notifications;
        this.roleService = roleService;
    }

    /** {@code trimmed} are the role keys that were dropped (empty = nothing changed); {@code kept} the keys the seat now holds. */
    public record Outcome(List<String> trimmed, List<String> kept) {
        public boolean wasTrimmed() {
            return !trimmed.isEmpty();
        }
    }

    @Transactional
    public Outcome apply(Organization org, OrgMember seat, User joiner) {
        dropStaleManager(seat);
        List<Long> ids = OrgInviteService.parseIds(seat.getInviteRoleIdsJson());
        if (ids.isEmpty()) return new Outcome(List.of(), List.of()); // an invitation sent before X1.15: its single role was dual-written at invite time

        Optional<List<RoleView>> resolved = ceiling.resolve(org.getId(), ids);
        List<RoleView> views = resolved.orElse(List.of());
        InviteCeilingChecker.Rights rights = ceiling.rightsOf(org.getId(), seat.getInvitedByMemberId());
        List<RoleView> keep = new ArrayList<>();
        List<String> trimmed = new ArrayList<>();
        for (RoleView v : views) {
            if (ceiling.grantable(rights, v)) keep.add(v);
            else trimmed.add(v.key());
        }
        if (resolved.isEmpty()) ids.forEach(id -> trimmed.add("role#" + id)); // a role that no longer exists in this organization grants nothing
        if (trimmed.isEmpty()) return new Outcome(List.of(), views.stream().map(RoleView::key).toList());

        if (keep.isEmpty()) defaultRole(org).ifPresent(keep::add);
        replaceRoles(seat, keep);

        audit.record(
            org.getId(), joiner.getLogin(), seat.getRole(), OrgAuditService.INVITE_ROLES_TRIMMED, OrgAuditService.TARGET_MEMBER, joiner.getLogin(), String.valueOf(seat.getId()),
            "trimmed=" + String.join(",", trimmed) + " kept=" + String.join(",", keptKeys(keep, seat)), null, null, null, "MEDIUM"
        );
        notifyInviter(org, seat, joiner);
        return new Outcome(trimmed, keptKeys(keep, seat));
    }

    private static List<String> keptKeys(List<RoleView> keep, OrgMember seat) {
        return keep.isEmpty() ? List.of(seat.getRole().name()) : keep.stream().map(RoleView::key).toList();
    }

    private Optional<RoleView> defaultRole(Organization org) {
        return ceiling.systemTemplate(org.getId(), CONSULTANT_ORGS.contains(org.getType()) ? RoleTemplates.CONSULTANT : RoleTemplates.MEMBER);
    }

    /** Ends the seat's live role rows and writes {@code keep} (first = primary); with nothing to keep the seat becomes a MEMBER through the dual write. */
    private void replaceRoles(OrgMember seat, List<RoleView> keep) {
        Instant now = Instant.now();
        for (OrgMemberRole old : memberRoles.findLiveByOrgIdAndMemberId(seat.getOrgId(), seat.getId())) {
            old.setPrimary(false);
            old.setEndsAt(now);
            memberRoles.saveAndFlush(old); // flushed one by one: the new rows may reuse a (member, role) key the old rows hold until they end
        }
        if (keep.isEmpty()) {
            seat.setRole(OrgRole.MEMBER);
            seat.setPrimaryRoleId(null);
            seat.setInviteRoleIdsJson(null);
            members.saveAndFlush(seat);
            roleService.syncFromLegacy(seat);
            return;
        }
        for (int i = 0; i < keep.size(); i++) {
            OrgMemberRole r = new OrgMemberRole();
            r.setOrgId(seat.getOrgId());
            r.setMemberId(seat.getId());
            r.setRoleId(keep.get(i).id());
            r.setPrimary(i == 0);
            r.setGrantedByMemberId(seat.getInvitedByMemberId());
            r.setGrantedAt(now);
            memberRoles.saveAndFlush(r);
        }
        seat.setRole(keep.get(0).mirror());
        seat.setPrimaryRoleId(keep.get(0).id());
        seat.setInviteRoleIdsJson(OrgInviteService.toJson(keep.stream().map(RoleView::id).toList()));
        members.saveAndFlush(seat);
    }

    private void dropStaleManager(OrgMember seat) {
        if (seat.getManagerMemberId() == null) return;
        boolean active = members.findByOrgIdAndId(seat.getOrgId(), seat.getManagerMemberId()).filter(m -> m.getStatus() == OrgMemberStatus.ACTIVE).isPresent();
        if (!active) {
            seat.setManagerMemberId(null);
            members.saveAndFlush(seat);
        }
    }

    private void notifyInviter(Organization org, OrgMember seat, User joiner) {
        if (seat.getInvitedByMemberId() == null) return;
        Optional<OrgMember> inviter = members.findByOrgIdAndId(org.getId(), seat.getInvitedByMemberId());
        if (inviter.isEmpty() || inviter.get().getUserId() == null) return;
        String who = OrgInviteService.nameOf(joiner);
        if (who.isBlank()) who = seat.getInviteEmail() == null ? "Someone" : seat.getInviteEmail();
        try {
            notifications.publish(
                NotificationKind.ORG_INVITE_ACCEPTED,
                inviter.get().getUserId(),
                NotificationService.Payload.of(who + " joined " + org.getName() + " with adjusted roles", "Some roles you invited them to were no longer yours to give, so they joined with " + keptSummary(seat) + ".", "/org/team")
                    .deduped("org-join-trim:" + org.getId() + ":" + seat.getId())
            );
        } catch (RuntimeException e) {
            LOG.warn("Could not notify the inviter about trimmed roles for org {}", org.getId(), e); // the join itself stands
        }
    }

    private String keptSummary(OrgMember seat) {
        List<Long> ids = OrgInviteService.parseIds(seat.getInviteRoleIdsJson());
        if (ids.isEmpty()) return seat.getRole().name().toLowerCase(java.util.Locale.ROOT);
        return ceiling.resolve(seat.getOrgId(), ids).map(v -> v.stream().map(r -> r.def().getName()).collect(Collectors.joining(", "))).orElse(seat.getRole().name().toLowerCase(java.util.Locale.ROOT));
    }
}
