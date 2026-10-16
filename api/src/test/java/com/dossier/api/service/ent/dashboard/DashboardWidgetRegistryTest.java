package com.dossier.api.service.ent.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.ent.authz.EntPermissions;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;

/**
 * The registry and the design document agree (14-organization-administration.md section 2.2): every registered widget key is a row of
 * the table there, every permission a provider names is a registered permission key, and the board order is unambiguous. The list of
 * providers is also checked against the classpath, so a new provider bean cannot be added without this test seeing it.
 */
class DashboardWidgetRegistryTest {

    /** The beans, built by hand (their constructors only store their collaborators). */
    private static List<DashboardWidgetProvider> providers() {
        return List.of(
            new ConsultantsTotalProvider(),
            new ActiveEmployeesProvider(),
            new TalentWidgets.Applications(),
            new TalentWidgets.Interviews(),
            new TalentWidgets.Placements(),
            new TalentWidgets.Finance(),
            new TalentWidgets.TeamPerformanceWidget(),
            new TalentWidgets.PipelineWidget(),
            new QuickActionsProvider(),
            new ChecklistProvider(),
            new AlertsProvider(null),
            new InvitesPendingProvider(),
            new ActivityRecentProvider(null, null),
            new SubscriptionSummaryProvider(null)
        );
    }

    @Test
    void everyProviderBeanOnTheClasspathIsListedHere() {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AssignableTypeFilter(DashboardWidgetProvider.class));
        Set<String> onClasspath = new HashSet<>();
        for (BeanDefinition d : scanner.findCandidateComponents("com.dossier.api.service.ent.dashboard")) onClasspath.add(d.getBeanClassName());
        Set<String> listed = new HashSet<>();
        for (DashboardWidgetProvider p : providers()) listed.add(p.getClass().getName());
        assertThat(listed).isEqualTo(onClasspath);
    }

    @Test
    void registeredKeysAreRowsOfTheDocumentTable() throws IOException {
        Set<String> docKeys = docKeys();
        assertThat(docKeys).as("the table in 14 section 2.2").isNotEmpty();
        List<String> registered = new DashboardWidgetRegistry(providers()).keys();
        assertThat(docKeys).containsAll(registered);
    }

    @Test
    void permissionsAreRegisteredKeysAndOrderIsUnambiguous() {
        DashboardWidgetRegistry registry = new DashboardWidgetRegistry(providers());
        Set<Integer> orders = new HashSet<>();
        for (DashboardWidgetProvider p : registry.providers()) {
            assertThat(p.permissions()).as(p.key()).isNotEmpty();
            for (String permission : p.permissions()) assertThat(EntPermissions.isRegistered(permission)).as(p.key() + " -> " + permission).isTrue();
            assertThat(orders.add(p.order())).as("two widgets share the board position " + p.order()).isTrue();
        }
        assertThat(registry.keys()).startsWith("consultants.total", "employees.active");
    }

    @Test
    void aNotYetBuiltProviderAnswersNotEnabledWithNoData() {
        NotYetBuiltProvider later = new NotYetBuiltProvider("later.widget", 999, List.of("hr.view"), "someModule") {};
        WidgetResult r = later.compute(null);
        assertThat(r.state().wire()).isEqualTo("unavailable");
        assertThat(r.reason()).isEqualTo(WidgetResult.NOT_ENABLED);
        assertThat(r.data()).isNull();
        assertThat(r.module()).isEqualTo("someModule");
    }

    @Test
    void theBoardTilesAreRealProvidersNotPlaceholders() {
        for (DashboardWidgetProvider p : providers()) assertThat(p).as(p.key()).isNotInstanceOf(NotYetBuiltProvider.class);
        assertThat(new DashboardWidgetRegistry(providers()).keys())
            .containsSubsequence("consultants.total", "employees.active", "applications.active", "interviews.upcoming", "placements", "finance.summary", "team.performance", "pipeline.overview", "quick.actions");
    }

    @Test
    void twoProvidersUnderOneKeyStopTheApplication() {
        List<DashboardWidgetProvider> twice = new ArrayList<>(providers());
        twice.add(new ConsultantsTotalProvider());
        assertThatThrownBy(() -> new DashboardWidgetRegistry(twice)).isInstanceOf(IllegalStateException.class).hasMessageContaining("consultants.total");
    }

    private static Set<String> docKeys() throws IOException {
        Path doc = Path.of("..", "docs", "enterprise-v2", "14-organization-administration.md");
        if (!Files.exists(doc)) doc = Path.of("docs", "enterprise-v2", "14-organization-administration.md");
        String text = Files.readString(doc, StandardCharsets.UTF_8);
        int start = text.indexOf("### 2.2");
        int end = text.indexOf("### 2.3");
        assertThat(start).isGreaterThan(-1);
        assertThat(end).isGreaterThan(start);
        Set<String> keys = new HashSet<>();
        Matcher m = Pattern.compile("^\\| `([a-z0-9_.]+)` \\|", Pattern.MULTILINE).matcher(text.substring(start, end));
        while (m.find()) keys.add(m.group(1));
        return keys;
    }
}
