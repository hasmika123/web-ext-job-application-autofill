package com.dossier.api.service.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.ResumeDocException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;

/** Unit tests for the shared list contract (E2E-U0.0): paging clamps, the sort whitelist, the search limit. */
class ListQueryTest {

    private static final List<String> SORTS = List.of("updatedAt", "company", "status");

    @Test
    void defaultsWhenNothingIsSent() {
        ListQuery q = ListQuery.parse(null, null, null, null, SORTS);
        assertThat(q.page()).isZero();
        assertThat(q.size()).isEqualTo(20);
        assertThat(q.sortField()).isEqualTo("updatedAt");
        assertThat(q.direction()).isEqualTo(Sort.Direction.ASC);
        assertThat(q.q()).isNull();
    }

    @Test
    void sizeIsClampedAndPageNeverNegative() {
        assertThat(ListQuery.parse(-4, 500, null, null, SORTS).size()).isEqualTo(50);
        assertThat(ListQuery.parse(-4, 500, null, null, SORTS).page()).isZero();
        assertThat(ListQuery.parse(2, 0, null, null, SORTS).size()).isEqualTo(1);
        assertThat(ListQuery.parse(2, 30, null, null, SORTS).offset()).isEqualTo(60);
    }

    @Test
    void limitsComeFromTheCaller() {
        ListQuery.Limits limits = new ListQuery.Limits(10, 25, 40);
        assertThat(ListQuery.parse(null, null, null, null, SORTS, null, limits).size()).isEqualTo(10);
        assertThat(ListQuery.parse(null, 99, null, null, SORTS, null, limits).size()).isEqualTo(25);
    }

    @Test
    void sortIsMatchedAgainstTheWhitelistCaseInsensitively() {
        ListQuery q = ListQuery.parse(null, null, "COMPANY,desc", null, SORTS);
        assertThat(q.sortField()).isEqualTo("company");
        assertThat(q.direction()).isEqualTo(Sort.Direction.DESC);
        assertThat(q.toPageable().getSort().getOrderFor("company")).isNotNull();
    }

    @Test
    void sortDirectionDefaultsToAscending() {
        assertThat(ListQuery.parse(null, null, "status", null, SORTS).direction()).isEqualTo(Sort.Direction.ASC);
    }

    @Test
    void defaultSortIsUsedWhenSortIsAbsent() {
        ListQuery q = ListQuery.parse(null, null, "  ", null, SORTS, "updatedAt,desc", ListQuery.Limits.DEFAULTS);
        assertThat(q.sortField()).isEqualTo("updatedAt");
        assertThat(q.direction()).isEqualTo(Sort.Direction.DESC);
    }

    @Test
    void anUnknownSortFieldIsA400SortInvalid() {
        assertThatThrownBy(() -> ListQuery.parse(null, null, "password,asc", null, SORTS))
            .isInstanceOfSatisfying(ResumeDocException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(400);
                assertThat(e.getCode()).isEqualTo("SORT_INVALID");
            });
    }

    @Test
    void aBadDirectionOrExtraPartIsSortInvalid() {
        assertThatThrownBy(() -> ListQuery.parse(null, null, "company,sideways", null, SORTS))
            .isInstanceOfSatisfying(ResumeDocException.class, e -> assertThat(e.getCode()).isEqualTo("SORT_INVALID"));
        assertThatThrownBy(() -> ListQuery.parse(null, null, "company,asc,x", null, SORTS))
            .isInstanceOfSatisfying(ResumeDocException.class, e -> assertThat(e.getCode()).isEqualTo("SORT_INVALID"));
    }

    @Test
    void searchTextIsTrimmedAndBlankMeansNone() {
        assertThat(ListQuery.parse(null, null, null, "  acme  ", SORTS).q()).isEqualTo("acme");
        assertThat(ListQuery.parse(null, null, null, "   ", SORTS).q()).isNull();
    }

    @Test
    void searchTextOverTheLimitIsRefused() {
        String long121 = "x".repeat(121);
        assertThat(ListQuery.parse(null, null, null, "x".repeat(120), SORTS).q()).hasSize(120);
        assertThatThrownBy(() -> ListQuery.parse(null, null, null, long121, SORTS))
            .isInstanceOfSatisfying(ResumeDocException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(400);
                assertThat(e.getCode()).isEqualTo("QUERY_TOO_LONG");
            });
    }

    @Test
    void listPageSlicesAnInMemoryList() {
        List<Integer> all = List.of(1, 2, 3, 4, 5);
        ListPage<Integer> p = ListPage.slice(all, ListQuery.parse(1, 2, null, null, SORTS));
        assertThat(p.items()).containsExactly(3, 4);
        assertThat(p.total()).isEqualTo(5);
        assertThat(p.page()).isEqualTo(1);
        assertThat(p.size()).isEqualTo(2);
        assertThat(p.summary()).isNull();
        assertThat(ListPage.slice(all, ListQuery.parse(9, 2, null, null, SORTS)).items()).isEmpty();
    }

    @Test
    void listPageMapsAndCarriesTheSummary() {
        ListPage<String> p = new ListPage<>(List.of("a"), 1, 0, 20, null).withSummary(Map.of("ALL", 1L)).map(String::toUpperCase);
        assertThat(p.items()).containsExactly("A");
        assertThat(p.summary()).containsEntry("ALL", 1L);
    }
}
