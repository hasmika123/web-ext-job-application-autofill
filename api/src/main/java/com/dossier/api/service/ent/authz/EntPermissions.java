package com.dossier.api.service.ent.authz;

import static com.dossier.api.domain.enumeration.PermissionScope.ASSIGNED;
import static com.dossier.api.domain.enumeration.PermissionScope.ORG;
import static com.dossier.api.domain.enumeration.PermissionScope.OWN;
import static com.dossier.api.domain.enumeration.PermissionScope.TEAM;

import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.PermissionScope;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The one registry of permission keys (05-permission-model.md section 6): constants and metadata (family, description, the scope
 * the key is usually granted at, whether it is dangerous, and which kind of assignment an act-for use of it needs), so the Roles
 * and Permissions admin page is generated from code and every other class refers to a key by name, not by string. The legacy
 * {@code OrgPermission} enum stays the type-safe way for the original 25 keys (they are all registered here, and a test fails if
 * one is missing); the keys introduced by Enterprise V2 exist only as strings.
 *
 * <p>{@code EntPermissionsDocSyncTest} diffs it against 05 section 3 / 3.1 and {@code RoleTemplates}: a key a template grants that
 * is not registered, a key the document names that is not registered, and a registered key nothing grants all fail the build.
 * {@code departments.manage} and {@code teams.manage} are aliases of {@code groups.manage}: one row, one key on the Roles page.
 *
 * <p>The "dangerous" flag marks the keys the Roles page shows with a warning and X4 audits at HIGH risk. {@code actingKinds} is
 * what step 9 of the evaluation order checks for a key that acts for another person: PRIMARY / BACKUP / DELEGATE for the
 * marketer's act-for keys, MANAGER for approvals.
 */
public final class EntPermissions {

    /** One registered key. */
    public record Def(String key, String family, String description, PermissionScope defaultScope, boolean dangerous, Set<AssignmentKind> actingKinds) {
        public boolean actsFor() {
            return !actingKinds.isEmpty();
        }
    }

    private static final Set<AssignmentKind> NOT_ACTING = Set.of();
    private static final Set<AssignmentKind> ACTING = AssignmentKind.ACTING;
    private static final Set<AssignmentKind> MANAGER = Set.of(AssignmentKind.MANAGER);

    /** Alias key to the canonical key (the Roles page shows one row). */
    private static final Map<String, String> ALIASES = Map.of("departments.manage", "groups.manage", "teams.manage", "groups.manage");

    private static final Map<String, Def> BY_KEY;

    static {
        List<Def> d = new ArrayList<>();
        // ---- the original 25 (OrgPermission) -------------------------------------------------------------------
        d.add(def("org.settings.manage", "org", "Change the organization's name, address and settings.", ORG, false));
        d.add(def("org.close", "org", "Close the organization.", ORG, true));
        d.add(def("org.transfer_ownership", "org", "Hand the organization over to another owner.", ORG, true));
        d.add(def("members.invite", "members", "Invite people to the organization.", ORG, false));
        d.add(def("members.import", "members", "Import people from a file.", ORG, false));
        d.add(def("members.role.set", "members", "Change the roles of members.", ORG, true));
        d.add(def("members.remove", "members", "Remove members.", ORG, true));
        d.add(def("members.suspend", "members", "Suspend and reinstate members.", ORG, true));
        d.add(def("members.support_owner.set", "members", "Choose who looks after a member (school and bootcamp flow).", ORG, false));
        d.add(def("groups.manage", "groups", "Create and edit departments, teams and cohorts.", ORG, false));
        d.add(def("assignments.manage", "assignments", "Assign marketers to consultants and reassign them.", ORG, false));
        d.add(def("billing.view", "billing", "See subscription, invoices and totals.", ORG, false));
        d.add(def("billing.manage", "billing", "Change the subscription and payment details.", ORG, true));
        d.add(def("reports.view", "reports", "See reports.", ORG, false));
        d.add(def("reports.export", "reports", "Export reports.", ORG, true));
        d.add(def("member.view_summary", "member", "See a member's summary (what they chose to share).", ASSIGNED, false));
        d.add(def("member.view_full", "member", "See a member's full details, only when they named you.", ASSIGNED, true));
        d.add(def("member.act_for", "member", "Prepare work on a member's behalf. Never submits.", ASSIGNED, true, ACTING));
        d.add(def("services.order_for_member", "services", "Order a paid service for a member.", ORG, false));
        d.add(def("audit.view", "audit", "Read the organization's audit trail.", ORG, false));
        d.add(def("integrations.manage", "integrations", "Manage integrations and webhooks.", ORG, true));
        d.add(def("ops.*", "ops", "Timesheets and finances.", ORG, false));
        d.add(def("ops.own_hours", "ops", "Your own hours.", OWN, false));
        d.add(def("self.share_scope.set", "self", "Choose what the organization may see of you.", OWN, false));
        d.add(def("self.leave", "self", "Leave the organization.", OWN, false));

        // ---- Enterprise V2 (05 section 3 and 3.1) ---------------------------------------------------------------
        d.add(def("members.group.set", "members", "Put members in departments and teams.", ORG, false));
        d.add(def("members.manager.set", "members", "Set a member's reporting manager.", ORG, false));
        d.add(def("branding.manage", "org", "Change the logo, colors and sign-in page.", ORG, false));
        d.add(def("domains.manage", "org", "Add and verify the organization's own domain.", ORG, true));
        d.add(def("roles.manage", "roles", "Create and change roles and their permissions.", ORG, true));
        d.add(def("dashboard.view_org", "dashboard", "See the organization dashboard.", ORG, false));
        d.add(def("consultants.view", "consultants", "See consultants and their marketing status.", ASSIGNED, false));
        d.add(def("consultants.edit", "consultants", "Edit a consultant's availability and marketing details.", ORG, false));
        d.add(def("resumes.view_for", "resumes", "See a consultant's resumes.", ASSIGNED, false));
        d.add(def("resumes.edit_for", "resumes", "Edit a consultant's resumes, only with their consent.", ASSIGNED, true, ACTING));
        d.add(def("resumes.approve_request", "resumes", "Approve resume changes requested for a consultant.", ORG, false));
        d.add(def("resumes.manage", "resumes", "Manage your own resumes.", OWN, false));
        d.add(def("licenses.view", "licenses", "See consultant licences.", ORG, false));
        d.add(def("licenses.manage", "licenses", "Add, change and remove consultant licences.", ORG, true));
        d.add(def("usage.view", "licenses", "See feature usage.", ORG, false));
        d.add(def("features.view", "licenses", "See which features you have.", OWN, false));
        d.add(def("pipeline.view", "pipeline", "See the application pipeline.", ASSIGNED, false));
        d.add(def("opportunities.manage", "pipeline", "Find and manage opportunities for consultants.", ASSIGNED, false, ACTING));
        d.add(def("opportunities.respond", "pipeline", "Respond to opportunities sent to you.", OWN, false));
        d.add(def("matches.run", "pipeline", "Run job matching for consultants.", ASSIGNED, false, ACTING));
        d.add(def("submissions.prepare", "pipeline", "Prepare an application for a consultant to submit. Never submits.", ASSIGNED, false, ACTING));
        d.add(def("submissions.record", "pipeline", "Record that a consultant submitted an application.", ASSIGNED, false, ACTING));
        d.add(def("submissions.authorize", "pipeline", "Authorize a submission made for you.", OWN, false));
        d.add(def("followups.manage", "pipeline", "Manage follow-ups with employers.", ASSIGNED, false, ACTING));
        d.add(def("applications.manage", "pipeline", "Manage your own applications.", OWN, false));
        d.add(def("interviews.coordinate", "pipeline", "Schedule and track interviews for consultants.", ASSIGNED, false, ACTING));
        d.add(def("interviews.manage", "pipeline", "Manage your own interviews.", OWN, false));
        d.add(def("offers.manage", "pipeline", "Record and track offers.", ORG, false));
        d.add(def("offers.respond", "pipeline", "Respond to your own offers.", OWN, false));
        d.add(def("approvals.decide", "pipeline", "Approve or decline requests from your marketing team.", TEAM, false, MANAGER));
        d.add(def("workload.view", "pipeline", "See marketer workload.", TEAM, false));
        d.add(def("escalations.manage", "pipeline", "Handle escalations.", TEAM, false));
        d.add(def("clients.view", "clients", "See client accounts.", ORG, false));
        d.add(def("clients.manage", "clients", "Manage client accounts and contacts.", ORG, false));
        d.add(def("requirements.manage", "clients", "Manage client requirements.", ORG, false));
        d.add(def("placements.view", "placements", "See placements.", ORG, false));
        d.add(def("placements.manage", "placements", "Manage placements.", ORG, false));
        d.add(def("hr.view", "hr", "See HR records.", ORG, false));
        d.add(def("hr.manage", "hr", "Manage HR records.", ORG, true));
        d.add(def("lifecycle.manage", "hr", "Run the employee lifecycle (onboarding, offboarding).", ORG, true));
        d.add(def("finance.view", "finance", "See finance records.", ORG, false));
        d.add(def("finance.manage", "finance", "Manage finance records. Records money, never moves it.", ORG, true));
        d.add(def("candidates.manage", "talent", "Manage candidates.", ORG, false));
        d.add(def("talent_pools.manage", "talent", "Manage talent pools.", ORG, false));
        d.add(def("onboarding.coordinate", "talent", "Coordinate onboarding of new consultants.", ORG, false));

        Map<String, Def> m = new LinkedHashMap<>();
        for (Def def : d) {
            if (m.put(def.key(), def) != null) throw new IllegalStateException("duplicate permission key " + def.key());
            if (ALIASES.containsKey(def.key())) throw new IllegalStateException("an alias must not also be a key: " + def.key());
        }
        for (String canonical : ALIASES.values()) {
            if (!m.containsKey(canonical)) throw new IllegalStateException("alias target is not registered: " + canonical);
        }
        BY_KEY = Collections.unmodifiableMap(m);
    }

    private EntPermissions() {}

    private static Def def(String key, String family, String description, PermissionScope scope, boolean dangerous) {
        return new Def(key, family, description, scope, dangerous, NOT_ACTING);
    }

    private static Def def(String key, String family, String description, PermissionScope scope, boolean dangerous, Set<AssignmentKind> acting) {
        return new Def(key, family, description, scope, dangerous, Set.copyOf(acting));
    }

    /** Every registered key, in registration order (the legacy 25 first). */
    public static List<Def> all() {
        return List.copyOf(BY_KEY.values());
    }

    /** The definition of a key; an alias resolves to its canonical key's definition. Empty for anything not registered. */
    public static Optional<Def> find(String key) {
        if (key == null) return Optional.empty();
        return Optional.ofNullable(BY_KEY.get(canonical(key)));
    }

    public static boolean isRegistered(String key) {
        return find(key).isPresent();
    }

    /** The key stored in role rows: an alias maps to its canonical key, any other key to itself. */
    public static String canonical(String key) {
        return key == null ? null : ALIASES.getOrDefault(key, key);
    }

    public static Map<String, String> aliases() {
        return ALIASES;
    }

    /** The assignment kinds an act-for use of {@code key} needs; empty when the key does not act for another person. */
    public static Set<AssignmentKind> actingKinds(String key) {
        return find(key).map(Def::actingKinds).orElse(Set.of());
    }
}
