package com.dossier.api.service.ent;

import com.dossier.api.service.ent.authz.EntPermissions;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * The workspace definitions as DATA (ADR-007, 16-ui-ux-page-inventory.md sections 2.2, 3 and 5): the versioned JSON resource
 * {@value #RESOURCE} says, per workspace, its home and its navigation as {@code nav -> needs-permission}. Adding or reordering a
 * page is a data change; the code only evaluates it. The file is validated when it loads and the application REFUSES TO START
 * on a bad one (an unknown permission key, an unknown module, a duplicate key, a home that is not the first item, an href
 * outside the workspace), so a typo can never turn into a menu that silently shows too much or too little.
 *
 * <p>{@code needs} is any-of: the caller sees the item when they hold at least one key, and an EMPTY list means "any member of
 * the workspace". {@code module}, when present, hides the item while the module is off. A workspace is openable when its HOME
 * item survives both checks. {@code WorkspaceDocSyncTest} diffs this file against the tables of doc 16.
 */
@Component
public class WorkspaceDefinitions {

    public static final String RESOURCE = "config/ent/workspaces.json";

    /** One page of a workspace. {@code needs} is any-of; {@code module} is a {@link TenantModule#wire()} or null. */
    public record NavDef(String key, String label, String icon, String href, List<String> needs, String module, String badge) {
        public boolean isHome(WorkspaceDef w) {
            return href.equals(w.home());
        }
    }

    /**
     * One workspace. {@code key} is the stored key ({@code ADMIN}, what a role's {@code workspace_key} holds), {@code slug} the URL
     * segment; {@code primaryFor} the system templates whose primary workspace this is (documentation, and the doc-sync test).
     */
    public record WorkspaceDef(String key, String slug, String label, int order, String home, List<String> primaryFor, List<String> bottomTabs, List<NavDef> nav) {
        public NavDef homeItem() {
            return nav.get(0);
        }
    }

    private final int version;
    private final List<WorkspaceDef> workspaces;
    private final Map<String, WorkspaceDef> byKey;

    /** Loads and validates the packaged resource. */
    public WorkspaceDefinitions() {
        this(new ObjectMapper(), RESOURCE);
    }

    /** For tests: another resource (a deliberately broken one). */
    public WorkspaceDefinitions(ObjectMapper mapper, String resource) {
        try (InputStream in = new ClassPathResource(resource).getInputStream()) {
            JsonNode root = mapper.readTree(in);
            this.version = root.path("version").asInt(0);
            this.workspaces = parse(root.path("workspaces"));
        } catch (IOException e) {
            throw new IllegalStateException("workspace definitions " + resource + " could not be read", e);
        }
        Map<String, WorkspaceDef> m = new LinkedHashMap<>();
        for (WorkspaceDef w : workspaces) m.put(w.key(), w);
        this.byKey = Collections.unmodifiableMap(m);
    }

    public int version() {
        return version;
    }

    /** Every workspace, in display order. */
    public List<WorkspaceDef> all() {
        return workspaces;
    }

    /** By stored key ({@code MARKETING_MGMT}). */
    public Optional<WorkspaceDef> find(String key) {
        return Optional.ofNullable(key == null ? null : byKey.get(key));
    }

    // ---- parsing and validation ----------------------------------------------------------------------------------

    private static List<WorkspaceDef> parse(JsonNode array) {
        if (!array.isArray() || array.isEmpty()) throw bad("workspaces must be a non-empty array");
        List<WorkspaceDef> out = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        Set<String> slugs = new HashSet<>();
        for (JsonNode w : array) {
            String key = text(w, "key");
            String slug = text(w, "slug");
            String home = text(w, "home");
            if (!keys.add(key)) throw bad("duplicate workspace key " + key);
            if (!slugs.add(slug)) throw bad("duplicate workspace slug " + slug);
            if (!home.equals("/w/" + slug)) throw bad(key + ": home must be /w/" + slug);
            JsonNode navNode = w.path("nav");
            if (!navNode.isArray() || navNode.isEmpty()) throw bad(key + ": nav must be a non-empty array");
            List<NavDef> nav = new ArrayList<>();
            Set<String> navKeys = new HashSet<>();
            for (JsonNode n : navNode) {
                NavDef item = nav(key, slug, n);
                if (!navKeys.add(item.key())) throw bad(key + ": duplicate nav key " + item.key());
                nav.add(item);
            }
            WorkspaceDef def = new WorkspaceDef(key, slug, text(w, "label"), w.path("order").asInt(Integer.MAX_VALUE), home, strings(w.path("primaryFor")), strings(w.path("bottomTabs")), List.copyOf(nav));
            if (!def.homeItem().href().equals(home) || !def.homeItem().key().equals("home")) throw bad(key + ": the first nav item must be 'home' at " + home);
            for (String tab : def.bottomTabs()) if (!navKeys.contains(tab)) throw bad(key + ": bottom tab " + tab + " is not a nav key");
            out.add(def);
        }
        out.sort(Comparator.comparingInt(WorkspaceDef::order));
        return List.copyOf(out);
    }

    private static NavDef nav(String wsKey, String slug, JsonNode n) {
        String key = text(n, "key");
        String href = text(n, "href");
        if (!href.startsWith("/w/" + slug)) throw bad(wsKey + "/" + key + ": href must live under /w/" + slug);
        List<String> needs = strings(n.path("needs"));
        for (String need : needs) {
            if (!EntPermissions.isRegistered(need)) throw bad(wsKey + "/" + key + ": needs unknown permission key " + need);
        }
        String module = n.hasNonNull("module") ? n.get("module").asText() : null;
        if (module != null && TenantModule.ofWire(module).isEmpty()) throw bad(wsKey + "/" + key + ": unknown module " + module);
        String badge = n.hasNonNull("badge") ? n.get("badge").asText() : null;
        if (badge != null && !badge.equals("attention")) throw bad(wsKey + "/" + key + ": unknown badge " + badge);
        return new NavDef(key, text(n, "label"), text(n, "icon"), href, needs, module, badge);
    }

    private static String text(JsonNode n, String field) {
        String v = n.path(field).asText("");
        if (v.isBlank()) throw bad("missing " + field + " in " + n);
        return v;
    }

    private static List<String> strings(JsonNode n) {
        List<String> out = new ArrayList<>();
        if (n.isArray()) for (JsonNode e : n) out.add(e.asText());
        return List.copyOf(out);
    }

    private static IllegalStateException bad(String message) {
        return new IllegalStateException("workspace definitions: " + message);
    }
}
