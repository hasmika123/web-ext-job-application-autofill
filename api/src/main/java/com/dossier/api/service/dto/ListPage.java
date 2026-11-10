package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.data.domain.Page;

/**
 * The one list response (APP-E2E-PLAN section 2.4): {@code { items, total, page, size, summary? }}.
 * {@code summary} is the per-tab counts of a page that has tabs (for example {@code {ALL: 12, APPLIED: 7}});
 * it is left out of the JSON when the endpoint has none.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ListPage<T>(List<T> items, long total, int page, int size, Map<String, Long> summary) {
    public ListPage {
        items = items == null ? List.of() : List.copyOf(items);
    }

    public static <T> ListPage<T> of(Page<T> page) {
        return new ListPage<>(page.getContent(), page.getTotalElements(), page.getNumber(), page.getSize(), null);
    }

    /** Slice an already-loaded, already-sorted list for {@code query} (for the endpoints that filter in memory). */
    public static <T> ListPage<T> slice(List<T> all, ListQuery query) {
        int from = (int) Math.min(query.offset(), all.size());
        int to = Math.min(all.size(), from + query.size());
        return new ListPage<>(all.subList(from, to), all.size(), query.page(), query.size(), null);
    }

    public ListPage<T> withSummary(Map<String, Long> counts) {
        return new ListPage<>(items, total, page, size, counts == null ? null : Map.copyOf(counts));
    }

    public <R> ListPage<R> map(Function<? super T, ? extends R> mapper) {
        return new ListPage<>(items.stream().<R>map(mapper).toList(), total, page, size, summary);
    }
}
