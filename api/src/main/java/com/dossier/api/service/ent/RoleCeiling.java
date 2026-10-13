package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.PermissionScope;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The ceiling rule of 05-permission-model.md section 3 as a pure function of the actor's permission rows (X1.14): the editor's
 * effective permissions must contain everything they write, scope by scope, AND at least as strict a narrowing attribute.
 *
 * <ul>
 *   <li><b>Scope:</b> a wanted (key, scope) is covered when the actor holds the key at that scope or a wider one; OWN-scoped
 *       rows (the holder's own records) are never refused.</li>
 *   <li><b>Ceiling attribute</b> ({@code ceiling_role_key}): none is the loosest, then {@code BELOW_ADMIN}, then {@code MEMBER}. A
 *       role written by an actor who holds {@code members.role.set} only with {@code BELOW_ADMIN} must carry {@code BELOW_ADMIN}
 *       (or {@code MEMBER}) on that row too; otherwise an Organization Admin could mint a role that may touch owners.</li>
 *   <li><b>Row filter:</b> an actor holding a key only through a filtered row (finance sees only billing and ops audit rows) may
 *       write that key only with the same filter.</li>
 * </ul>
 *
 * Several covering rows (the actor holds the key through several roles) are alternatives: it is enough that one of them covers
 * the wanted row completely. An unknown attribute value on the actor's side never loosens anything (it ranks as the strictest).
 */
public final class RoleCeiling {

    /** One permission row, detached from persistence. */
    public record Row(String key, PermissionScope scope, String ceilingRoleKey, String rowFilter) {
        public static Row of(OrgRolePermission p) {
            return new Row(p.getPermissionKey(), p.getScope(), p.getCeilingRoleKey(), p.getRowFilter());
        }
    }

    private final Map<String, List<Row>> held = new LinkedHashMap<>();
    private boolean unlimited;

    private RoleCeiling() {}

    /**
     * The Owner's ceiling: nobody in the organization may hold more than the Owner, so an actor who holds the system OWNER role is
     * bounded by nothing but the other guards (last admin, no self change, system roles immutable). Without this the Owner could not
     * hand out the marketing, consultant or client roles, whose keys the OWNER template does not list (05 section 3 gives OWNER the
     * ORG_ADMIN set plus close and transfer).
     */
    public static RoleCeiling unlimited(Collection<OrgRolePermission> actorRows) {
        RoleCeiling c = of(actorRows);
        c.unlimited = true;
        return c;
    }

    public static RoleCeiling of(Collection<OrgRolePermission> actorRows) {
        RoleCeiling c = new RoleCeiling();
        for (OrgRolePermission p : actorRows) {
            if (p.getPermissionKey() == null || p.getScope() == null) continue; // a malformed row grants nothing
            c.held.computeIfAbsent(p.getPermissionKey(), k -> new ArrayList<>()).add(Row.of(p));
        }
        return c;
    }

    /** none = 3 (loosest), BELOW_ADMIN = 2, MEMBER = 1, anything else = 0 (strictest). */
    public static int rank(String ceiling) {
        if (ceiling == null) return 3;
        return switch (ceiling) {
            case OrgRolePermission.CEILING_BELOW_ADMIN -> 2;
            case OrgRolePermission.CEILING_MEMBER -> 1;
            default -> 0;
        };
    }

    public static boolean knownCeiling(String ceiling) {
        return ceiling == null || ceiling.equals(OrgRolePermission.CEILING_BELOW_ADMIN) || ceiling.equals(OrgRolePermission.CEILING_MEMBER);
    }

    public static boolean knownRowFilter(String filter) {
        return filter == null || filter.equals(OrgRolePermission.ROW_FILTER_BILLING_OPS) || filter.equals(OrgRolePermission.ROW_FILTER_HR);
    }

    /** True when the actor may write {@code wanted}. */
    public boolean allows(Row wanted) {
        if (unlimited) return true;
        // OWN rows act only on the holder's own records (a consultant's own resumes, applications, hours, leaving the organization):
        // handing them out widens nothing over anyone else, so an administrator need not hold them to give them (the Owner could
        // otherwise not even assign CONSULTANT). Every wider scope needs the actor to hold it.
        if (wanted.scope() == PermissionScope.OWN) return true;
        for (Row h : held.getOrDefault(wanted.key(), List.of())) {
            if (!h.scope().covers(wanted.scope())) continue;
            if (rank(h.ceilingRoleKey()) < rank(wanted.ceilingRoleKey())) continue;
            if (h.rowFilter() != null && !h.rowFilter().equals(wanted.rowFilter())) continue;
            return true;
        }
        return false;
    }

    /** The first of {@code wanted} the actor may not write, in order. */
    public Optional<Row> firstViolation(Collection<Row> wanted) {
        for (Row r : wanted) if (!allows(r)) return Optional.of(r);
        return Optional.empty();
    }

    /** The widest scope the actor holds {@code key} at, if any. */
    public Optional<PermissionScope> scopeOf(String key) {
        PermissionScope best = null;
        for (Row h : held.getOrDefault(key, List.of())) best = PermissionScope.widest(best, h.scope());
        return Optional.ofNullable(best);
    }

    /** The loosest ceiling attribute rank among the actor's rows for {@code key} (0 when they hold none). */
    public int ceilingRank(String key) {
        if (unlimited) return 3;
        int best = 0;
        for (Row h : held.getOrDefault(key, List.of())) best = Math.max(best, rank(h.ceilingRoleKey()));
        return best;
    }
}
