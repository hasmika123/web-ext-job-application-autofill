package com.dossier.api.service.ent.domains;

import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.OrgBrandingAssets;
import com.dossier.api.service.ent.TenantUrls;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The settings of an organization's own extension build (CUSTOM-DOMAINS-BUILD.md A6, gap D8), for the platform admin to download and feed to
 * {@code web/scripts/package-org-extension.mjs}. The build is a white-label one: its own unlisted Chrome Web Store item that names no Kiwiply
 * anywhere a person sees it. So it serves on the organization's LIVE custom domains only (active, domains switched on, certificate issued): its
 * Kiwiply subdomain would name Kiwiply in Chrome's install prompt. An organization without one is refused ({@code 409 NO_LIVE_DOMAIN}).
 * The main address (the primary domain, else the oldest) is where the build signs in; the others are listed too, so connect and Prepare work on each.
 * The API stays Kiwiply's, called behind the scenes (user decision 2026-11-15): it answers extensions by CORS, so it never appears in the manifest.
 * Read-only: hostnames, the name and the published logo and colour, no member data.
 */
@Service
public class AdminExtensionPackageService {

    public static final String CODE_NO_LIVE_DOMAIN = "NO_LIVE_DOMAIN";

    /** The published logo, fetched from the public asset endpoint with {@code X-Kiwiply-Host: host} (the endpoint picks the tenant by host). */
    public record Logo(String url, String host) {}

    public record Package(
        Long orgId,
        String slug,
        String name,
        String shortName,
        String primaryColor,
        Logo logo,
        String web,
        List<String> origins,
        String api
    ) {}

    private final JdbcTemplate jdbc;
    private final EnterpriseFeatureFlag flag;
    private final OrgBrandingAssets assets;
    private final TenantUrls urls;
    private final String api;

    public AdminExtensionPackageService(
        JdbcTemplate jdbc,
        EnterpriseFeatureFlag flag,
        OrgBrandingAssets assets,
        TenantUrls urls,
        @Value("${dossier.extension.api-url:https://api.kiwiply.com}") String api
    ) {
        this.jdbc = jdbc;
        this.flag = flag;
        this.assets = assets;
        this.urls = urls;
        this.api = api == null || api.isBlank() ? "https://api.kiwiply.com" : api.trim().replaceAll("/+$", "");
    }

    public Package forOrg(Long orgId) {
        List<String> names = jdbc.queryForList("select name from organization where id = ?", String.class, orgId);
        if (names.isEmpty()) throw new OrgNotFoundException();
        String name = names.get(0);

        List<String> hosts = flag.isEnabled(EnterpriseSettingKeys.FLAG_DOMAINS, orgId)
            ? jdbc.queryForList(
                "select hostname from org_hostname where org_id = ? and kind = 'CUSTOM' and status = 'ACTIVE' and cert_state = 'ISSUED'" +
                " order by is_primary desc, created_at, id",
                String.class,
                orgId
            )
            : List.of();
        if (hosts.isEmpty()) {
            throw OrgException.coded(
                409,
                CODE_NO_LIVE_DOMAIN,
                "This organization has no live custom domain yet. Its own extension serves on its own domains only, so add one and wait for its certificate.",
                Map.of()
            );
        }
        List<String> origins = hosts.stream().map(urls::originForHost).toList();

        List<String> colors = jdbc.queryForList("select primary_color from org_branding where org_id = ?", String.class, orgId);
        String primary = colors.isEmpty() ? null : colors.get(0);
        Logo logo = assets.publishedKey(orgId, "logo").isPresent() ? new Logo(api + "/api/public/tenant/assets/logo", hosts.get(0)) : null;

        String slug = name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        String shortName = name.trim().split("\\s+")[0];
        return new Package(orgId, slug.isEmpty() ? "org-" + orgId : slug, name, shortName, primary, logo, origins.get(0), origins, api);
    }
}
