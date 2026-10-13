package com.dossier.api.service.ent;

import com.dossier.api.service.dto.ent.MeTenantDTO;
import com.dossier.api.service.ent.WorkspaceDefinitions.NavDef;
import com.dossier.api.service.ent.WorkspaceDefinitions.WorkspaceDef;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.org.OrgMembership;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Computes the workspaces a member may open and the pages inside each (X2.2; 16-ui-ux-page-inventory.md sections 2.2-2.4 and 3).
 *
 * <ol>
 *   <li><b>Which workspaces are candidates:</b> the {@code workspace_key} of the member's roles (a role is the unit that says
 *       "this person works in Marketing"); a member with ORG_ADMIN and MARKETING_MANAGER has two. Holding a permission that
 *       a workspace's page happens to need does NOT make it a candidate (an admin holds {@code hr.view} and still does not get
 *       the HR workspace in the switcher).</li>
 *   <li><b>Which pages show:</b> a page is listed when its module is on and the member holds ANY of its {@code needs}, asked of
 *       {@link AuthorizationService} (the same evaluator the pages' APIs use, so the menu can never promise a page the API
 *       refuses for a reason the menu could have known). Hidden when not permitted, never greyed.</li>
 *   <li><b>Which workspaces open:</b> a candidate whose HOME page survived step 2.</li>
 *   <li><b>Per-organization navigation preferences</b> ({@code org_branding.nav_prefs_json}, published values only) hide or
 *       reorder pages inside a workspace and never add one; the home page can not be hidden. A hidden page is only absent from
 *       the menu: the URL still works and is still permission-checked.</li>
 *   <li><b>Landing:</b> the member's saved preference when it is still openable, else their primary role's workspace, else the
 *       first openable workspace; none when they have no workspace at all.</li>
 * </ol>
 *
 * Fails closed: an authorization error on a page hides the page; a malformed preference is ignored.
 */
@Service
public class WorkspaceService {

    private static final Logger LOG = LoggerFactory.getLogger(WorkspaceService.class);
    private static final TypeReference<Map<String, JsonNode>> OBJECT = new TypeReference<>() {};

    private final WorkspaceDefinitions definitions;
    private final AuthorizationService authorization;
    private final ObjectMapper mapper;

    public WorkspaceService(WorkspaceDefinitions definitions, AuthorizationService authorization, ObjectMapper mapper) {
        this.definitions = definitions;
        this.authorization = authorization;
        this.mapper = mapper;
    }

    /** One of the member's roles reduced to what workspace selection needs. {@code workspaceKey} may be null (a role with no workspace). */
    public record RoleWorkspace(String roleKey, boolean primary, String workspaceKey) {}

    /** The preferences read from published branding: hidden and ordered nav keys, and whether the dashboard greeting shows. */
    public record NavPrefs(Set<String> hidden, List<String> order, boolean greeting) {
        public static final NavPrefs NONE = new NavPrefs(Set.of(), List.of(), true);
    }

    /** What {@link #compute} answers: the openable workspaces (display order) and the stored key of the landing one, or null. */
    public record Result(List<MeTenantDTO.Workspace> workspaces, String landingKey) {
        public String landingHome() {
            if (landingKey == null) return null;
            return workspaces.stream().filter(w -> landingKey.equals(w.workspaceKey())).map(MeTenantDTO.Workspace::home).findFirst().orElse(null);
        }
    }

    /**
     * @param me         the caller's resolved membership (so no per-page database lookup)
     * @param roles      the caller's roles, with each one's workspace
     * @param modules    module wire key to on/off ({@link TenantModules#forOrg})
     * @param tenant     the tenant context of the request (step 1 of the evaluation order); null in a unit test
     * @param tokenTid   the {@code tid} claim of the caller's token; null in a unit test
     * @param prefs      published navigation preferences
     * @param landingPref the member's saved landing workspace key ({@code org_member.landing_workspace}), or null
     */
    public Result compute(
        OrgMembership me,
        List<RoleWorkspace> roles,
        Map<String, Boolean> modules,
        TenantContext tenant,
        Long tokenTid,
        NavPrefs prefs,
        String landingPref
    ) {
        Map<String, List<String>> viaRoles = new LinkedHashMap<>(); // workspace key -> role keys that grant it (primary first)
        for (RoleWorkspace r : roles) {
            if (r.workspaceKey() == null) continue;
            viaRoles.computeIfAbsent(r.workspaceKey(), k -> new ArrayList<>());
            if (r.primary()) viaRoles.get(r.workspaceKey()).add(0, r.roleKey());
            else viaRoles.get(r.workspaceKey()).add(r.roleKey());
        }
        Map<String, Boolean> decided = new HashMap<>(); // permission key -> held, for this one computation
        List<MeTenantDTO.Workspace> out = new ArrayList<>();
        for (WorkspaceDef def : definitions.all()) {
            List<String> via = viaRoles.get(def.key());
            if (via == null) continue;
            List<NavDef> visible = new ArrayList<>();
            for (NavDef item : def.nav()) {
                if (item.module() != null && !Boolean.TRUE.equals(modules.get(item.module()))) continue;
                if (!holdsAny(me, item.needs(), tenant, tokenTid, decided)) continue;
                visible.add(item);
            }
            if (visible.isEmpty() || !visible.get(0).key().equals("home")) continue; // the home page is not available: the workspace is not either
            List<NavDef> shown = applyPrefs(def, visible, prefs);
            List<String> tabs = def.bottomTabs().stream().filter(t -> shown.stream().anyMatch(n -> n.key().equals(t))).toList();
            out.add(new MeTenantDTO.Workspace(
                def.slug(), def.key(), def.label(), def.home(), def.order(), List.copyOf(via),
                shown.stream().map(n -> new MeTenantDTO.NavItem(n.key(), n.label(), n.icon(), n.href(), n.badge())).toList(), tabs
            ));
        }
        return new Result(List.copyOf(out), landing(out, roles, landingPref));
    }

    private static String landing(List<MeTenantDTO.Workspace> open, List<RoleWorkspace> roles, String pref) {
        if (open.isEmpty()) return null;
        if (pref != null && open.stream().anyMatch(w -> pref.equals(w.workspaceKey()))) return pref;
        for (RoleWorkspace r : roles) {
            if (r.primary() && r.workspaceKey() != null && open.stream().anyMatch(w -> r.workspaceKey().equals(w.workspaceKey()))) return r.workspaceKey();
        }
        return open.get(0).workspaceKey();
    }

    private boolean holdsAny(OrgMembership me, List<String> needs, TenantContext tenant, Long tokenTid, Map<String, Boolean> decided) {
        if (needs.isEmpty()) return authorization.authorize(request(me, List.of(), tenant, tokenTid)).allowed(); // any active member
        for (String key : needs) {
            Boolean known = decided.get(key);
            if (known == null) {
                boolean allowed;
                try {
                    allowed = authorization.authorize(request(me, List.of(key), tenant, tokenTid)).allowed();
                } catch (RuntimeException e) {
                    LOG.warn("navigation permission check for {} failed; hiding the page", key, e);
                    allowed = false;
                }
                decided.put(key, allowed);
                known = allowed;
            }
            if (known) return true;
        }
        return false;
    }

    private static AuthzRequest request(OrgMembership me, List<String> keys, TenantContext tenant, Long tokenTid) {
        return AuthzRequest.of(me.orgId(), keys, Beneficiary.NONE, null, AuthzOperation.READ).withActor(me).withTenant(tenant).withTokenTenant(tokenTid);
    }

    /** Hides and orders pages. Keys may be bare ({@code reports}) or qualified by workspace slug ({@code admin.reports}). */
    private static List<NavDef> applyPrefs(WorkspaceDef def, List<NavDef> visible, NavPrefs prefs) {
        if (prefs == null || (prefs.hidden().isEmpty() && prefs.order().isEmpty())) return visible;
        List<NavDef> kept = new ArrayList<>();
        for (NavDef n : visible) {
            boolean home = n.key().equals("home");
            boolean hidden = prefs.hidden().contains(n.key()) || prefs.hidden().contains(def.slug() + "." + n.key());
            if (home || !hidden) kept.add(n);
        }
        List<NavDef> ordered = new ArrayList<>();
        ordered.add(kept.get(0)); // home first, always
        Set<String> placed = new HashSet<>();
        placed.add(kept.get(0).key());
        for (String want : prefs.order()) {
            String key = want.startsWith(def.slug() + ".") ? want.substring(def.slug().length() + 1) : want;
            for (NavDef n : kept) {
                if (n.key().equals(key) && placed.add(key)) ordered.add(n);
            }
        }
        for (NavDef n : kept) if (placed.add(n.key())) ordered.add(n); // anything the order list did not mention keeps its place after the named ones
        return ordered;
    }

    /**
     * Parses {@code org_branding.nav_prefs_json}: {@code {"hidden": [...], "order": [...], "greeting": false}}. Anything that is not
     * of that shape, an unknown key, an over-long list or a key that is not a known nav key is ignored (the publish step rejects
     * these; this is the second wall for a row written by other means).
     */
    public NavPrefs parsePrefs(String json) {
        if (json == null || json.isBlank()) return NavPrefs.NONE;
        try {
            Map<String, JsonNode> root = mapper.readValue(json, OBJECT);
            Set<String> known = knownNavKeys();
            Set<String> hidden = new LinkedHashSet<>();
            List<String> order = new ArrayList<>();
            for (String k : strings(root.get("hidden"))) if (known.contains(k)) hidden.add(k);
            for (String k : strings(root.get("order"))) if (known.contains(k) && !order.contains(k)) order.add(k);
            JsonNode g = root.get("greeting");
            return new NavPrefs(Set.copyOf(hidden), List.copyOf(order), g == null || !g.isBoolean() || g.booleanValue());
        } catch (Exception e) {
            LOG.warn("An organization's nav preferences could not be read; showing the default navigation");
            return NavPrefs.NONE;
        }
    }

    private static List<String> strings(JsonNode n) {
        List<String> out = new ArrayList<>();
        if (n != null && n.isArray()) for (JsonNode e : n) if (e.isTextual() && out.size() < 200) out.add(e.textValue());
        return out;
    }

    /** Bare and workspace-qualified nav keys. */
    private Set<String> knownNavKeys() {
        Set<String> keys = new HashSet<>();
        for (WorkspaceDef w : definitions.all()) {
            for (NavDef n : w.nav()) {
                keys.add(n.key());
                keys.add(w.slug() + "." + n.key());
            }
        }
        return keys;
    }
}
