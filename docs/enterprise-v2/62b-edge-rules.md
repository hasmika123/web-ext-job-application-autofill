# 62b - Edge rules the operator applies (Caddy)

The code already refuses these paths on public hosts (X1.13) and sets safe response headers itself (T5.2). The lines below are
the **first layer**, applied by the user in the shared edge file (`~/beecompete-edge/Caddyfile`). Nothing in this repo touches
that file.

## 1. Refuse the operational and internal paths at the edge (E12, X1.13)

Inside the `api.kiwiply.com` site block, before `reverse_proxy`:

```caddy
api.kiwiply.com {
	# Operational and service-to-service paths never leave the box. Health stays open for the uptime monitor.
	@ops path /api/internal/* /management/prometheus /management/info /management/env /management/beans /management/loggers /management/threaddump /management/jhimetrics /management/caches /management/liquibase /management/configprops /management/logfile
	respond @ops 404

	reverse_proxy dossier-api:8080
}
```

Notes:

- `/management/health` and `/management/health/*` are deliberately not listed (`https://api.kiwiply.com/management/health` is the keyword monitor).
- The API enforces the same rule itself: a request carrying `X-Forwarded-Host` (Caddy always adds it) to any of those paths gets the empty 404, so a
  missing edge rule is not an open door, only a missing first layer.
- Prometheus (if you add a scraper) runs on the Docker network, hits `http://api:8080/management/prometheus` and sends
  `Authorization: Bearer $DOSSIER_SCRAPE_TOKEN` (set a 32+ character `DOSSIER_SCRAPE_TOKEN` in `.env`; blank means admin JWT only).
- Apply the same `@ops` matcher to every custom-domain or tenant site block that proxies to the API.

## 2. Optional response headers at the edge (T5.2)

The web app and the API already send these (see `web/next.config.ts`, `SecurityHeadersFilter`). Setting them in Caddy as well is
harmless and covers error pages the apps never render. Use `header` (not `header ?`) only for values that must win:

```caddy
kiwiply.com, www.kiwiply.com {
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}
}
```

Do **not** add a `Content-Security-Policy` or `X-Frame-Options` header at the edge: the web app sets its own per-route CSP
(the connect page and tenant hosts have different `frame-ancestors`), and an edge value would override or duplicate it.

`includeSubDomains` also covers the tenant subdomains and `api.`; drop it if any subdomain must stay reachable over plain HTTP. Do not
add `preload` until every subdomain has served HTTPS for a while.
