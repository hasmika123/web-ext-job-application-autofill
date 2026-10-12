package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ResumeBuilderConfigService;
import com.dossier.api.service.dto.ResumeBuilderConfigDTO;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/profile/resume-builder/config} (R2.0, DESIGN 9.1): every builder tunable the web
 * needs, evaluated for the signed-in user. The {@code ETag} is the SHA-256 of the JSON body, so a
 * client revalidating with {@code If-None-Match} gets a 304 until a setting, the plan or the resume
 * count changes; the response is cacheable for a minute in the browser only.
 */
@RestController
@RequestMapping("/api/profile/resume-builder")
@Tag(name = "resume-builder", description = "Resume Builder documents, config and settings.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ResumeBuilderConfigResource {

    private final ResumeBuilderConfigService configService;
    private final ObjectMapper mapper;

    public ResumeBuilderConfigResource(ResumeBuilderConfigService configService, ObjectMapper mapper) {
        this.configService = configService;
        this.mapper = mapper;
    }

    @Operation(
        summary = "Resume Builder config",
        description = "Limits, score weights, templates, feature switches, plan and resume cap for the signed-in user. ETag = sha256 of the body; Cache-Control private, max-age=60."
    )
    @GetMapping("/config")
    public ResponseEntity<ResumeBuilderConfigDTO> getConfig(
        @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch
    ) {
        ResumeBuilderConfigDTO dto = configService.forCurrentUser();
        String etag = "\"" + sha256(dto) + "\"";
        CacheControl cache = CacheControl.maxAge(Duration.ofSeconds(60)).cachePrivate();
        if (etag.equals(ifNoneMatch)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(cache).build();
        }
        return ResponseEntity.ok().eTag(etag).cacheControl(cache).body(dto);
    }

    private String sha256(ResumeBuilderConfigDTO dto) {
        try {
            byte[] body = mapper.writeValueAsString(dto).getBytes(StandardCharsets.UTF_8);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
        } catch (JsonProcessingException | NoSuchAlgorithmException e) {
            throw new IllegalStateException("Cannot hash the builder config", e);
        }
    }
}
