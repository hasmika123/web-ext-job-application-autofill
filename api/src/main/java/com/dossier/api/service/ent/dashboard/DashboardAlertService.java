package com.dossier.api.service.ent.dashboard;

import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.ent.OrgMemberDismissal;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.ent.OrgMemberDismissalRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.dto.ent.DashboardDTO.Alert;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The dashboard's alerts (14-organization-administration.md section 2.3): each is computed from a real condition, carries the
 * permission that lets someone act on it and a deep link, and can be dismissed for 7 days by the member who dismissed it (other
 * administrators still see it). An alert is shown only to a member who holds its permission at ORG scope: the conditions are
 * about the whole organization, so a narrower scope sees none of them rather than a partial picture.
 */
@Service
public class DashboardAlertService {

    public static final Duration DISMISS_FOR = Duration.ofDays(7);
    static final Duration BRANDING_DRAFT_STALE_AFTER = Duration.ofHours(24);
    static final Duration INVITE_EXPIRY_WINDOW = Duration.ofHours(48);

    /** One alert kind: its key, severity, the permission that lets the caller see and act on it, and where it leads. */
    record Kind(String key, String severity, String permission, String href) {}

    /** The alerts, most severe first. The keys are also the only values the dismiss route accepts. */
    static final List<Kind> KINDS = List.of(
        new Kind("ORG_PAST_DUE", "danger", "billing.view", "/w/admin/billing"),
        new Kind("DOMAIN_FAILING", "warn", "domains.manage", "/w/admin/domains"),
        new Kind("DOMAIN_SUSPENDED", "warn", "domains.manage", "/w/admin/domains"),
        new Kind("INVITES_EXPIRING", "info", "members.invite", "/w/admin/employees?status=invited"),
        new Kind("MEMBERS_SUSPENDED", "info", "members.suspend", "/w/admin/employees?status=suspended"),
        new Kind("SINGLE_ADMIN", "info", "members.role.set", "/w/admin/employees"),
        new Kind("BRANDING_DRAFT", "info", "branding.manage", "/w/admin/branding"),
        // the talent conditions of the board's Activity & Alerts card (talent-foundation.md section 5)
        new Kind("APPLICATIONS_OVERDUE", "warn", "pipeline.view", "/w/admin/applications"),
        new Kind("LICENSES_ATTENTION", "warn", "licenses.view", "/w/admin/licenses"),
        new Kind("MARKETERS_OVERLOADED", "warn", "workload.view", "/w/admin/marketing-assignments"),
        new Kind("APPLICATIONS_NEW", "info", "pipeline.view", "/w/admin/applications"),
        new Kind("INTERVIEWS_WEEK", "info", "pipeline.view", "/w/admin/interviews"),
        new Kind("PLACEMENT_NEW", "info", "placements.view", "/w/admin/placements"),
        new Kind("RESUMES_PENDING", "info", "resumes.view_for", "/w/admin/resumes"),
        new Kind("CONSULTANTS_UNASSIGNED", "info", "assignments.manage", "/w/admin/marketing-assignments")
    );

    static final Duration RECENT = Duration.ofDays(7);
    static final int OVERLOAD_PCT = 90; // TalentDemoSeeder.OVERLOAD_PCT: a marketer at 90 % of capacity or more

    public static final Set<String> KEYS = KINDS.stream().map(Kind::key).collect(java.util.stream.Collectors.toUnmodifiableSet());

    private final OrganizationRepository orgs;
    private final OrgHostnameRepository hostnames;
    private final OrgBrandingRepository brandings;
    private final OrgMemberDismissalRepository dismissals;

    public DashboardAlertService(OrganizationRepository orgs, OrgHostnameRepository hostnames, OrgBrandingRepository brandings, OrgMemberDismissalRepository dismissals) {
        this.orgs = orgs;
        this.hostnames = hostnames;
        this.brandings = brandings;
        this.dismissals = dismissals;
    }

    /** Every permission an alert can need: the {@code alerts} widget is omitted for a caller who holds none of them. */
    static List<String> permissions() {
        return KINDS.stream().map(Kind::permission).distinct().toList();
    }

    /** The alerts that hold right now and that the caller may see and has not dismissed. */
    @Transactional(readOnly = true)
    public List<Alert> alerts(DashboardContext ctx) {
        Set<String> hidden = new HashSet<>(ctx.repo().activeDismissalKeys(ctx.orgId(), ctx.me().memberId(), ctx.now()));
        Map<String, Alert> found = new LinkedHashMap<>();
        for (Kind kind : KINDS) {
            if (hidden.contains(kind.key())) continue;
            if (ctx.me().scopeFor(kind.permission()).filter(s -> s == PermissionScope.ORG).isEmpty()) continue;
            Alert alert = evaluate(kind, ctx);
            if (alert != null) found.put(kind.key(), alert);
        }
        List<Alert> out = new ArrayList<>(found.values());
        out.sort(Comparator.comparingInt(a -> severityRank(a.severity()))); // stable: the table order breaks ties
        return out;
    }

    private Alert evaluate(Kind kind, DashboardContext ctx) {
        Long orgId = ctx.orgId();
        switch (kind.key()) {
            case "ORG_PAST_DUE": {
                Organization org = orgs.findByOrgId(orgId).orElse(null);
                if (org == null || org.getStatus() != OrgStatus.PAST_DUE) return null;
                return alert(kind, "Payment is past due", "Update the payment details to keep the workspace active.", 1);
            }
            case "DOMAIN_FAILING": {
                long n = ctx.repo().countActiveHostnamesWithFailedCertificate(orgId);
                return n == 0 ? null : alert(kind, "A domain's certificate failed", n + (n == 1 ? " domain needs attention." : " domains need attention."), n);
            }
            case "DOMAIN_SUSPENDED": {
                long n = hostnames.countByOrgIdAndStatus(orgId, OrgHostnameStatus.SUSPENDED);
                return n == 0 ? null : alert(kind, "A domain is suspended", n + (n == 1 ? " domain is not serving sign-ins." : " domains are not serving sign-ins."), n);
            }
            case "INVITES_EXPIRING": {
                Instant soon = ctx.now().plus(INVITE_EXPIRY_WINDOW);
                long n = ctx
                    .seats()
                    .stream()
                    .filter(s -> s.status() == OrgMemberStatus.INVITED && s.inviteExpiresAt() != null && s.inviteExpiresAt().isAfter(ctx.now()) && !s.inviteExpiresAt().isAfter(soon))
                    .count();
                return n == 0 ? null : alert(kind, "Invitations are about to expire", n + (n == 1 ? " invitation expires" : " invitations expire") + " within 48 hours.", n);
            }
            case "MEMBERS_SUSPENDED": {
                long n = ctx.seats().stream().filter(s -> s.status() == OrgMemberStatus.SUSPENDED).count();
                return n == 0 ? null : alert(kind, "Suspended members", n + (n == 1 ? " member is suspended." : " members are suspended."), n);
            }
            case "SINGLE_ADMIN": {
                long n = ctx.repo().countActiveAdmins(orgId);
                return n != 1 ? null : alert(kind, "Only one administrator", "Add a second administrator so the workspace is never locked out.", 1);
            }
            case "BRANDING_DRAFT": {
                OrgBranding b = brandings.findByOrgId(orgId).orElse(null);
                if (b == null || b.getDraftJson() == null || b.getDraftUpdatedAt() == null) return null;
                if (b.getDraftUpdatedAt().isAfter(ctx.now().minus(BRANDING_DRAFT_STALE_AFTER))) return null;
                return alert(kind, "Unpublished branding changes", "Your branding draft has not been published for over a day.", 1);
            }
            case "APPLICATIONS_OVERDUE": {
                long n = ctx.repo().countOverdueApplications(orgId, TalentTiles.day(ctx.now()));
                return n == 0 ? null : alert(kind, n + (n == 1 ? " application is overdue" : " applications are overdue"), "Their next action is past its due date.", n);
            }
            case "LICENSES_ATTENTION": {
                long n = ctx.repo().countLicensesNeedingAttention(orgId);
                return n == 0 ? null : alert(kind, n + (n == 1 ? " consultant license needs attention" : " consultant licenses need attention"), "Expiring or waiting for review.", n);
            }
            case "MARKETERS_OVERLOADED": {
                long n = ctx.repo().countOverloadedMarketers(orgId, OVERLOAD_PCT);
                return n == 0 ? null : alert(kind, n + (n == 1 ? " marketer is near capacity" : " marketers are near capacity"), "At " + OVERLOAD_PCT + "% of their consultant limit or more.", n);
            }
            case "APPLICATIONS_NEW": {
                Instant since = ctx.now().minus(RECENT);
                long n = ctx.repo().countApplicationsCreatedSince(orgId, since);
                return n == 0 ? null : alert(kind, n + (n == 1 ? " new application received" : " new applications received"), "In the last 7 days.", n, ctx.repo().newestApplicationCreatedSince(orgId, since));
            }
            case "INTERVIEWS_WEEK": {
                long n = ctx.repo().countInterviews(orgId, ctx.now(), ctx.now().plus(RECENT), List.of("SCHEDULED"));
                if (n == 0) return null;
                long clients = ctx.repo().countInterviewClients(orgId, ctx.now(), ctx.now().plus(RECENT));
                return alert(kind, n + (n == 1 ? " interview scheduled this week" : " interviews scheduled this week"), "Across " + clients + (clients == 1 ? " client." : " clients."), n);
            }
            case "PLACEMENT_NEW": {
                java.time.LocalDate from = TalentTiles.day(ctx.now().minus(RECENT));
                long n = ctx.repo().countPlacementsStarted(orgId, from, TalentTiles.day(ctx.now()));
                return n == 0 ? null : alert(kind, n + (n == 1 ? " new placement started" : " new placements started"), "In the last 7 days.", n, ctx.repo().newestPlacementStartedSince(orgId, from));
            }
            case "RESUMES_PENDING": {
                long n = ctx.repo().countResumesPendingApproval(orgId);
                return n == 0 ? null : alert(kind, n + (n == 1 ? " resume needs approval" : " resumes need approval"), "Waiting for a decision.", n);
            }
            case "CONSULTANTS_UNASSIGNED": {
                long n = ctx.repo().countUnassignedConsultants(orgId);
                return n == 0 ? null : alert(kind, n + (n == 1 ? " consultant has no marketer" : " consultants have no marketer"), "Assign a marketer so they are worked on.", n);
            }
            default:
                return null;
        }
    }

    private static Alert alert(Kind kind, String title, String message, long count, Instant at) {
        return new Alert(kind.key(), kind.severity(), title, message, kind.href(), count, at);
    }

    private static Alert alert(Kind kind, String title, String message, long count) {
        return new Alert(kind.key(), kind.severity(), title, message, kind.href(), count);
    }

    private static int severityRank(String severity) {
        return switch (severity) {
            case "danger" -> 0;
            case "warn" -> 1;
            default -> 2;
        };
    }

    /** Hides {@code key} for this member for 7 days (moves the date when it is already hidden). Returns when it comes back. */
    @Transactional
    public Instant dismiss(Long orgId, Long memberId, String key, Instant now) {
        Instant until = now.plus(DISMISS_FOR);
        OrgMemberDismissal row = dismissals.find(orgId, memberId, key).orElseGet(() -> new OrgMemberDismissal(orgId, memberId, key, until));
        row.setUntilAt(until);
        dismissals.save(row);
        return until;
    }
}
