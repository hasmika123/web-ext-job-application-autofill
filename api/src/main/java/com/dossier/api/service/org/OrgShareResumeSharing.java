package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.DataShare;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.DataShareRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.resume.OrgResumeSharing;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The org area's answer to the resume access path (the {@link OrgResumeSharing} seam, O6.1): a resume is readable by an
 * org viewer only while its owner's scope is FULL <em>and</em> names that viewer. Everything is read from
 * {@link DataShareService#scopeOf} on every call, so a withdrawal, a closed org, a suspended seat or a marketer who
 * left takes effect on the next request. Every FULL read is written to {@code org_audit_event} as
 * {@code SHARE_READ_FULL} (consent-data-sharing.md decision 5).
 */
@Service
public class OrgShareResumeSharing implements OrgResumeSharing {

    private final DataShareService dataShare;
    private final DataShareRepository shares;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final OrgAuditService audit;

    public OrgShareResumeSharing(DataShareService dataShare, DataShareRepository shares, OrgMemberRepository members, UserRepository users, OrgAuditService audit) {
        this.dataShare = dataShare;
        this.shares = shares;
        this.members = members;
        this.users = users;
        this.audit = audit;
    }

    /** The widest effective sharing across the owner's ACTIVE seats; empty when they belong to no organization. */
    @Override
    @Transactional(readOnly = true)
    public Optional<Pairing> pairingOf(String ownerLogin) {
        Optional<User> owner = user(ownerLogin);
        if (owner.isEmpty()) return Optional.empty();
        ShareScope best = null;
        String pairedWith = null;
        for (OrgMember seat : members.findMine(owner.get().getId())) {
            if (seat.getStatus() != OrgMemberStatus.ACTIVE) continue;
            ShareScope scope = dataShare.scopeOf(seat.getOrgId(), seat.getId());
            if (best == null || scope.compareTo(best) > 0) {
                best = scope;
                pairedWith = scope == ShareScope.FULL ? labelOfPaired(seat) : null;
            }
        }
        return best == null ? Optional.empty() : Optional.of(new Pairing(best.name(), pairedWith));
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isFullPairedViewer(String ownerLogin, String viewerLogin) {
        return pairedSeat(ownerLogin, viewerLogin).isPresent();
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> ownersSharingFullWith(String viewerLogin) {
        Optional<User> viewer = user(viewerLogin);
        if (viewer.isEmpty()) return List.of();
        List<String> out = new ArrayList<>();
        for (OrgMember seat : members.findMine(viewer.get().getId())) {
            if (seat.getStatus() != OrgMemberStatus.ACTIVE) continue;
            for (DataShare share : shares.findByOrgIdAndFullToMemberId(seat.getOrgId(), seat.getId())) {
                if (dataShare.scopeOf(seat.getOrgId(), share.getMemberId()) != ShareScope.FULL) continue;
                members
                    .findByOrgIdAndId(seat.getOrgId(), share.getMemberId())
                    .map(OrgMember::getUserId)
                    .flatMap(id -> id == null ? Optional.<User>empty() : users.findById(id))
                    .map(User::getLogin)
                    .filter(login -> !out.contains(login))
                    .ifPresent(out::add);
            }
        }
        return out;
    }

    @Override
    @Transactional
    public void auditFullRead(String ownerLogin, String viewerLogin, Long resumeId) {
        Optional<OrgMember> viewerSeat = pairedSeat(ownerLogin, viewerLogin);
        if (viewerSeat.isEmpty()) return; // not paired (any more): there is no org read to record
        audit.record(
            viewerSeat.get().getOrgId(),
            viewerLogin,
            viewerSeat.get().getRole(),
            OrgAuditService.SHARE_READ_FULL,
            OrgAuditService.TARGET_RESUME,
            ownerLogin,
            String.valueOf(resumeId),
            "resume:" + resumeId,
            null
        );
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    /** The viewer's seat in the org where the owner currently shares FULL with exactly this viewer. */
    private Optional<OrgMember> pairedSeat(String ownerLogin, String viewerLogin) {
        Optional<User> owner = user(ownerLogin);
        Optional<User> viewer = user(viewerLogin);
        if (owner.isEmpty() || viewer.isEmpty() || owner.get().getId().equals(viewer.get().getId())) return Optional.empty();
        List<OrgMember> viewerSeats = members.findMine(viewer.get().getId());
        for (OrgMember ownerSeat : members.findMine(owner.get().getId())) {
            if (ownerSeat.getStatus() != OrgMemberStatus.ACTIVE) continue;
            if (dataShare.scopeOf(ownerSeat.getOrgId(), ownerSeat.getId()) != ShareScope.FULL) continue;
            Optional<Long> target = dataShare.viewOf(ownerSeat.getOrgId(), ownerSeat.getId()).map(DataShareService.ShareView::fullToMemberId);
            if (target.isEmpty()) continue;
            for (OrgMember vs : viewerSeats) {
                if (vs.getOrgId().equals(ownerSeat.getOrgId()) && vs.getId().equals(target.get()) && vs.getStatus() == OrgMemberStatus.ACTIVE) return Optional.of(vs);
            }
        }
        return Optional.empty();
    }

    private String labelOfPaired(OrgMember ownerSeat) {
        return dataShare
            .viewOf(ownerSeat.getOrgId(), ownerSeat.getId())
            .map(DataShareService.ShareView::fullToMemberId)
            .flatMap(id -> id == null ? Optional.<OrgMember>empty() : members.findByOrgIdAndId(ownerSeat.getOrgId(), id))
            .map(OrgMember::getUserId)
            .flatMap(id -> id == null ? Optional.<User>empty() : users.findById(id))
            .map(OrgShareResumeSharing::label)
            .orElse(null);
    }

    private static String label(User u) {
        String name = ((u.getFirstName() == null ? "" : u.getFirstName()) + " " + (u.getLastName() == null ? "" : u.getLastName())).strip();
        return name.isEmpty() ? u.getLogin() : name;
    }

    private Optional<User> user(String login) {
        return login == null || login.isBlank() ? Optional.empty() : users.findOneByLogin(login);
    }
}
