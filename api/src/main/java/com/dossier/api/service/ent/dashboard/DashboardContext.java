package com.dossier.api.service.ent.dashboard;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.OrgDashboardRepository;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.org.OrgMembership;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * What one dashboard request knows, shared by its providers: the caller, the clock, the scope rules and a per-request memo so
 * that several widgets reading the seats of the organization read them once. Never reused across requests, so nothing here can
 * leak between tenants.
 */
public final class DashboardContext {

    /** One seat's dates, as stored. */
    public record Seat(Long id, OrgMemberStatus status, Instant joinedAt, Instant leftAt, Instant createdAt, Instant inviteExpiresAt) {
        /** When the seat started counting: the day they joined, or the day the row was made. */
        public Instant since() {
            return joinedAt != null ? joinedAt : createdAt;
        }

        /** Was this person an active seat at {@code t}? Uses the seat's own dates (a suspension is not dated, so it is not replayed). */
        public boolean activeAt(Instant t) {
            if (since() == null || since().isAfter(t)) return false;
            return status == OrgMemberStatus.ACTIVE || (leftAt != null && leftAt.isAfter(t));
        }
    }

    private final Long orgId;
    private final OrgMembership me;
    private final Instant now;
    private final ScopeEvaluator scopes;
    private final OrgDashboardRepository repo;
    private final Map<String, Object> memo = new HashMap<>();

    public DashboardContext(Long orgId, OrgMembership me, Instant now, ScopeEvaluator scopes, OrgDashboardRepository repo) {
        this.orgId = orgId;
        this.me = me;
        this.now = now;
        this.scopes = scopes;
        this.repo = repo;
    }

    public Long orgId() {
        return orgId;
    }

    public OrgMembership me() {
        return me;
    }

    public Instant now() {
        return now;
    }

    public OrgDashboardRepository repo() {
        return repo;
    }

    public boolean can(String permissionKey) {
        return me.canKey(permissionKey);
    }

    /** The widest scope the caller holds any of these permissions at; empty when they hold none. */
    public Optional<PermissionScope> scope(List<String> anyOf) {
        PermissionScope widest = null;
        for (String key : anyOf) widest = PermissionScope.widest(widest, me.scopeFor(key).orElse(null));
        return Optional.ofNullable(widest);
    }

    /** The subset of {@code memberIds} inside the caller's scope for these permissions (everything at ORG scope, nothing without one). */
    public Set<Long> inScope(List<String> anyOf, Collection<Long> memberIds) {
        Optional<PermissionScope> held = scope(anyOf);
        if (held.isEmpty()) return Set.of();
        if (held.get() == PermissionScope.ORG) return new HashSet<>(memberIds);
        return memberIds.stream().filter(id -> scopes.inScope(me, held.get(), id)).collect(Collectors.toCollection(HashSet::new));
    }

    /** Every seat of the organization (any status), read once per request. */
    public List<Seat> seats() {
        return memo(
            "seats",
            () ->
                repo
                    .seatFacts(orgId)
                    .stream()
                    .map(r -> new Seat((Long) r[0], (OrgMemberStatus) r[1], (Instant) r[2], (Instant) r[3], (Instant) r[4], (Instant) r[5]))
                    .toList()
        );
    }

    /** Ids of the seats that hold the consultant role, read once per request. */
    public Set<Long> consultantSeatIds() {
        return memo("consultants", () -> new HashSet<>(repo.seatIdsHoldingTemplate(orgId, RoleTemplates.CONSULTANT)));
    }

    @SuppressWarnings("unchecked")
    private <T> T memo(String key, Supplier<T> load) {
        Object cached = memo.get(key);
        if (cached == null) {
            cached = load.get();
            memo.put(key, cached);
        }
        return (T) cached;
    }
}
