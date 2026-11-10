package com.dossier.api.service.ent.dashboard;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.service.dto.ent.DashboardDTO.Activity;
import com.dossier.api.service.dto.ent.DashboardDTO.ActivityItem;
import com.dossier.api.service.org.OrgAuditService;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

/**
 * {@code activity.recent}: the last ten rows of the organization's own audit trail, newest first, for members who hold
 * {@code audit.view}. The audit permission can carry a row filter (finance sees billing and operations rows only, HR sees member
 * rows only); when every role that grants it is filtered, the feed is filtered the same way. Free-text details are never sent:
 * the page gets who, what kind of action, to whom and when.
 */
@Component
public class ActivityRecentProvider implements DashboardWidgetProvider {

    static final int LIMIT = 10;
    private static final String NONE = "~none~";

    private final OrgRolePermissionRepository permissions;
    private final UserRepository users;

    public ActivityRecentProvider(OrgRolePermissionRepository permissions, UserRepository users) {
        this.permissions = permissions;
        this.users = users;
    }

    @Override
    public String key() {
        return "activity.recent";
    }

    @Override
    public int order() {
        return 120;
    }

    @Override
    public List<String> permissions() {
        return List.of("audit.view", "pipeline.view");
    }

    @Override
    public String module() {
        return null;
    }

    @Override
    public WidgetResult compute(DashboardContext ctx) {
        List<ActivityItem> items = new ArrayList<>();
        if (ctx.can("audit.view")) items.addAll(auditItems(ctx));
        if (ctx.can("pipeline.view")) items.addAll(applicationItems(ctx));
        if (items.isEmpty()) return WidgetResult.empty("NO_ACTIVITY");
        items.sort(Comparator.comparing(ActivityItem::at).reversed());
        return WidgetResult.ok(new Activity(items.size() > LIMIT ? items.subList(0, LIMIT) : items));
    }

    private List<ActivityItem> auditItems(DashboardContext ctx) {
        Set<String> filters = rowFilters(ctx);
        PageRequest page = PageRequest.of(0, LIMIT);
        List<OrgAuditEvent> rows;
        if (filters.isEmpty()) {
            rows = ctx.repo().latestAudit(ctx.orgId(), page);
        } else {
            List<String> prefixes = new ArrayList<>();
            if (filters.contains(OrgRolePermission.ROW_FILTER_BILLING_OPS)) prefixes.addAll(List.of(OrgAuditService.PREFIX_BILLING + "%", OrgAuditService.PREFIX_OPS + "%"));
            if (filters.contains(OrgRolePermission.ROW_FILTER_HR)) prefixes.addAll(List.of("MEMBER_%", "ASSIGNMENT_%"));
            while (prefixes.size() < 4) prefixes.add(NONE);
            rows = ctx.repo().latestAuditWithPrefixes(ctx.orgId(), prefixes.get(0), prefixes.get(1), prefixes.get(2), prefixes.get(3), page);
        }
        if (rows.isEmpty()) return List.of();
        Set<String> logins = new HashSet<>();
        for (OrgAuditEvent e : rows) {
            logins.add(e.getActorLogin());
            if (e.getTargetLogin() != null) logins.add(e.getTargetLogin());
        }
        Map<String, String> names = new HashMap<>();
        for (User u : users.findAllByLoginIn(logins)) names.put(u.getLogin(), displayName(u));
        return rows
            .stream()
            .map(e ->
                new ActivityItem(
                    e.getId(),
                    e.getAction(),
                    label(e),
                    e.getActorLogin(),
                    names.get(e.getActorLogin()),
                    e.getTargetType(),
                    e.getTargetLogin(),
                    e.getTargetLogin() == null ? null : names.get(e.getTargetLogin()),
                    e.getCreatedAt()
                )
            )
            .toList();
    }

    /** The newest application events: who (the marketer, else the consultant), what, and the job it was about. Names only, no free text. */
    private List<ActivityItem> applicationItems(DashboardContext ctx) {
        List<Object[]> rows = ctx.repo().latestApplicationEvents(ctx.orgId(), PageRequest.of(0, LIMIT));
        if (rows.isEmpty()) return List.of();
        Set<Long> memberIds = new HashSet<>();
        Set<Long> consultantIds = new HashSet<>();
        Set<Long> requirementIds = new HashSet<>();
        for (Object[] r : rows) {
            if (r[4] != null) memberIds.add((Long) r[4]);
            consultantIds.add((Long) r[6]);
            requirementIds.add((Long) r[7]);
        }
        Map<Long, String> members = new HashMap<>();
        if (!memberIds.isEmpty()) {
            for (Object[] m : ctx.repo().memberNames(ctx.orgId(), memberIds)) {
                String full = ((m[1] == null ? "" : m[1].toString().trim()) + " " + (m[2] == null ? "" : m[2].toString().trim())).trim();
                members.put((Long) m[0], full.isEmpty() ? String.valueOf(m[3]) : full);
            }
        }
        Map<Long, String> consultants = new HashMap<>();
        for (Object[] c : ctx.repo().consultantNames(ctx.orgId(), consultantIds)) consultants.put((Long) c[0], String.valueOf(c[1]));
        Map<Long, String> jobs = new HashMap<>();
        for (Object[] j : ctx.repo().requirementTitles(ctx.orgId(), requirementIds)) jobs.put((Long) j[0], String.valueOf(j[1]));
        List<ActivityItem> out = new ArrayList<>();
        for (Object[] r : rows) {
            String consultant = consultants.getOrDefault((Long) r[6], "a consultant");
            String actor = r[4] == null ? null : members.get((Long) r[4]);
            String who = actor != null ? actor : consultant;
            String what = applicationLabel((String) r[1], (String) r[2], (String) r[8], actor != null ? consultant : null);
            out.add(new ActivityItem((Long) r[0], "APPLICATION_" + r[1], what, null, who, "APPLICATION", null, null, (java.time.Instant) r[3], "application", jobs.get((Long) r[7])));
        }
        return out;
    }

    /** "submitted an application for Dana Cole": the stage the event moved to, in words. {@code consultant} is null when the consultant is the actor. */
    static String applicationLabel(String eventType, String toStage, String closedReason, String consultant) {
        String of = consultant == null ? "" : " for " + consultant;
        boolean self = consultant == null;
        if ("NOTE".equals(eventType)) return "added a note" + of;
        if ("CREATED".equals(eventType)) return self ? "was matched to an application" : "created an application" + of;
        String stage = toStage == null ? "" : toStage;
        return switch (stage) {
            case "SUBMITTED" -> "submitted an application" + of;
            case "UNDER_REVIEW" -> self ? "was moved to In Review" : "moved an application to In Review" + of;
            case "INTERVIEWING" -> self ? "was moved to Interviewing" : "scheduled an interview" + of;
            case "OFFER" -> self ? "was moved to Offered" : "moved an application to Offered" + of;
            case "CLOSED" -> self
                ? "closed an application" + (closedReason == null ? "" : " (" + closedReason.toLowerCase(java.util.Locale.ROOT).replace('_', ' ') + ")")
                : "closed an application" + of + (closedReason == null ? "" : " (" + closedReason.toLowerCase(java.util.Locale.ROOT).replace('_', ' ') + ")");
            default -> "updated an application" + of;
        };
    }

    /** The row filters of the roles that grant {@code audit.view}; empty when any role grants it unfiltered (or none is recorded: the legacy grant is whole). */
    private Set<String> rowFilters(DashboardContext ctx) {
        List<Long> roleIds = ctx.me().roles().stream().map(r -> r.roleId()).filter(Objects::nonNull).toList();
        if (roleIds.isEmpty()) return Set.of();
        Set<String> filters = new HashSet<>();
        for (OrgRolePermission p : permissions.findForRoles(ctx.orgId(), roleIds)) {
            if (!"audit.view".equals(p.getPermissionKey())) continue;
            if (p.getRowFilter() == null) return Set.of();
            filters.add(p.getRowFilter());
        }
        return filters;
    }

    private static String displayName(User u) {
        String first = u.getFirstName() == null ? "" : u.getFirstName().trim();
        String last = u.getLastName() == null ? "" : u.getLastName().trim();
        String full = (first + " " + last).trim();
        return full.isEmpty() ? null : full;
    }

    /**
     * A short human label for an audit action key (no free text from the row), read after the actor's name: "Priya Sharma reassigned
     * consultants". The dashboard's Recent activity and the Audit Log (its rows, its action filter and its CSV) all use this one map.
     */
    public static String label(OrgAuditEvent e) {
        return label(e.getAction());
    }

    /** {@link #label(OrgAuditEvent)} for a bare action key. Every key gets a sentence; an unmapped key is worded from its parts, never shown raw. */
    public static String label(String action) {
        if (action == null || action.isBlank()) return "made a change";
        return switch (action) {
            case OrgAuditService.ORG_CREATE -> "created the organization";
            case OrgAuditService.ORG_SETTINGS -> "changed the organization settings";
            case OrgAuditService.ORG_CLOSE -> "closed the organization";
            case OrgAuditService.ORG_SUBDOMAIN_SET -> "set the organization's web address";
            case OrgAuditService.MEMBER_INVITE -> "invited a member";
            case OrgAuditService.MEMBER_INVITE_RESEND -> "resent an invitation";
            case OrgAuditService.MEMBER_INVITE_REVOKE -> "revoked an invitation";
            case OrgAuditService.MEMBER_INVITE_EXPIRED -> "marked an invitation expired";
            case OrgAuditService.INVITE_ROLES_TRIMMED -> "trimmed the roles on an invitation";
            case OrgAuditService.MEMBER_ACCOUNT_CREATE -> "created a member's account";
            case OrgAuditService.MEMBER_PASSWORD_RESET -> "reset a member's password";
            case OrgAuditService.MEMBER_JOIN -> "joined the organization";
            case OrgAuditService.MEMBER_ROLE -> "changed a member's role";
            case OrgAuditService.MEMBER_SUSPEND -> "suspended or reinstated a member";
            case OrgAuditService.MEMBER_REMOVE -> "removed a member";
            case OrgAuditService.MEMBER_LEFT -> "left the organization";
            case OrgAuditService.MEMBER_ERASED -> "erased a member's personal data";
            case OrgAuditService.ASSIGNMENT_CREATE -> "assigned a consultant";
            case OrgAuditService.ASSIGNMENT_END -> "ended an assignment";
            case OrgAuditService.SHARE_READ_FULL -> "opened a consultant's full shared record";
            case OrgAuditService.SHARE_SCOPE_CHANGED -> "changed what they share with the organization";
            case OrgAuditService.EXPORT -> "exported a report";
            case OrgAuditService.HISTORY_PURGED -> "purged old history";
            case OrgAuditService.MARKETER_SAVE_FOR_CONSULTANT, "MARKETER_JOB_CAPTURE" -> "saved a job for a consultant";
            case "MARKETING_BULK" -> "reassigned consultants";
            case "MARKETING_REASSIGN" -> "reassigned a consultant";
            case "MARKETING_HANDOVER" -> "handed a consultant over";
            case "MARKETING_ASSIGN" -> "assigned a consultant to a marketer";
            case "MARKETING_UNASSIGN" -> "unassigned a consultant";
            case "BILLING_PLAN_VIEW" -> "viewed the plan";
            case "CONSULTANT_PREPARE_BATCH" -> "prepared applications with Autopilot";
            case "CONSULTANT_PREPARE_SUBMIT_DETECTED" -> "submitted a prepared application";
            case "CONSULTANT_OPPORTUNITY_INTERESTED" -> "said they are interested in an opportunity";
            case "CONSULTANT_OPPORTUNITY_DECLINED" -> "declined an opportunity";
            case "CONSULTANT_OPPORTUNITY_INFO_REQUESTED" -> "asked for more information on an opportunity";
            case "CONSULTANT_OPPORTUNITY_APPLIED" -> "said they applied to an opportunity";
            case "CONSULTANT_OPPORTUNITY_VIEWED" -> "viewed an opportunity";
            case "CONSULTANT_OPPORTUNITY_REOPENED" -> "reopened an opportunity";
            case "CONSULTANT_OPPORTUNITY_LINKED" -> "linked an application to an opportunity";
            case "CONSULTANT_OPPORTUNITY_UNLINKED" -> "unlinked an application from an opportunity";
            case "BILLING_VIEW" -> "viewed billing";
            case OrgAuditService.GROUP_CREATE -> "created a department or team";
            case OrgAuditService.GROUP_UPDATE -> "changed a department or team";
            case OrgAuditService.GROUP_DELETE -> "deleted a department or team";
            case OrgAuditService.GROUP_MOVE -> "moved a team to another department";
            case OrgAuditService.GROUP_LEAD -> "changed a department or team lead";
            case OrgAuditService.LOGIN_DENIED_NOT_MEMBER -> "was refused sign-in (not a member)";
            case OrgAuditService.LOGIN_FOR_INVITE -> "signed in to accept an invitation";
            case OrgAuditService.BRANDING_PUBLISH -> "published the branding";
            case OrgAuditService.BRANDING_RESTORE -> "restored an earlier branding";
            case OrgAuditService.BRANDING_ASSET -> "changed a branding image";
            case OrgAuditService.POLICY_DRAFT_SAVE -> "saved a policy draft";
            case OrgAuditService.POLICY_TEMPLATE -> "started a policy from a template";
            case OrgAuditService.POLICY_SUBMIT -> "submitted a policy for review";
            case OrgAuditService.POLICY_WITHDRAW -> "withdrew a policy from review";
            case OrgAuditService.POLICY_APPROVE -> "approved a policy";
            case OrgAuditService.POLICY_REQUEST_CHANGES -> "asked for changes to a policy";
            case OrgAuditService.ADMIN_ORG_CREATE -> "set up the organization";
            case OrgAuditService.ADMIN_OWNER_PASSWORD_RESET -> "reset the owner's password";
            case OrgAuditService.ADMIN_SUBDOMAIN_PROVISION -> "set up the organization's web address";
            case OrgAuditService.ADMIN_ENTERPRISE_ON -> "turned enterprise features on";
            case OrgAuditService.ADMIN_ENTERPRISE_OFF -> "turned enterprise features off";
            case OrgAuditService.ADMIN_MODULE_ON -> "turned a module on";
            case OrgAuditService.ADMIN_MODULE_OFF -> "turned a module off";
            case OrgAuditService.ADMIN_HOSTNAME_SUSPEND -> "suspended a web address";
            case OrgAuditService.ADMIN_HOSTNAME_RESUME -> "resumed a web address";
            case OrgAuditService.ADMIN_ACCOUNT_MIGRATE -> "migrated an account";
            case "ROLE_CREATE" -> "created a role";
            case "ROLE_UPDATE" -> "changed a role";
            case "ROLE_DELETE" -> "deleted a role";
            case "ROLE_ASSIGN" -> "assigned a role";
            case "ROLE_REVOKE" -> "removed a role";
            default -> worded(action);
        };
    }

    private static final Map<String, String> PAST = Map.ofEntries(
        Map.entry("CREATE", "created"), Map.entry("ADD", "added"), Map.entry("UPDATE", "changed"), Map.entry("EDIT", "edited"),
        Map.entry("DELETE", "deleted"), Map.entry("REMOVE", "removed"), Map.entry("ASSIGN", "assigned"), Map.entry("UNASSIGN", "unassigned"),
        Map.entry("REASSIGN", "reassigned"), Map.entry("APPROVE", "approved"), Map.entry("REJECT", "rejected"), Map.entry("SUBMIT", "submitted"),
        Map.entry("WITHDRAW", "withdrew"), Map.entry("COMPLETE", "completed"), Map.entry("REOPEN", "reopened"), Map.entry("PAUSE", "paused"),
        Map.entry("START", "started"), Map.entry("END", "ended"), Map.entry("CLOSE", "closed"), Map.entry("VIEW", "viewed"),
        Map.entry("EXPORT", "exported"), Map.entry("RESTORE", "restored"), Map.entry("CANCEL", "canceled"), Map.entry("SCHEDULE", "scheduled"),
        Map.entry("RESCHEDULE", "rescheduled"), Map.entry("CONFIRM", "confirmed"), Map.entry("PUBLISH", "published"), Map.entry("REQUEST", "requested"),
        Map.entry("EXTEND", "extended"), Map.entry("TERMINATE", "terminated"), Map.entry("HIRE", "recorded a hire on"), Map.entry("DISMISS", "dismissed"),
        Map.entry("FLAG", "flagged"), Map.entry("NOTIFY", "sent a notice about"), Map.entry("REMIND", "sent a reminder about"), Map.entry("CAPTURE", "saved"),
        Map.entry("UNDO", "undid a change to"), Map.entry("STATUS", "changed the status of"), Map.entry("NOTE", "added a note to"),
        Map.entry("RATE", "changed the rate of"), Map.entry("BULK", "changed several"), Map.entry("OFFBOARD", "offboarded")
    );

    /** A sentence from an unmapped key's parts: MARKETER_OPPORTUNITY_ASSIGN -> "assigned an opportunity"; a key with no verb -> its words. */
    static String worded(String action) {
        List<String> parts = new ArrayList<>(List.of(action.toUpperCase(java.util.Locale.ROOT).split("_+")));
        while (parts.size() > 1 && Set.of("MKT", "MARKETER", "MARKETING", "CONSULTANT", "OPS", "ADMIN", "ORG").contains(parts.get(0))) parts.remove(0);
        String verb = parts.size() > 1 ? PAST.get(parts.get(parts.size() - 1)) : null;
        if (verb == null) return String.join(" ", parts).toLowerCase(java.util.Locale.ROOT);
        String thing = String.join(" ", parts.subList(0, parts.size() - 1)).toLowerCase(java.util.Locale.ROOT);
        String article = "aeiou".indexOf(thing.charAt(0)) >= 0 ? "an " : "a ";
        return verb + " " + article + thing;
    }
}
