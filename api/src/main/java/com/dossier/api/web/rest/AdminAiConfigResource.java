package com.dossier.api.web.rest;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.AdminAiConfigService;
import com.dossier.api.service.AdminAiConfigService.CallsView;
import com.dossier.api.service.AdminAiConfigService.ConfigView;
import com.dossier.api.service.AdminAiConfigService.GlobalView;
import com.dossier.api.service.AdminAiConfigService.HistoryRow;
import com.dossier.api.service.AdminAiConfigService.PriceView;
import com.dossier.api.service.AdminAiConfigService.ProviderView;
import com.dossier.api.service.AdminAiConfigService.RouteView;
import com.dossier.api.service.AdminAiConfigService.TestResult;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
 * Admin AI configuration (I1.11; AI-ADMIN-CONFIG-DESIGN 6.1): which provider and model answers each task, what
 * each model costs, whether the provider answers, and what recent calls did. ADMIN-only. Keys never pass through
 * here - a provider reports only {@code keyPresent} and the NAME of its env variable.
 *
 * <p>A PATCH body names only the fields to change; a JSON {@code null} clears a field's row (back to env). The
 * bodies are maps so "absent" and "null" stay distinguishable. Every refusal is a ProblemDetail with a
 * {@code code}: see {@link com.dossier.api.service.AiConfigException}.
 */
@RestController
@RequestMapping("/api/admin/ai")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminAiConfigResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminAiConfigResource.class);

    private final AdminAiConfigService service;

    public AdminAiConfigResource(AdminAiConfigService service) {
        this.service = service;
    }

    @GetMapping("/config")
    public ConfigView config() {
        LOG.debug("REST request for the admin AI config");
        return service.config();
    }

    @PatchMapping("/config/global")
    public GlobalView patchGlobal(@RequestBody Map<String, Object> body) {
        return service.patchGlobal(body);
    }

    @GetMapping("/config/history")
    public List<HistoryRow> history(@RequestParam(name = "key", required = false) String key, @RequestParam(name = "limit", required = false) Integer limit) {
        return service.history(key, limit);
    }

    @PatchMapping("/providers/{id}")
    public ProviderView patchProvider(@PathVariable("id") String id, @RequestBody Map<String, Object> body) {
        return service.patchProvider(id, body);
    }

    @PostMapping("/providers/{id}/test")
    public TestResult test(@PathVariable("id") String id, @RequestBody(required = false) Map<String, Object> body) {
        Object model = body == null ? null : body.get("model");
        return service.test(id, model instanceof String s ? s : null);
    }

    @PatchMapping("/routes/{task}")
    public RouteView patchRoute(@PathVariable("task") String task, @RequestBody Map<String, Object> body) {
        return service.patchRoute(task, body);
    }

    @DeleteMapping("/routes/{task}")
    public RouteView deleteRoute(@PathVariable("task") String task) {
        return service.deleteRoute(task);
    }

    @PutMapping("/prices/{model}")
    public PriceView putPrice(@PathVariable("model") String model, @RequestBody Map<String, Object> body) {
        return service.putPrice(model, new LinkedHashMap<>(body));
    }

    @DeleteMapping("/prices/{model}")
    public PriceView deletePrice(@PathVariable("model") String model) {
        return service.deletePrice(model);
    }

    @GetMapping("/calls")
    public CallsView calls(
        @RequestParam(name = "hours", required = false) Integer hours,
        @RequestParam(name = "task", required = false) String task,
        @RequestParam(name = "provider", required = false) String provider,
        @RequestParam(name = "failed", required = false, defaultValue = "false") boolean failed,
        @RequestParam(name = "limit", required = false) Integer limit,
        @RequestParam(name = "before", required = false) Long before
    ) {
        return service.calls(hours, task, provider, failed, limit, before);
    }
}
