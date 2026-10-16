package com.dossier.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.ApplicationPatchService;
import com.dossier.api.service.ApplicationService;
import com.dossier.api.service.ApplicationSyncService;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import io.swagger.v3.oas.annotations.Operation;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * E1 / ADR-010, enforced structurally (docs/enterprise-v2/60-job-phase1-contract.md section 5): Kiwiply and its marketers never submit an application and
 * never set a consultant's application status. The organization side may READ a person's application and write org-side rows; it can not write the
 * application. Four rules, none of which a feature can switch off without editing this file:
 * <ol>
 *   <li>no class under {@code web.rest.ent.**} or {@code web.rest.org.**}, and no org-side service ({@code service.ent.**}, {@code service.org.**}), depends on
 *       the services that write an {@code Application} ({@code ApplicationSyncService}, {@code ApplicationEventService}, {@code ApplicationPatchService},
 *       {@code ApplicationService}) or calls {@code Application.setStatus};</li>
 *   <li>no route under {@code /api/orgs/**} is named, or documented in its {@code @Operation} summary or description, as transmitting a submission
 *       (a negation such as "it submits nothing" is fine and is exactly how the Submissions page says it);</li>
 *   <li>no {@code Con*} DTO, row or response of the consultant API carries a rate beyond {@code payLabel}, a client contact, another consultant,
 *       a marketer-internal note or {@code ownerMemberId};</li>
 *   <li>(disabled until the marketer {@code from-extension} endpoint is on this branch) it rejects {@code state} and {@code appliedAt}.</li>
 * </ol>
 */
class NoSubmitSurfaceTest {

    private static final String[] ORG_WEB = { "com.dossier.api.web.rest.ent..", "com.dossier.api.web.rest.org.." };
    private static final String[] ORG_SERVICES = { "com.dossier.api.service.ent..", "com.dossier.api.service.org.." };

    private static JavaClasses classes;

    @BeforeAll
    static void importMain() {
        classes = new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests()).importPackages("com.dossier.api");
    }

    // ---- 1. nothing on the organization side can write an application ----------------------------------------------------------

    @Test
    void noOrgControllerDependsOnAServiceThatWritesAnApplication() {
        noClasses()
            .that()
            .resideInAnyPackage(ORG_WEB)
            .should()
            .dependOnClassesThat()
            .belongToAnyOf(ApplicationSyncService.class, ApplicationEventService.class, ApplicationPatchService.class, ApplicationService.class)
            .because("an organization route must not be able to write a person's application (E1, ADR-010)")
            .check(classes);
    }

    @Test
    void noOrgServiceDependsOnAServiceThatWritesAnApplication() {
        noClasses()
            .that()
            .resideInAnyPackage(ORG_SERVICES)
            // X9.15: the ONE sanctioned exception. A marketer SAVES a job (status SAVED, never applied) on an assigned consultant's tracker through
            // ApplicationSyncService inside TrackerActAs, after TrackerActForGate proved the access; the history names the marketer. It is a bookmark,
            // not a submission (E1 holds: Kiwiply never submits). Needs the user's explicit sign-off (docs/HANDOFF-CHANGE-AUDIT-REPORT.md, decision D8).
            .and()
            .doNotHaveSimpleName("SaveForConsultantService")
            .should()
            .dependOnClassesThat()
            .belongToAnyOf(ApplicationSyncService.class, ApplicationEventService.class, ApplicationPatchService.class, ApplicationService.class)
            .because("the organization side follows the consultant's application by LISTENING to its events, never by writing it")
            .check(classes);
    }

    @Test
    void noOrgClassSetsAnApplicationStatus() {
        noClasses()
            .that()
            .resideInAnyPackage(ORG_WEB)
            .or()
            .resideInAnyPackage(ORG_SERVICES)
            .and()
            .doNotHaveSimpleName("DemoOrgSeeder") // seeds the DEMO person's own tracker when a demo org is created: not reachable from a route of a real org
            .should()
            .callMethod(Application.class, "setStatus", ApplicationStatus.class)
            .because("only the application's owner (or an email that moves it) changes its status")
            .check(classes);
    }

    @Test
    void theLinkerReadsApplicationsButItsOnlyWritesAreOrgSideRows() {
        // the listener and its work bean may read applications; neither may call a method of the application writers (already covered by the rules above)
        // and the work bean must not even see the entity setters of Application.
        noClasses()
            .that()
            .haveSimpleNameStartingWith("PipelineApplicationLink")
            .should()
            .callMethodWhere(com.tngtech.archunit.core.domain.JavaCall.Predicates.target(
                com.tngtech.archunit.base.DescribedPredicate.describe("an Application setter", t -> t.getOwner().isEquivalentTo(Application.class) && t.getName().startsWith("set"))
            ))
            .check(classes);
    }

    // ---- 2. no route is named or documented as transmitting a submission --------------------------------------------------------

    private record Route(String path, String httpClass, String handler, String text) {}

    static List<Route> orgRoutes() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(AnnotatedBeanDefinition bd) {
                return true;
            }
        };
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        List<Route> out = new ArrayList<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("com.dossier.api.web.rest")) {
            Class<?> c = Class.forName(bd.getBeanClassName());
            RequestMapping base = AnnotatedElementUtils.findMergedAnnotation(c, RequestMapping.class);
            List<String> bases = base == null || base.path().length == 0 ? List.of("") : List.of(base.path());
            Operation classOp = c.getAnnotation(Operation.class);
            for (Method m : c.getDeclaredMethods()) {
                RequestMapping mapping = AnnotatedElementUtils.findMergedAnnotation(m, RequestMapping.class);
                if (mapping == null) continue;
                List<String> own = mapping.path().length == 0 ? List.of("") : List.of(mapping.path());
                Operation op = m.getAnnotation(Operation.class);
                String text = (op == null ? "" : op.summary() + " " + op.description()) + (classOp == null ? "" : " " + classOp.summary() + " " + classOp.description());
                for (String b : bases) for (String p : own) {
                    String path = (b + p).replaceAll("//+", "/");
                    if (path.startsWith("/api/orgs/")) out.add(new Route(path, c.getSimpleName(), m.getName(), text));
                }
            }
        }
        return out;
    }

    /** A segment that names transmitting: /submit, /transmit, /send, /auto-apply, /apply. ("/submissions" is the Submissions PAGE, a record of what happened.) */
    private static final Pattern FORBIDDEN_SEGMENT = Pattern.compile("(?i)/(submit|transmit|send|forward|auto-?apply|auto-?submit|apply|apply-for|file)(/|$|\\{)");
    /** The verbs (never the status names SUBMITTED / submittedToday, which are facts a page shows). */
    private static final Pattern STEM = Pattern.compile("(?i)\\b(submit|submits|submitting|transmit|transmits|transmitting|transmitted)\\b");
    private static final Pattern NEGATED = Pattern.compile(
        "(?i)\\b(submit|submits|transmit|transmits)\\s+(nothing|no\\b|nobody|never)|\\b(never|not|no|nor|without|cannot|can't|don't|doesn't)\\s+(\\w+\\s+){0,3}(submit|submits|transmit|transmits)\\b"
    );
    /** The person whose application it is MAY submit it ("the consultant submits"): that is the rule, not a violation of it. */
    private static final Pattern THE_OWNER_DOES = Pattern.compile("(?i)\\b(consultant|candidate|person|user|owner|applicant)s?\\s+(\\w+\\s+){0,2}(submit|submits|submitting|transmit|transmits)\\b");

    /** The text with every negated "submit", and every "the consultant submits", removed: what is left is a claim that Kiwiply or a marketer submits or transmits. */
    static String affirmative(String text) {
        return THE_OWNER_DOES.matcher(NEGATED.matcher(text).replaceAll(" ")).replaceAll(" ");
    }

    @Test
    void noOrgRouteIsNamedOrDocumentedAsTransmittingASubmission() throws Exception {
        List<Route> routes = orgRoutes();
        assertThat(routes).as("routes discovered under /api/orgs/").hasSizeGreaterThan(50);
        List<String> offenders = new ArrayList<>();
        for (Route r : routes) {
            if (FORBIDDEN_SEGMENT.matcher(r.path()).find()) offenders.add("path " + r.path() + " (" + r.httpClass() + "." + r.handler() + ")");
            if (STEM.matcher(affirmative(r.text())).find()) offenders.add("text of " + r.httpClass() + "." + r.handler() + ": " + r.text());
        }
        assertThat(offenders).as("an organization route must never submit or transmit an application (E1, ADR-010)").isEmpty();
    }

    @Test
    void theConsultantRoutesAreThereAndNameOnlyWhatTheConsultantDid() throws Exception {
        Set<String> paths = new TreeSet<>();
        orgRoutes().stream().filter(r -> r.path().startsWith("/api/orgs/{orgId}/con/")).forEach(r -> paths.add(r.path()));
        assertThat(paths).contains(
            "/api/orgs/{orgId}/con/opportunities", "/api/orgs/{orgId}/con/opportunities/{id}", "/api/orgs/{orgId}/con/opportunities/{id}/viewed",
            "/api/orgs/{orgId}/con/opportunities/{id}/interest", "/api/orgs/{orgId}/con/opportunities/{id}/decline", "/api/orgs/{orgId}/con/opportunities/{id}/request-info",
            "/api/orgs/{orgId}/con/opportunities/{id}/applied", "/api/orgs/{orgId}/con/opportunities/{id}/link", "/api/orgs/{orgId}/con/opportunities/{id}/unlink"
        );
    }

    @Test
    void theNegationFilterAcceptsTheWordingTheRepoAlreadyUsesAndCatchesRealClaims() {
        assertThat(STEM.matcher(affirmative("RECORD the stage the consultant's application reached. An event on the timeline; it submits nothing.")).find()).isFalse();
        assertThat(STEM.matcher(affirmative("a fact reported by the consultant or the client; it submits nothing.")).find()).isFalse();
        assertThat(STEM.matcher(affirmative("Never submits anything for anyone.")).find()).isFalse();
        assertThat(STEM.matcher(affirmative("The marketer does not submit the application.")).find()).isFalse();
        assertThat(STEM.matcher(affirmative("Submit the application to the vendor.")).find()).isTrue();
        assertThat(STEM.matcher(affirmative("Transmits the resume to the client portal.")).find()).isTrue();
        assertThat(FORBIDDEN_SEGMENT.matcher("/api/orgs/{orgId}/mkt/applications/{id}/submit").find()).isTrue();
        assertThat(FORBIDDEN_SEGMENT.matcher("/api/orgs/{orgId}/mkt/submissions/{id}/status").find()).isFalse();
        assertThat(FORBIDDEN_SEGMENT.matcher("/api/orgs/{orgId}/con/opportunities/{id}/applied").find()).isFalse();
    }

    // ---- 3. the consultant DTOs carry nothing a consultant must not see --------------------------------------------------------------

    private static final Pattern FORBIDDEN_FIELD = Pattern.compile(
        "(?i)^(rate\\w*|\\w*rate(min|max|unit|minor)\\w*|contact\\w*|\\w*contact(id|s)?|ownerMemberId|matches|otherConsultants|consultants|internalNote\\w*|\\w*internalNotes?)$"
    );

    private static void collect(Type type, Set<Class<?>> seen, Set<String> fieldNames, List<String> classNames) {
        if (type instanceof ParameterizedType p) {
            collect(p.getRawType(), seen, fieldNames, classNames);
            for (Type a : p.getActualTypeArguments()) collect(a, seen, fieldNames, classNames);
            return;
        }
        if (!(type instanceof Class<?> c)) return;
        if (c.isArray()) {
            collect(c.getComponentType(), seen, fieldNames, classNames);
            return;
        }
        if (c.isPrimitive() || c.getName().startsWith("java.") || c.getName().startsWith("org.springframework.") || !seen.add(c)) return;
        classNames.add(c.getName());
        if (c.isRecord()) {
            for (RecordComponent rc : c.getRecordComponents()) {
                fieldNames.add(c.getSimpleName() + "." + rc.getName());
                collect(rc.getGenericType(), seen, fieldNames, classNames);
            }
        } else {
            for (Field f : c.getDeclaredFields()) {
                if (Modifier.isStatic(f.getModifiers()) || f.isSynthetic()) continue;
                fieldNames.add(c.getSimpleName() + "." + f.getName());
                collect(f.getGenericType(), seen, fieldNames, classNames);
            }
        }
    }

    @Test
    void noConsultantDtoRowOrResponseCarriesARateAContactAnotherConsultantOrAnInternalNote() throws Exception {
        Set<Class<?>> seen = new LinkedHashSet<>();
        Set<String> fields = new TreeSet<>();
        List<String> names = new ArrayList<>();
        // 1. every Con*DTO / Con*Row class of the consultant packages (and what they nest)
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(AnnotatedBeanDefinition bd) {
                return true;
            }
        };
        scanner.addIncludeFilter((reader, factory) -> {
            String n = reader.getClassMetadata().getClassName();
            String simple = n.substring(n.lastIndexOf('.') + 1);
            return simple.matches("Con\\w*(DTO|Row)(\\$\\w+)?");
        });
        for (String pkg : List.of("com.dossier.api.service.ent.consultant", "com.dossier.api.repository.ent.consultant", "com.dossier.api.web.rest.ent.consultant")) {
            for (BeanDefinition bd : scanner.findCandidateComponents(pkg)) collect(Class.forName(bd.getBeanClassName()), seen, fields, names);
        }
        // 2. everything a consultant handler returns or takes as a body
        ClassPathScanningCandidateComponentProvider controllers = new ClassPathScanningCandidateComponentProvider(false);
        controllers.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        for (BeanDefinition bd : controllers.findCandidateComponents("com.dossier.api.web.rest.ent.consultant")) {
            for (Method m : Class.forName(bd.getBeanClassName()).getDeclaredMethods()) {
                if (!Modifier.isPublic(m.getModifiers())) continue;
                collect(m.getGenericReturnType(), seen, fields, names);
            }
        }
        assertThat(names).as("the consultant DTO graph was found").anyMatch(n -> n.endsWith("ConOpportunityDTO")).anyMatch(n -> n.endsWith("ConOpportunityDTO$Job")).anyMatch(n -> n.endsWith("ConOpportunityRow"));
        List<String> bad = new ArrayList<>();
        for (String f : fields) if (FORBIDDEN_FIELD.matcher(f.substring(f.indexOf('.') + 1)).matches()) bad.add(f);
        assertThat(bad).as("forbidden fields in the consultant API (doc 60 section 4)").isEmpty();
        assertThat(fields).contains("Job.payLabel", "ConOpportunityDTO.marketerNote");
    }

    @Test
    void theForbiddenFieldPatternCatchesTheNamesItIsMeantTo() {
        for (String bad : List.of("rate", "rateMin", "rateMax", "rateUnit", "rateMinMinor", "contact", "contactId", "contactEmail", "clientContact", "ownerMemberId", "matches", "otherConsultants", "internalNote", "internalNotes")) {
            assertThat(FORBIDDEN_FIELD.matcher(bad).matches()).as(bad).isTrue();
        }
        for (String fine : List.of("payLabel", "marketerNote", "assignedBy", "state", "version", "priority", "infoRequest", "linkedApplicationId", "operate")) {
            assertThat(FORBIDDEN_FIELD.matcher(fine).matches()).as(fine).isFalse();
        }
    }

    // ---- sanity: the rules above see the classes they are about ------------------------------------------------------------------------

    @Test
    void theRulesSeeTheOrgSideClasses() {
        assertThat(classes.stream().filter(c -> c.getPackageName().startsWith("com.dossier.api.web.rest.ent")).count()).isGreaterThan(10);
        assertThat(classes.stream().filter(c -> c.getPackageName().startsWith("com.dossier.api.service.ent")).count()).isGreaterThan(50);
        Collection<String> consultantClasses = classes.stream().filter(c -> c.getPackageName().endsWith(".consultant")).map(c -> c.getSimpleName()).toList();
        assertThat(consultantClasses).contains("ConScope", "ConOpportunityService", "ConOpportunitiesResource", "PipelineApplicationLinker");
    }
}
