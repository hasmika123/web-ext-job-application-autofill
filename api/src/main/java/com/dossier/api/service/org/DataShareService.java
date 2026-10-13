package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.DataShare;
import com.dossier.api.domain.org.DataShareEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.DataShareEventRepository;
import com.dossier.api.repository.org.DataShareRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What a member shares with their organization, and the one place that answers "how much may the org see of this
 * person?" (docs/design/org/consent-data-sharing.md, story O6.1).
 *
 * <p><b>The member owns the switch.</b> {@link #grant} and {@link #revoke} take the {@link OrgMembership} the access check
 * produced for the CALLER and only ever change that caller's own row: there is no method that sets another person's
 * scope, and no org role can do it. Every change writes one {@code data_share_event} (and one {@code SHARE_SCOPE_CHANGED}
 * audit row) in the same transaction.
 *
 * <p><b>Revocation is immediate.</b> Nothing here is cached: {@link #scopeOf} is two indexed reads, so a withdrawal is
 * visible to the very next request. The effective scope is also never wider than reality: it is {@code NONE} when the
 * seat is not ACTIVE or the org is not live (suspended, closed), and a FULL grant whose named person no longer holds an
 * ACTIVE seat that may see FULL data degrades to {@code SUMMARY}.
 *
 * <p>Not here: the join and leave flows that call into it (O6.2, O2.2), the pairing table a marketer needs before FULL
 * can be offered (Phase 22; until then FULL may only name an ACTIVE seat whose role holds {@code member.view_full}),
 * and the consent screen. Free text is never accepted: a version string is checked against the texts that ship.
 */
@Service
public class DataShareService {

    /** Who and what a change came from, for the event row. Hashes are optional and never contain the raw value. */
    public record ShareContext(String ipHash, String userAgentHash) {
        public static final ShareContext EMPTY = new ShareContext(null, null);
    }

    /** A seat's current sharing, as the API shows it. */
    public record ShareView(ShareScope scope, Long fullToMemberId, String consentVersion, Instant grantedAt, Instant updatedAt) {}

    private static final Set<OrgStatus> LIVE = Set.of(OrgStatus.ACTIVE, OrgStatus.PAST_DUE);

    private final DataShareRepository shares;
    private final DataShareEventRepository events;
    private final OrgMemberRepository members;
    private final OrganizationRepository orgs;
    private final UserRepository users;
    private final OrgAuditService audit;
    private final OrgShareConsent consent;

    public DataShareService(
        DataShareRepository shares,
        DataShareEventRepository events,
        OrgMemberRepository members,
        OrganizationRepository orgs,
        UserRepository users,
        OrgAuditService audit,
        OrgShareConsent consent
    ) {
        this.shares = shares;
        this.events = events;
        this.members = members;
        this.orgs = orgs;
        this.users = users;
        this.audit = audit;
        this.consent = consent;
    }

    // ---- reads ---------------------------------------------------------------------------------------------------

    /**
     * How much of seat {@code memberId} the org may see right now. Never throws: an unknown seat, a seat of another org,
     * a seat that is not ACTIVE and an org that is not live are all {@code NONE}. This is the only reader an org-facing
     * query should use; it is always scoped by {@code orgId}, so a member id from another org answers {@code NONE}.
     */
    @Transactional(readOnly = true)
    public ShareScope scopeOf(Long orgId, Long memberId) {
        if (orgId == null || memberId == null) return ShareScope.NONE;
        Optional<DataShare> row = shares.findByOrgIdAndMemberId(orgId, memberId);
        if (row.isEmpty() || row.get().getScope() == ShareScope.NONE) return ShareScope.NONE;
        Optional<OrgMember> seat = members.findByOrgIdAndId(orgId, memberId);
        if (seat.isEmpty() || seat.get().getStatus() != OrgMemberStatus.ACTIVE || !isLive(orgId)) return ShareScope.NONE;
        if (row.get().getScope() == ShareScope.FULL && !fullTargetStillValid(orgId, row.get().getFullToMemberId())) return ShareScope.SUMMARY;
        return row.get().getScope();
    }

    /** The stored consent of a seat (not the effective scope), or empty when the member never chose. */
    @Transactional(readOnly = true)
    public Optional<ShareView> viewOf(Long orgId, Long memberId) {
        return shares.findByOrgIdAndMemberId(orgId, memberId).map(DataShareService::view);
    }

    // ---- writes (the member's own) --------------------------------------------------------------------------------

    /**
     * Sets the caller's own scope. {@code FULL} needs {@code fullToMemberId}: an ACTIVE seat of the same org whose role
     * may see FULL data, and never the caller. {@code SUMMARY} and {@code NONE} take none. A scope other than NONE needs a
     * {@code consentVersion} that ships with this build. Granting more than the member has today is refused while the org
     * is closed; reducing is always allowed (withdrawing consent must be as easy as giving it). A call that changes
     * nothing writes nothing.
     */
    @Transactional
    public ShareView grant(OrgMembership me, ShareScope scope, Long fullToMemberId, String consentVersion, ShareContext ctx) {
        if (scope == null) throw OrgException.invalid("scope", "is required");
        if (!me.can(OrgPermission.SELF_SHARE_SCOPE_SET)) throw new OrgNotFoundException();
        String version = scope == ShareScope.NONE && (consentVersion == null || consentVersion.isBlank()) ? OrgShareConsent.CURRENT : consentVersion;
        if (version == null || !consent.isKnown(version)) throw OrgException.invalid("consentVersion", "must be a consent text version that exists");
        if (scope != ShareScope.FULL && fullToMemberId != null) throw OrgException.invalid("fullToMemberId", "is only allowed with scope FULL");

        Optional<OrgMember> fullTo = Optional.empty();
        if (scope == ShareScope.FULL) {
            if (fullToMemberId == null) throw OrgException.invalid("fullToMemberId", "is required with scope FULL");
            fullTo = members.findByOrgIdAndId(me.orgId(), fullToMemberId).filter(m -> mayReceiveFull(m) && !m.getId().equals(me.memberId()));
            if (fullTo.isEmpty()) throw OrgException.invalid("fullToMemberId", "must be an active marketer in this organization");
        }

        Optional<DataShare> existing = shares.findByOrgIdAndMemberId(me.orgId(), me.memberId());
        ShareScope from = existing.map(DataShare::getScope).orElse(ShareScope.NONE);
        if (scope.compareTo(from) > 0 && me.orgStatus() == OrgStatus.CLOSED) throw OrgException.notEditable("This organization is closed and read-only");

        Long fullToId = fullTo.map(OrgMember::getId).orElse(null);
        if (existing.isPresent() && from == scope && java.util.Objects.equals(existing.get().getFullToMemberId(), fullToId) && version.equals(existing.get().getConsentVersion())) {
            return view(existing.get()); // nothing changed: nothing to record
        }

        Instant now = Instant.now();
        DataShare row = existing.orElseGet(DataShare::new);
        row.setOrgId(me.orgId());
        row.setMemberId(me.memberId());
        if (existing.isEmpty() || (from == ShareScope.NONE && scope != ShareScope.NONE)) row.setGrantedAt(now);
        row.setScope(scope);
        row.setFullToMemberId(fullToId);
        row.setConsentVersion(version);
        row.setUpdatedAt(now);
        row = shares.saveAndFlush(row);

        String fullToLogin = fullTo.flatMap(m -> loginOf(m.getUserId())).orElse(null);
        record(me.orgId(), me.login(), from, scope, fullToLogin, DataShareEvent.ACTOR_MEMBER, existing.isEmpty() ? DataShareEvent.REASON_JOIN : DataShareEvent.REASON_MEMBER_CHANGE, version, ctx);
        audit.record(me, OrgAuditService.SHARE_SCOPE_CHANGED, OrgAuditService.TARGET_MEMBER, me.login(), String.valueOf(me.memberId()), from + " -> " + scope);
        return view(row);
    }

    /** The caller withdraws all sharing: scope {@code NONE}, effective on the very next request. */
    @Transactional
    public ShareView revoke(OrgMembership me, ShareContext ctx) {
        return grant(me, ShareScope.NONE, null, null, ctx);
    }

    // ---- writes (the system's, when a seat or a pairing ends) -------------------------------------------------------

    /**
     * A seat left or was removed: its sharing ends at once (scope {@code NONE}, event {@code reason}). {@code reason} is
     * {@link DataShareEvent#REASON_MEMBER_LEFT} or {@link DataShareEvent#REASON_REMOVED}. The caller writes its own audit
     * row for the departure. Does nothing when the seat was not sharing.
     */
    @Transactional
    public void endFor(Long orgId, Long memberId, String memberLogin, String reason, String actor) {
        Optional<DataShare> row = shares.findByOrgIdAndMemberId(orgId, memberId);
        if (row.isEmpty() || row.get().getScope() == ShareScope.NONE) return;
        DataShare share = row.get();
        ShareScope from = share.getScope();
        String fullToLogin = share.getFullToMemberId() == null ? null : members.findByOrgIdAndId(orgId, share.getFullToMemberId()).flatMap(m -> loginOf(m.getUserId())).orElse(null);
        share.setScope(ShareScope.NONE);
        share.setFullToMemberId(null);
        share.setUpdatedAt(Instant.now());
        shares.saveAndFlush(share);
        record(orgId, memberLogin, from, ShareScope.NONE, fullToLogin, actor, reason, share.getConsentVersion(), ShareContext.EMPTY);
    }

    /**
     * The person {@code pairedMemberId} lost their seat (or the pairing ended): every FULL share naming them drops to
     * {@code SUMMARY} (event {@code PAIRING_ENDED}, actor {@code SYSTEM}). Returns how many members it affected.
     */
    @Transactional
    public int endPairingsTo(Long orgId, Long pairedMemberId, String pairedLogin) {
        int changed = 0;
        for (DataShare share : shares.findByOrgIdAndFullToMemberId(orgId, pairedMemberId)) {
            if (share.getScope() != ShareScope.FULL) continue;
            String memberLogin = members.findByOrgIdAndId(orgId, share.getMemberId()).flatMap(m -> loginOf(m.getUserId())).orElse(null);
            share.setScope(ShareScope.SUMMARY);
            share.setFullToMemberId(null);
            share.setUpdatedAt(Instant.now());
            shares.saveAndFlush(share);
            changed++;
            if (memberLogin != null) record(orgId, memberLogin, ShareScope.FULL, ShareScope.SUMMARY, pairedLogin, DataShareEvent.ACTOR_SYSTEM, DataShareEvent.REASON_PAIRING_ENDED, share.getConsentVersion(), ShareContext.EMPTY);
        }
        return changed;
    }

    /**
     * Account erasure: deletes the seat's {@code data_share} row (tenant-model.md section 6). When the member was sharing,
     * one {@code ERASED} event keyed by the login records the withdrawal; the event history itself stays (it holds no
     * profile data and is the proof of what was consented to).
     */
    @Transactional
    public void eraseFor(Long orgId, Long memberId, String memberLogin) {
        Optional<DataShare> row = shares.findByOrgIdAndMemberId(orgId, memberId);
        if (row.isEmpty()) return;
        DataShare share = row.get();
        if (share.getScope() != ShareScope.NONE) {
            record(orgId, memberLogin, share.getScope(), ShareScope.NONE, null, DataShareEvent.ACTOR_SYSTEM, DataShareEvent.REASON_ERASED, share.getConsentVersion(), ShareContext.EMPTY);
        }
        shares.deleteByOrgIdAndMemberId(orgId, memberId);
    }

    // ---- export ---------------------------------------------------------------------------------------------------

    /** The member's own sharing for the data export: the current choice and the full history of changes (no hashes). */
    @Transactional(readOnly = true)
    public Map<String, Object> exportFor(Long orgId, Long memberId, String memberLogin) {
        Map<String, Object> out = new LinkedHashMap<>();
        Optional<DataShare> row = shares.findByOrgIdAndMemberId(orgId, memberId);
        out.put("scope", row.map(DataShare::getScope).orElse(ShareScope.NONE));
        out.put("sharedWith", row.map(DataShare::getFullToMemberId).flatMap(id -> id == null ? Optional.<OrgMember>empty() : members.findByOrgIdAndId(orgId, id)).flatMap(m -> loginOf(m.getUserId())).orElse(null));
        out.put("consentVersion", row.map(DataShare::getConsentVersion).orElse(null));
        out.put("grantedAt", row.map(DataShare::getGrantedAt).orElse(null));
        out.put("updatedAt", row.map(DataShare::getUpdatedAt).orElse(null));
        List<Map<String, Object>> history = new ArrayList<>();
        for (DataShareEvent e : events.findByOrgIdAndMemberLoginOrderByIdAsc(orgId, memberLogin)) {
            Map<String, Object> h = new LinkedHashMap<>();
            h.put("at", e.getCreatedAt());
            h.put("from", e.getFromScope());
            h.put("to", e.getToScope());
            h.put("sharedWith", e.getFullToLogin());
            h.put("by", e.getActor());
            h.put("reason", e.getReason());
            h.put("consentVersion", e.getConsentVersion());
            history.add(h);
        }
        out.put("history", history);
        return out;
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    /** True when a seat is ACTIVE and its role may see FULL data. */
    boolean mayReceiveFull(OrgMember seat) {
        return seat.getStatus() == OrgMemberStatus.ACTIVE && seat.getRole() != null && !seat.getRole().isReserved() && seat.getRole().can(OrgPermission.MEMBER_VIEW_FULL);
    }

    private boolean fullTargetStillValid(Long orgId, Long fullToMemberId) {
        return fullToMemberId != null && members.findByOrgIdAndId(orgId, fullToMemberId).filter(this::mayReceiveFull).isPresent();
    }

    private boolean isLive(Long orgId) {
        return orgs.findByOrgId(orgId).map(Organization::getStatus).filter(LIVE::contains).isPresent();
    }

    private Optional<String> loginOf(Long userId) {
        return userId == null ? Optional.empty() : users.findById(userId).map(User::getLogin);
    }

    private void record(Long orgId, String memberLogin, ShareScope from, ShareScope to, String fullToLogin, String actor, String reason, String version, ShareContext ctx) {
        DataShareEvent e = new DataShareEvent();
        e.setOrgId(orgId);
        e.setMemberLogin(memberLogin);
        e.setFromScope(from);
        e.setToScope(to);
        e.setFullToLogin(fullToLogin);
        e.setActor(actor);
        e.setReason(reason);
        e.setConsentVersion(version);
        e.setIpHash(ctx == null ? null : ctx.ipHash());
        e.setUserAgentHash(ctx == null ? null : ctx.userAgentHash());
        e.setCreatedAt(Instant.now());
        events.save(e);
    }

    private static ShareView view(DataShare s) {
        return new ShareView(s.getScope(), s.getFullToMemberId(), s.getConsentVersion(), s.getGrantedAt(), s.getUpdatedAt());
    }
}
