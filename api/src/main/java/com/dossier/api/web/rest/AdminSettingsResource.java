package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.settings.SettingsService;
import com.dossier.api.service.settings.SettingsService.HistoryRow;
import com.dossier.api.service.settings.SettingsService.SettingItem;
import com.dossier.api.service.settings.SettingsService.SettingsView;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The generic admin settings API (A5.1, ADMIN-E2E-PLAN 2.1): every runtime setting the registry declares, with its
 * value and where it came from, changed with history and an audit row, no restart. ADMIN-only. Keys, passwords and
 * tokens are never settings, so nothing here can carry one.
 *
 * <p>A write validates against the key's type and bounds ({@code 400 SETTING_OUT_OF_BOUNDS}), refuses an unknown key
 * ({@code 400 SETTING_UNKNOWN_KEY}) and a HIGH-risk change without a reason of 10+ characters
 * ({@code 400 SETTING_REASON_REQUIRED}); see {@link com.dossier.api.service.settings.SettingsException}.
 *
 * <p>A key is addressed by its dotted name ({@code tracker.list.defaultSize}). The one family whose names can hold a
 * slash ({@code ai.price.<model>.*}) is managed on the AI page.
 */
@RestController
@RequestMapping("/api/admin/settings")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminSettingsResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminSettingsResource.class);

    /**
     * A setting key in the path: dotted, as every registry key is. A bare word ({@code /settings/demo}, the demo
     * switch's own endpoint) is not a key, so it never reaches these handlers and a write there stays a 405.
     */
    private static final String KEY = "/{key:.+[.].+}";

    /** {@code value} is the JSON the key's type calls for: boolean, number, string, or an object/array for JSON and FLAG keys. */
    public record SetRequest(JsonNode value, String reason) {}

    public record ReasonRequest(String reason) {}

    public record RevertRequest(Long historyId, String reason) {}

    private final SettingsService service;

    public AdminSettingsResource(SettingsService service) {
        this.service = service;
    }

    @GetMapping
    public SettingsView list(@RequestParam(name = "area", required = false) String area, @RequestParam(name = "q", required = false) String q) {
        LOG.debug("REST request for the admin settings (area={})", area);
        return service.list(area, q);
    }

    @GetMapping(KEY)
    public SettingItem get(@PathVariable("key") String key) {
        return service.get(key);
    }

    /** Set a value (PUT and PATCH are the same operation: the body names the one field to change). */
    @PutMapping(KEY)
    public SettingItem put(@PathVariable("key") String key, @RequestBody SetRequest body) {
        return service.set(key, body.value(), body.reason());
    }

    @PatchMapping(KEY)
    public SettingItem patch(@PathVariable("key") String key, @RequestBody SetRequest body) {
        return service.set(key, body.value(), body.reason());
    }

    /** Reset to the env/code default. The reason may be a query parameter or a JSON body. */
    @DeleteMapping(KEY)
    public SettingItem reset(
        @PathVariable("key") String key,
        @RequestParam(name = "reason", required = false) String reasonParam,
        @RequestBody(required = false) ReasonRequest body
    ) {
        String reason = body != null && body.reason() != null ? body.reason() : reasonParam;
        return service.reset(key, reason);
    }

    @GetMapping(KEY + "/history")
    public List<HistoryRow> history(@PathVariable("key") String key, @RequestParam(name = "limit", required = false) Integer limit) {
        return service.history(key, limit);
    }

    @PostMapping(KEY + "/revert")
    public SettingItem revert(@PathVariable("key") String key, @RequestBody RevertRequest body) {
        return service.revert(key, body.historyId(), body.reason());
    }
}
