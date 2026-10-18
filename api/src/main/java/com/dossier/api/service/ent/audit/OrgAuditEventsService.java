package com.dossier.api.service.ent.audit;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.export.CsvSafe;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.ent.dashboard.ActivityRecentProvider;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The organization audit log page (D9, 2026-10-16 audit): a read-only, filterable, paged list of the organization's own {@code org_audit_event} rows,
 * newest first. Who did what to whom and when; free-text details, IP hashes and raw logins (which carry the internal {@code ent#} prefix) are never sent.
 * Gate: {@code audit.view} at ORG scope and not through a row filter (finance and HR hold narrowed grants and get the same generic 404 as a stranger), like
 * the job-data audit. Every query names the organization first.
 */
@Service
public class OrgAuditEventsService {

    public static final String PERMISSION = "audit.view";
    static final int DEFAULT_SIZE = 25;
    static final int MAX_SIZE = 100;

    public record Item(Long id, Instant at, String action, String label, String actorName, String targetType, String targetName) {}

    public record ActionOption(String action, String label) {}

    public record Response(List<Item> items, long total, int page, int size, List<ActionOption> actions) {}

    private final OrgRolePermissionRepository permissions;
    private final UserRepository users;
    private final OrgAuditService orgAudit;
    private final ResumeBuilderSettings settings;

    @PersistenceContext
    private EntityManager em;

    public OrgAuditEventsService(OrgRolePermissionRepository permissions, UserRepository users, OrgAuditService orgAudit, ResumeBuilderSettings settings) {
        this.permissions = permissions;
        this.users = users;
        this.orgAudit = orgAudit;
        this.settings = settings;
    }

    /** The CSV of the same filtered log (X4.9): newest first, capped by the admin setting, every cell formula-guarded, and the export itself audited. */
    @Transactional
    public String exportCsv(OrgMembership me, String action, Instant from, Instant to) {
        requireAuditor(me);
        Long orgId = me.orgId();
        if (from != null && to != null && !from.isBefore(to)) throw OrgException.coded(400, "VALIDATION", "from: must be before to", Map.of("field", "from"));
        String act = action == null || action.isBlank() ? null : action.trim();
        if (act != null && !act.matches("[A-Z0-9_]{1,100}")) throw OrgException.coded(400, "VALIDATION", "action: an action key", Map.of("field", "action"));
        Instant lo = from == null ? Instant.EPOCH : from;
        Instant hi = to == null ? Instant.parse("9999-01-01T00:00:00Z") : to;
        int max = settings.getInt(EnterpriseSettingKeys.ORG_AUDIT_EXPORT_MAX_ROWS);
        String where = "e.orgId = :o and e.createdAt >= :lo and e.createdAt < :hi" + (act == null ? "" : " and e.action = :a");
        var rows = em.createQuery("select e from OrgAuditEvent e where " + where + " order by e.createdAt desc, e.id desc", OrgAuditEvent.class).setParameter("o", orgId).setParameter("lo", lo).setParameter("hi", hi);
        if (act != null) rows.setParameter("a", act);
        List<OrgAuditEvent> found = rows.setMaxResults(max + 1).getResultList();
        boolean cut = found.size() > max;
        if (cut) found = found.subList(0, max);
        Set<String> logins = new HashSet<>();
        for (OrgAuditEvent e : found) {
            logins.add(e.getActorLogin());
            if (e.getTargetLogin() != null) logins.add(e.getTargetLogin());
        }
        Map<String, String> names = new HashMap<>();
        if (!logins.isEmpty()) for (User u : users.findAllByLoginIn(logins)) names.put(u.getLogin(), displayName(u));
        StringBuilder sb = new StringBuilder(CsvSafe.row("When (UTC)", "Action", "What happened", "Who", "Target type", "Target"));
        for (OrgAuditEvent e : found) {
            sb.append(CsvSafe.row(e.getCreatedAt(), e.getAction(), ActivityRecentProvider.label(e), nameOf(names, e.getActorLogin()), e.getTargetType(), e.getTargetLogin() == null ? "" : nameOf(names, e.getTargetLogin())));
        }
        if (cut) sb.append(CsvSafe.row("The export stops at " + max + " rows. Narrow the dates or the action to see more."));
        orgAudit.record(me, OrgAuditService.EXPORT, "AUDIT_LOG", null, orgId.toString(), found.size() + " rows" + (cut ? ", cut at " + max : ""));
        return sb.toString();
    }

    @Transactional(readOnly = true)
    public Response list(OrgMembership me, String action, Instant from, Instant to, Integer page, Integer size) {
        requireAuditor(me);
        Long orgId = me.orgId();
        int p = page == null ? 0 : page;
        int s = size == null ? DEFAULT_SIZE : size;
        if (p < 0) throw OrgException.coded(400, "VALIDATION", "page: from 0", Map.of("field", "page"));
        if (s < 1 || s > MAX_SIZE) throw OrgException.coded(400, "VALIDATION", "size: 1 to " + MAX_SIZE, Map.of("field", "size"));
        if (from != null && to != null && !from.isBefore(to)) throw OrgException.coded(400, "VALIDATION", "from: must be before to", Map.of("field", "from"));
        String act = action == null || action.isBlank() ? null : action.trim();
        if (act != null && !act.matches("[A-Z0-9_]{1,100}")) throw OrgException.coded(400, "VALIDATION", "action: an action key", Map.of("field", "action"));
        Instant lo = from == null ? Instant.EPOCH : from;
        Instant hi = to == null ? Instant.parse("9999-01-01T00:00:00Z") : to;

        String where = "e.orgId = :o and e.createdAt >= :lo and e.createdAt < :hi" + (act == null ? "" : " and e.action = :a");
        var count = em.createQuery("select count(e) from OrgAuditEvent e where " + where, Long.class).setParameter("o", orgId).setParameter("lo", lo).setParameter("hi", hi);
        var rows = em.createQuery("select e from OrgAuditEvent e where " + where + " order by e.createdAt desc, e.id desc", OrgAuditEvent.class).setParameter("o", orgId).setParameter("lo", lo).setParameter("hi", hi);
        if (act != null) {
            count.setParameter("a", act);
            rows.setParameter("a", act);
        }
        long total = count.getSingleResult();
        List<OrgAuditEvent> found = rows.setFirstResult(p * s).setMaxResults(s).getResultList();

        Set<String> logins = new HashSet<>();
        for (OrgAuditEvent e : found) {
            logins.add(e.getActorLogin());
            if (e.getTargetLogin() != null) logins.add(e.getTargetLogin());
        }
        Map<String, String> names = new HashMap<>();
        if (!logins.isEmpty()) for (User u : users.findAllByLoginIn(logins)) names.put(u.getLogin(), displayName(u));
        List<Item> items = found
            .stream()
            .map(e -> new Item(e.getId(), e.getCreatedAt(), e.getAction(), ActivityRecentProvider.label(e), nameOf(names, e.getActorLogin()), e.getTargetType(), e.getTargetLogin() == null ? null : nameOf(names, e.getTargetLogin())))
            .toList();

        List<String> kinds = em.createQuery("select distinct e.action from OrgAuditEvent e where e.orgId = :o order by e.action", String.class).setParameter("o", orgId).setMaxResults(200).getResultList();
        List<ActionOption> options = kinds
            .stream()
            .map(k -> {
                OrgAuditEvent probe = new OrgAuditEvent();
                probe.setAction(k);
                return new ActionOption(k, ActivityRecentProvider.label(probe));
            })
            .toList();
        return new Response(items, total, p, s, options);
    }

    private static String nameOf(Map<String, String> names, String login) {
        String n = login == null ? null : names.get(login);
        return n == null || n.isBlank() ? "Team member" : n;
    }

    private static String displayName(User u) {
        String first = u.getFirstName() == null ? "" : u.getFirstName().trim();
        String last = u.getLastName() == null ? "" : u.getLastName().trim();
        String full = (first + " " + last).trim();
        return full.isEmpty() ? null : full;
    }

    /** ORG scope of {@code audit.view}, and at least one role that grants it unfiltered (or the legacy whole grant). Anything else is the generic 404. */
    void requireAuditor(OrgMembership me) {
        if (me == null) throw new OrgNotFoundException();
        PermissionScope scope = me.scopeFor(PERMISSION).orElseThrow(OrgNotFoundException::new);
        if (scope != PermissionScope.ORG) throw new OrgNotFoundException();
        List<Long> roleIds = me.roles().stream().map(OrgMembership.RoleRef::roleId).filter(Objects::nonNull).toList();
        if (roleIds.isEmpty()) return;
        boolean granted = false;
        for (OrgRolePermission p : permissions.findForRoles(me.orgId(), roleIds)) {
            if (!PERMISSION.equals(p.getPermissionKey())) continue;
            if (p.getRowFilter() == null) return;
            granted = true;
        }
        if (granted) throw new OrgNotFoundException();
    }
}
