package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * X11.7: "we never collect sensitive PII" is a product-wide promise, so a CI property: every write endpoint under {@code /api/orgs/**} (and the
 * consultant workspace {@code /api/me/orgs/**}) that accepts free text must reach {@link SensitiveContent} / {@link SensitivePatterns} through its
 * call graph, or be on the reviewed allow-list {@code pii-scan-allowlist.txt} with a one-line reason.
 *
 * <p>"Accepts free text" = a {@code @RequestBody} whose type is, or holds (recursively), a {@code String}, a free-form {@code Map}, {@code JsonNode} or
 * {@code Object}, or a file upload ({@code MultipartFile}). The call graph is read from the compiled classes (ArchUnit): methods called from the
 * controller method, including the lambdas of every visited method, with interface and abstract calls resolved to every implementation by name. A new
 * endpoint with a free-text body that neither scans nor is allow-listed fails this test; so does an allow-list entry for an endpoint that no longer
 * exists, that lacks a reason, or that in fact scans (it should not hide there).
 */
@Timeout(600)
class SensitiveTextCoverageTest {

    private static final Map<String, List<JavaCodeUnit>> CANDIDATES = new java.util.HashMap<>();

    private static final String ALLOW_LIST = "/pii-scan-allowlist.txt";
    private static final List<String> SCANNER_CLASSES = List.of(SensitiveContent.class.getName(), SensitivePatterns.class.getName());
    private static final List<String> ROOTS = List.of("/api/orgs", "/api/me/orgs");

    /** One write endpoint with a free-text input. */
    record Endpoint(Class<?> controller, Method method, String verb, String path, List<String> textInputs) {
        String key() {
            return controller.getSimpleName() + "#" + method.getName();
        }
    }

    @Test
    void everyFreeTextWriteEndpointScansOrIsReviewed() throws Exception {
        JavaClasses classes = new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests()).importPackages("com.dossier.api");
        List<Endpoint> endpoints = endpoints(classes);
        assertThat(endpoints).as("the enumeration finds the org write endpoints").hasSizeGreaterThan(20);

        Map<String, String> allow = allowList();
        List<String> unscanned = new ArrayList<>();
        List<String> allowedButScans = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Endpoint e : endpoints) {
            seen.add(e.key());
            boolean scans = reachesScanner(classes, e);
            boolean allowed = allow.containsKey(e.key());
            if (!scans && !allowed) unscanned.add(e.key() + "  " + e.verb() + " " + e.path() + "  text inputs: " + e.textInputs());
            if (scans && allowed) allowedButScans.add(e.key());
        }
        assertThat(unscanned)
            .as("write endpoints that accept free text but never reach SensitiveContent: scan the text, or add 'Controller#method | reason' to pii-scan-allowlist.txt (never for user-entered free text)")
            .isEmpty();
        assertThat(allowedButScans).as("allow-listed endpoints that do scan: remove them from the allow-list").isEmpty();
        assertThat(new TreeSet<>(allow.keySet()).stream().filter(k -> !seen.contains(k)).toList())
            .as("allow-list entries that match no free-text write endpoint (renamed, removed or not free text any more)")
            .isEmpty();
    }

    @Test
    void theAllowListGivesEveryEntryAReasonAndAdmitsNoFreeTextStore() throws Exception {
        Map<String, String> allow = allowList();
        for (Map.Entry<String, String> e : allow.entrySet()) {
            assertThat(e.getValue().strip().length()).as("reason for " + e.getKey()).isGreaterThanOrEqualTo(15);
            assertThat(e.getValue().toLowerCase()).as("reason for " + e.getKey() + " must not claim a free-text store").doesNotContain("free text stored");
        }
    }

    // ---- enumeration ------------------------------------------------------------------------------------------------------------

    private static List<Endpoint> endpoints(JavaClasses classes) throws Exception {
        List<Endpoint> out = new ArrayList<>();
        for (JavaClass jc : classes) {
            Class<?> c;
            try {
                c = jc.reflect();
            } catch (Throwable t) {
                continue;
            }
            if (!c.isAnnotationPresent(RestController.class)) continue;
            RequestMapping base = AnnotatedElementUtils.findMergedAnnotation(c, RequestMapping.class);
            List<String> basePaths = base == null ? List.of("") : Arrays.asList(base.path().length == 0 ? new String[] { "" } : base.path());
            if (basePaths.stream().noneMatch(p -> ROOTS.stream().anyMatch(p::startsWith))) continue;
            for (Method m : c.getDeclaredMethods()) {
                RequestMapping rm = AnnotatedElementUtils.findMergedAnnotation(m, RequestMapping.class);
                if (rm == null) continue;
                List<RequestMethod> verbs = Arrays.asList(rm.method());
                if (verbs.stream().noneMatch(v -> v == RequestMethod.POST || v == RequestMethod.PUT || v == RequestMethod.PATCH || v == RequestMethod.DELETE)) continue;
                List<String> text = new ArrayList<>();
                for (java.lang.reflect.Parameter p : m.getParameters()) {
                    if (p.isAnnotationPresent(RequestBody.class)) text.addAll(textFields(p.getParameterizedType(), p.getName(), new HashSet<>()));
                    else if (MultipartFile.class.isAssignableFrom(p.getType()) || p.isAnnotationPresent(RequestPart.class) && p.getType() == byte[].class) text.add(p.getName() + " (upload)");
                }
                if (text.isEmpty()) continue;
                out.add(new Endpoint(c, m, verbs.get(0).name(), (basePaths.get(0) + (rm.path().length > 0 ? rm.path()[0] : "")), text));
            }
        }
        return out;
    }

    /** The names of the free-text inputs inside a body type: String leaves, free-form maps, JsonNode, Object. */
    static List<String> textFields(Type type, String name, Set<Class<?>> path) {
        if (type instanceof ParameterizedType pt) {
            Class<?> raw = (Class<?>) pt.getRawType();
            if (Map.class.isAssignableFrom(raw)) return List.of(name + " (map)");
            List<String> out = new ArrayList<>();
            if (Collection.class.isAssignableFrom(raw) || Optional.class.isAssignableFrom(raw)) {
                for (Type a : pt.getActualTypeArguments()) out.addAll(textFields(a, name + "[]", path));
            }
            return out;
        }
        if (!(type instanceof Class<?> c)) return List.of();
        if (c == String.class || c == CharSequence.class) return List.of(name);
        if (c == Object.class || c.getName().startsWith("com.fasterxml.jackson.databind.JsonNode") || c.getName().startsWith("com.fasterxml.jackson.databind.node.")) return List.of(name + " (json)");
        if (Map.class.isAssignableFrom(c)) return List.of(name + " (map)");
        if (c.isArray()) return textFields(c.getComponentType(), name + "[]", path);
        if (c.isPrimitive() || c.isEnum() || !c.getName().startsWith("com.dossier.api") || !path.add(c)) return List.of();
        List<String> out = new ArrayList<>();
        if (c.isRecord()) {
            for (RecordComponent rc : c.getRecordComponents()) out.addAll(textFields(rc.getGenericType(), name + "." + rc.getName(), path));
        } else {
            for (Field f : c.getDeclaredFields()) {
                if (Modifier.isStatic(f.getModifiers())) continue;
                out.addAll(textFields(f.getGenericType(), name + "." + f.getName(), path));
            }
        }
        path.remove(c);
        return out;
    }

    // ---- call graph -------------------------------------------------------------------------------------------------------------

    private static boolean reachesScanner(JavaClasses classes, Endpoint e) {
        JavaClass owner = classes.get(e.controller());
        Deque<JavaCodeUnit> todo = new ArrayDeque<>();
        Set<JavaCodeUnit> visited = new HashSet<>();
        for (JavaCodeUnit u : owner.getMethods()) {
            if (u.getName().equals(e.method().getName()) && u.getRawParameterTypes().size() == e.method().getParameterCount()) todo.add(u);
        }
        while (!todo.isEmpty()) {
            JavaCodeUnit u = todo.poll();
            if (!visited.add(u)) continue;
            // the lambdas of a visited method run as part of it
            for (JavaCodeUnit l : u.getOwner().getMethods()) {
                if (l.getName().startsWith("lambda$" + u.getName() + "$")) todo.add(l);
            }
            for (var call : u.getCallsFromSelf()) {
                JavaClass target = call.getTargetOwner();
                if (SCANNER_CLASSES.contains(target.getName()) || target.getPackageName().equals(SensitiveContent.class.getPackageName())) return true;
                for (JavaCodeUnit next : candidates(target, call.getTarget().getName(), call.getTarget().getRawParameterTypes().size())) todo.add(next);
            }
        }
        return false;
    }

    /** The code units a call to {@code owner.name(argCount)} may run: the owner's, its supertypes' defaults and every subtype's override. */
    private static List<JavaCodeUnit> candidates(JavaClass owner, String name, int argCount) {
        return CANDIDATES.computeIfAbsent(owner.getName() + "#" + name + "/" + argCount, k -> computeCandidates(owner, name, argCount));
    }

    private static List<JavaCodeUnit> computeCandidates(JavaClass owner, String name, int argCount) {
        if (!owner.getName().startsWith("com.dossier.api")) return List.of();
        List<JavaCodeUnit> out = new ArrayList<>();
        Set<JavaClass> scope = new HashSet<>();
        scope.add(owner);
        scope.addAll(owner.getAllRawSuperclasses());
        scope.addAll(owner.getAllRawInterfaces());
        scope.addAll(owner.getAllSubclasses());
        for (JavaClass c : scope) {
            if (!c.getName().startsWith("com.dossier.api")) continue;
            for (JavaCodeUnit u : c.getMethods()) if (u.getName().equals(name) && u.getRawParameterTypes().size() == argCount) out.add(u);
            if (name.equals("<init>")) out.addAll(c.getConstructors().stream().filter(k -> k.getRawParameterTypes().size() == argCount).toList());
        }
        return out;
    }

    // ---- allow-list -------------------------------------------------------------------------------------------------------------

    static Map<String, String> allowList() throws Exception {
        Map<String, String> out = new LinkedHashMap<>();
        try (InputStream in = SensitiveTextCoverageTest.class.getResourceAsStream(ALLOW_LIST)) {
            assertThat(in).as(ALLOW_LIST + " is on the test classpath").isNotNull();
            BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            String line;
            while ((line = r.readLine()) != null) {
                String t = line.strip();
                if (t.isEmpty() || t.startsWith("#")) continue;
                int bar = t.indexOf('|');
                assertThat(bar).as("allow-list line needs 'Controller#method | reason': " + t).isGreaterThan(0);
                String key = t.substring(0, bar).strip();
                String reason = t.substring(bar + 1).strip();
                assertThat(out.put(key, reason)).as("duplicate allow-list entry " + key).isNull();
            }
        }
        return out;
    }
}
