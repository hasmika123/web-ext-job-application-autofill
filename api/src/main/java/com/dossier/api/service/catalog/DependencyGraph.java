package com.dossier.api.service.catalog;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The service dependency graph (docs/enterprise-v2/21-feature-catalog.md section 4): an edge {@code feature -> requires} for every dependency, of any
 * kind (TECHNICAL, COMMERCIAL, INTEGRATION, CONSENT). The editor refuses a save that would close a cycle.
 *
 * <p>An <b>anyOf</b> requirement ("some AI feature must be on", ai.credits_extra) names a pseudo key with the {@value #ANY_PREFIX} prefix instead of a
 * service: it has no outgoing edges and is skipped by the cycle search, because it points at a set, not at one service. Pure, no I/O.
 */
public final class DependencyGraph {

    /** Prefix of a pseudo requirement that means "any service with this property" ({@code any:consumes_ai}). */
    public static final String ANY_PREFIX = "any:";
    /** The one anyOf rule the catalog defines today: any service that consumes AI. */
    public static final String ANY_CONSUMES_AI = ANY_PREFIX + "consumes_ai";

    private final Map<String, Set<String>> edges = new HashMap<>();

    public static boolean isAnyOf(String requiresKey) {
        return requiresKey != null && requiresKey.startsWith(ANY_PREFIX);
    }

    /** Add {@code from -> to}; an anyOf target is not an edge. */
    public DependencyGraph add(String from, String to) {
        if (isAnyOf(to)) return this;
        edges.computeIfAbsent(from, k -> new LinkedHashSet<>()).add(to);
        return this;
    }

    /** Remove every outgoing edge of {@code from} (a full replacement of its dependencies starts here). */
    public DependencyGraph clear(String from) {
        edges.remove(from);
        return this;
    }

    /**
     * The first cycle found, as the list of keys in order with the first key repeated at the end ({@code [A, B, A]}); empty when the graph is
     * acyclic. A self-dependency is the cycle {@code [A, A]}. Iterative-safe for the catalog's size (a few dozen services).
     */
    public List<String> findCycle() {
        Set<String> done = new HashSet<>();
        List<String> keys = new ArrayList<>(edges.keySet());
        Collections.sort(keys);
        for (String start : keys) {
            if (done.contains(start)) continue;
            List<String> path = new ArrayList<>();
            List<String> cycle = visit(start, path, new HashSet<>(), done);
            if (!cycle.isEmpty()) return cycle;
        }
        return List.of();
    }

    private List<String> visit(String node, List<String> path, Set<String> onPath, Set<String> done) {
        path.add(node);
        onPath.add(node);
        for (String next : edges.getOrDefault(node, Set.of())) {
            if (onPath.contains(next)) {
                List<String> cycle = new ArrayList<>(path.subList(path.indexOf(next), path.size()));
                cycle.add(next);
                return cycle;
            }
            if (done.contains(next)) continue;
            List<String> found = visit(next, path, onPath, done);
            if (!found.isEmpty()) return found;
        }
        path.remove(path.size() - 1);
        onPath.remove(node);
        done.add(node);
        return List.of();
    }
}
