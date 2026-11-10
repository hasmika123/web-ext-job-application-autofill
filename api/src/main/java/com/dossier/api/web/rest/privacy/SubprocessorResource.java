package com.dossier.api.web.rest.privacy;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.privacy.SubprocessorRegister;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The subprocessor register (T1.5). {@code GET /api/public/legal/subprocessors} is public and read-only: name, purpose, data categories, location and link of each entry in
 * use, never the DPA status. {@code GET /api/admin/privacy/subprocessors} is ADMIN only and lists every slot with the DPA status; entries are written through the settings
 * routes ({@code PUT /api/admin/settings/legal.subprocessor.NN}), so every change is audited with its history.
 */
@RestController
public class SubprocessorResource {

    private final SubprocessorRegister register;

    public SubprocessorResource(SubprocessorRegister register) {
        this.register = register;
    }

    @GetMapping("/api/public/legal/subprocessors")
    public ResponseEntity<Map<String, Object>> publicList() {
        List<Map<String, Object>> items = register.publicList().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", e.name());
            m.put("purpose", e.purpose());
            m.put("data", e.data());
            m.put("location", e.location());
            m.put("link", e.link());
            return m;
        }).toList();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic()).body(Map.of("items", items));
    }

    @GetMapping("/api/admin/privacy/subprocessors")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    public Map<String, Object> adminList() {
        List<Map<String, Object>> items = register.adminList().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("slot", e.slot());
            m.put("key", e.key());
            m.put("empty", e.empty());
            m.put("name", e.name());
            m.put("purpose", e.purpose());
            m.put("data", e.data());
            m.put("location", e.location());
            m.put("link", e.link());
            m.put("dpaStatus", e.dpaStatus());
            return m;
        }).toList();
        return Map.of("items", items);
    }
}
