package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.ShareScope;
import java.util.List;

/**
 * The consent a member is shown before choosing a scope (consent-data-sharing.md sections 3 and 5.1): the text version
 * that will be stored with the choice, the scope the org proposes, the scopes the join screen offers (FULL is never one of
 * them: it needs a named paired person), the visibility matrix rendered from the {@code ShareField} enum, and the
 * markdown of the text itself for the "What exactly?" sheet.
 */
public record OrgConsentDTO(String version, ShareScope defaultScope, List<ShareScope> options, List<Row> matrix, String text) {
    /** One kind of fact and the least open scope that shows it ({@code minScope} is null for what no scope ever shows). */
    public record Row(String field, String label, ShareScope minScope) {}
}
