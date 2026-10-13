package com.dossier.api.service.ent;

import static com.dossier.api.domain.enumeration.PermissionScope.ASSIGNED;
import static com.dossier.api.domain.enumeration.PermissionScope.ORG;
import static com.dossier.api.domain.enumeration.PermissionScope.OWN;
import static com.dossier.api.domain.enumeration.PermissionScope.TEAM;

import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.PermissionScope;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The twelve system role templates of docs/enterprise-v2/05-permission-model.md section 3, as code. This is the ONE
 * definition: {@link RoleTemplateSeeder} writes it into {@code org_role}/{@code org_role_permission} at startup, the roles
 * read API shows what is stored, and {@code RoleTemplateDocSyncTest} diffs it against the design document so neither can
 * change alone.
 *
 * <p>Equivalence with the legacy enum is a hard requirement (a member whose role is read from data must keep exactly what
 * the enum gave them): OWNER, ORG_ADMIN, STAFF, MEMBER, MARKETING_SPECIALIST and FINANCE_SPECIALIST hold every permission of
 * {@code OrgRole.OWNER/ADMIN/STAFF/MEMBER/MARKETER/FINANCE} at the scope {@link PermissionScope#fromLegacy} maps it to, with
 * the legacy narrowing kept as a ceiling or row-filter attribute ({@code RoleTemplatesTest} proves it cell by cell). Where
 * 05 section 3 says nothing about a legacy permission (ORG_ADMIN's {@code member.view_summary}, {@code services.order_for_member}
 * and {@code ops.*}; every template's {@code self.*}) it is granted so that equivalence holds; 05 was amended to say so.
 *
 * <p>Permission keys are plain strings here; {@code EntPermissions} (X1.7) is the registry that names and describes them and
 * the doc-sync test fails if a key used here is not registered. {@code departments.manage} and {@code teams.manage} are
 * aliases of {@code groups.manage} and are not stored as separate rows.
 */
public final class RoleTemplates {

    /** One permission row of a template. */
    public record Grant(String key, PermissionScope scope, String ceilingRoleKey, String rowFilter) {}

    /** One system role. {@code workspaceKey} null = the existing (school / bootcamp) flows. */
    public record Template(String key, String name, String description, String workspaceKey, List<Grant> grants) {
        public Map<String, Grant> byKey() {
            Map<String, Grant> m = new LinkedHashMap<>();
            for (Grant g : grants) m.put(g.key(), g);
            return Collections.unmodifiableMap(m);
        }
    }

    public static final String OWNER = "OWNER";
    public static final String ORG_ADMIN = "ORG_ADMIN";
    public static final String STAFF = "STAFF";
    public static final String MEMBER = "MEMBER";
    public static final String CONSULTANT = "CONSULTANT";
    public static final String MARKETING_SPECIALIST = "MARKETING_SPECIALIST";
    public static final String MARKETING_MANAGER = "MARKETING_MANAGER";
    public static final String HR_SPECIALIST = "HR_SPECIALIST";
    public static final String FINANCE_SPECIALIST = "FINANCE_SPECIALIST";
    public static final String ACCOUNT_MANAGER = "ACCOUNT_MANAGER";
    public static final String TALENT_ACQUISITION = "TALENT_ACQUISITION";
    public static final String EXECUTIVE_VIEWER = "EXECUTIVE_VIEWER";

    private static final List<Template> ALL = build();
    private static final Map<String, Template> BY_KEY;

    static {
        Map<String, Template> m = new LinkedHashMap<>();
        for (Template t : ALL) m.put(t.key(), t);
        BY_KEY = Collections.unmodifiableMap(m);
    }

    private RoleTemplates() {}

    /** The twelve templates in display order. */
    public static List<Template> all() {
        return ALL;
    }

    public static Optional<Template> find(String key) {
        return Optional.ofNullable(key == null ? null : BY_KEY.get(key));
    }

    // ---- the matrix -----------------------------------------------------------------------------------------------

    private static final class B {

        private final Map<String, Grant> grants = new LinkedHashMap<>();

        B add(PermissionScope scope, String... keys) {
            for (String k : keys) grants.put(k, new Grant(k, scope, null, null));
            return this;
        }

        B addWith(PermissionScope scope, String ceiling, String filter, String key) {
            grants.put(key, new Grant(key, scope, ceiling, filter));
            return this;
        }

        /** {@code self.*}: every member may set their own share scope and leave (the legacy rows every role has). */
        B self() {
            return add(OWN, "self.share_scope.set", "self.leave");
        }

        /** Every grant of {@code other} at {@code scope} (the "all of X at (TEAM)" rows). */
        B allOf(Template other, PermissionScope scope) {
            for (Grant g : other.grants()) {
                if (g.scope() != OWN) grants.put(g.key(), new Grant(g.key(), scope, g.ceilingRoleKey(), g.rowFilter()));
            }
            return this;
        }

        List<Grant> build() {
            return List.copyOf(new ArrayList<>(grants.values()));
        }
    }

    private static List<Template> build() {
        List<Template> out = new ArrayList<>();

        // ORG_ADMIN: "all (ORG)" in 05 section 3, plus the three legacy ADMIN permissions the row does not name.
        Template orgAdmin = new Template(
            ORG_ADMIN, "Organization Admin", "Runs the organization: settings, people, roles, licences and billing. Cannot close it or hand it over.", "ADMIN",
            new B()
                .add(ORG, "org.settings.manage", "branding.manage", "domains.manage", "roles.manage", "members.invite", "members.import")
                .addWith(ORG, OrgRolePermission.CEILING_BELOW_ADMIN, null, "members.role.set")
                .add(ORG, "members.remove", "members.suspend", "members.support_owner.set", "members.group.set", "members.manager.set",
                    "groups.manage", "assignments.manage", "consultants.view", "consultants.edit", "resumes.view_for", "resumes.approve_request",
                    "licenses.view", "licenses.manage", "billing.view", "billing.manage", "usage.view", "pipeline.view", "clients.view",
                    "placements.view", "hr.view", "finance.view", "reports.view", "reports.export", "audit.view", "integrations.manage",
                    "dashboard.view_org", "member.view_summary", "services.order_for_member", "ops.*")
                .self()
                .build()
        );

        // OWNER: ORG_ADMIN plus close and transfer, and members.role.set without the ceiling.
        B owner = new B().allOf(orgAdmin, ORG).add(ORG, "members.role.set", "org.close", "org.transfer_ownership").self();
        Template ownerT = new Template(
            OWNER, "Owner", "Everything an Organization Admin can do, plus closing the organization and handing it over. Cannot be edited.", "ADMIN", owner.build()
        );
        out.add(ownerT);
        out.add(orgAdmin);

        out.add(new Template(
            STAFF, "Staff", "Looks after a group of members in a school or bootcamp (existing flow).", null,
            new B()
                .addWith(ORG, OrgRolePermission.CEILING_MEMBER, null, "members.invite")
                .addWith(ORG, OrgRolePermission.CEILING_MEMBER, null, "members.import")
                .add(ASSIGNED, "reports.view", "member.view_summary")
                .self()
                .build()
        ));
        out.add(new Template(MEMBER, "Member", "An ordinary member of a school or bootcamp (existing flow).", null, new B().add(OWN, "ops.own_hours").self().build()));

        out.add(new Template(
            CONSULTANT, "Consultant", "A consultant: their own opportunities, applications, interviews and resumes. Submits for themselves.", "CONSULTANT",
            new B()
                .add(OWN, "opportunities.respond", "submissions.authorize", "applications.manage", "interviews.manage", "offers.respond",
                    "resumes.manage", "features.view")
                .self()
                .build()
        ));

        Template specialist = new Template(
            MARKETING_SPECIALIST, "Marketing Specialist", "Prepares and tracks applications for the consultants assigned to them. Never submits.", "MARKETING",
            new B()
                .add(ASSIGNED, "member.view_summary", "member.view_full", "member.act_for", "consultants.view", "resumes.view_for", "resumes.edit_for",
                    "opportunities.manage", "matches.run", "submissions.prepare", "submissions.record", "followups.manage", "interviews.coordinate",
                    "pipeline.view", "reports.view")
                .self()
                .build()
        );
        out.add(specialist);

        out.add(new Template(
            MARKETING_MANAGER, "Marketing Manager", "Leads a marketing team: assignments, approvals, workload and escalations.", "MARKETING_MGMT",
            new B()
                .allOf(specialist, TEAM)
                .add(TEAM, "assignments.manage", "approvals.decide", "workload.view", "escalations.manage", "reports.export", "members.manager.set")
                .self()
                .build()
        ));

        out.add(new Template(
            HR_SPECIALIST, "HR Specialist", "People operations: invitations, teams, lifecycle and HR records.", "HR",
            new B()
                .add(ORG, "members.invite", "members.suspend", "members.group.set", "members.manager.set", "hr.view", "hr.manage", "groups.manage", "lifecycle.manage")
                .addWith(ORG, null, OrgRolePermission.ROW_FILTER_HR, "reports.view")
                .self()
                .build()
        ));

        out.add(new Template(
            FINANCE_SPECIALIST, "Finance Specialist", "Billing, licences, usage and finance records. Records money, never moves it.", "FINANCE",
            new B()
                .add(ORG, "billing.view", "billing.manage", "licenses.view", "usage.view", "finance.view", "finance.manage", "placements.view", "ops.*",
                    "reports.view", "reports.export")
                .addWith(ORG, null, OrgRolePermission.ROW_FILTER_BILLING_OPS, "audit.view")
                .self()
                .build()
        ));

        out.add(new Template(
            ACCOUNT_MANAGER, "Account Manager", "Client accounts, requirements, offers and placements.", "ACCOUNTS",
            new B()
                .add(ORG, "clients.view", "clients.manage", "requirements.manage", "submissions.record", "interviews.coordinate", "offers.manage",
                    "placements.manage", "reports.view")
                .self()
                .build()
        ));

        out.add(new Template(
            TALENT_ACQUISITION, "Talent Acquisition", "Brings in candidates and consultants: invitations, talent pools and onboarding.", "HR",
            new B().add(ORG, "members.invite", "candidates.manage", "talent_pools.manage", "consultants.view", "onboarding.coordinate").self().build()
        ));

        out.add(new Template(
            EXECUTIVE_VIEWER, "Executive Viewer", "Read-only organization dashboards, aggregates and totals.", "EXEC",
            new B().add(ORG, "dashboard.view_org", "reports.view", "pipeline.view", "billing.view").self().build()
        ));

        return Collections.unmodifiableList(out);
    }
}
