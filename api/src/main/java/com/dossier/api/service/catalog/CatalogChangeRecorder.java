package com.dossier.api.service.catalog;

import com.dossier.api.domain.catalog.CatalogChange;
import com.dossier.api.repository.sub.CatalogChangeRepository;
import com.dossier.api.security.SecurityUtils;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes the {@code catalog_change} row of every catalog write (docs/subscriptions/08-data-model.md section 2.4): entity, id, before and after as
 * JSON, the acting login and the reason. Runs in the caller's transaction, so the change row and the write it describes commit together.
 */
@Service
public class CatalogChangeRecorder {

    public static final String ENTITY_FEATURE_DEFINITION = "feature_definition";
    public static final String ENTITY_PRODUCT = "product";
    public static final String ENTITY_PRODUCT_PRICE = "product_price";
    public static final String ENTITY_FEATURE_DEPENDENCY = "feature_dependency";
    public static final String ENTITY_PRESET = "preset";
    public static final String ENTITY_VOLUME_TIER = "volume_tier";
    public static final String ENTITY_PLAN = "plan";
    public static final String ENTITY_PLAN_VERSION = "plan_version";

    private final CatalogChangeRepository changes;
    private final ObjectMapper mapper;

    public CatalogChangeRecorder(CatalogChangeRepository changes, ObjectMapper mapper) {
        this.changes = changes;
        this.mapper = mapper;
    }

    /** {@code before} / {@code after} may be null (a create has no before; a delete has no after); anything Jackson can serialise is fine. */
    @Transactional
    public CatalogChange record(String entity, String entityId, Object before, Object after, String reason) {
        CatalogChange c = new CatalogChange();
        c.setEntity(entity);
        c.setEntityId(entityId);
        c.setBeforeJson(json(before));
        c.setAfterJson(json(after));
        c.setActorLogin(SecurityUtils.getCurrentUserLogin().orElse("system"));
        c.setReason(reason == null || reason.isBlank() ? null : reason.length() > 500 ? reason.substring(0, 500) : reason);
        c.setCreatedAt(Instant.now());
        return changes.save(c);
    }

    private String json(Object o) {
        if (o == null) return null;
        try {
            return mapper.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("catalog change is not serialisable: " + o.getClass().getSimpleName(), e);
        }
    }
}
