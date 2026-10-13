package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ent.authz.EntPermissions;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** The page's permission donut is derived from the registry: every family is placed, every key lands in one of the five categories. */
class PermissionCategoriesTest {

    @Test
    void theFiveCategoriesOfTheBoardInOrder() {
        assertThat(PermissionCategories.all()).extracting(PermissionCategories.Category::label)
            .containsExactly("Core Platform", "Recruiting", "Consultants", "Finance", "Administration");
    }

    @Test
    void everyFamilyOfTheRegistryIsPlacedOnPurpose() {
        Set<String> unplaced = EntPermissions.all().stream().map(EntPermissions.Def::family).filter(f -> !PermissionCategories.placed(f)).collect(Collectors.toSet());
        assertThat(unplaced).as("a new permission family must be placed in PermissionCategories").isEmpty();
    }

    @Test
    void everyKeyHasACategoryAndEveryCategoryHasKeys() {
        List<String> used = EntPermissions.all().stream().map(d -> PermissionCategories.of(d.key()).key()).distinct().toList();
        assertThat(used).containsExactlyInAnyOrderElementsOf(PermissionCategories.all().stream().map(PermissionCategories.Category::key).toList());
    }

    @Test
    void aFewKnownPlacements() {
        assertThat(PermissionCategories.of("billing.manage")).isEqualTo(PermissionCategories.FINANCE);
        assertThat(PermissionCategories.of("roles.manage")).isEqualTo(PermissionCategories.ADMINISTRATION);
        assertThat(PermissionCategories.of("consultants.view")).isEqualTo(PermissionCategories.CONSULTANTS);
        assertThat(PermissionCategories.of("pipeline.view")).isEqualTo(PermissionCategories.RECRUITING);
        assertThat(PermissionCategories.of("departments.manage")).as("an alias follows its canonical key").isEqualTo(PermissionCategories.ADMINISTRATION);
        assertThat(PermissionCategories.of("not.a.key")).as("unknown keys fall to the most guarded group").isEqualTo(PermissionCategories.ADMINISTRATION);
    }
}
