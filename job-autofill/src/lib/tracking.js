/* tracking.js — the ONE network seam to a sync backend. window.JAF.tracking
 *
 * The extension must not be hardwired to the Dossier API. Every call to a tracking
 * backend goes through a `TrackingProvider` whose methods speak canonical shapes
 * (the same bio/resume vocabulary the rest of the extension uses), never a wire
 * format. `createDossierProvider()` implements it for our Spring Boot API; a future
 * provider can target a different backend by implementing the same contract.
 *
 *   RULE: no `fetch()` to the tracking backend lives anywhere but this file.
 *   Endpoint + auth are CONFIG (baseUrl + a token store), not constants.
 *
 * Pure data layer — no DOM. Attaches to globalThis.JAF so it loads in the popup,
 * options page, and the service worker alike.
 */
(function () {
  const JAF = (globalThis.JAF = globalThis.JAF || {});

  // ---- errors ------------------------------------------------------------
  class ApiError extends Error {
    constructor(status, message, body) {
      super(message || "API error " + status);
      this.name = "ApiError";
      this.status = status;
      this.body = body;
    }
  }
  class NotSupportedError extends Error {
    constructor(message) {
      super(message || "Not supported by this provider yet");
      this.name = "NotSupportedError";
    }
  }

  // ---- the contract ------------------------------------------------------
  // A documented base: every method rejects until a concrete provider overrides
  // it. Endpoints that don't exist server-side yet stay as NotSupportedError so a
  // caller fails loudly rather than silently no-op'ing.
  class TrackingProvider {
    configure(/* { baseUrl } */) { throw new NotSupportedError("configure"); }
    isAuthenticated() { return false; }
    async register(/* { login, email, password } */) { throw new NotSupportedError("register"); }
    async login(/* { username, password } */) { throw new NotSupportedError("login"); }
    async refresh() { throw new NotSupportedError("refresh"); }
    async logout() { throw new NotSupportedError("logout"); }
    async pullProfile() { throw new NotSupportedError("pullProfile"); }
    async pushProfile(/* bio */) { throw new NotSupportedError("pushProfile"); }
    async listResumes() { throw new NotSupportedError("listResumes"); }
    async pushResume(/* resume */) { throw new NotSupportedError("pushResume"); }
    async deleteResume(/* serverId */) { throw new NotSupportedError("deleteResume"); }
    async archiveResume(/* serverId, archived */) { throw new NotSupportedError("archiveResume"); }
    // Phase 3 (application tracking) — implemented by createDossierProvider.
    async pushApplication(/* app */) { throw new NotSupportedError("pushApplication"); }
    async listApplications() { throw new NotSupportedError("listApplications"); }
    async updateApplication(/* serverId, changes */) { throw new NotSupportedError("updateApplication"); }
    async deleteApplication(/* serverId */) { throw new NotSupportedError("deleteApplication"); }
    // Phase 4 (field-cache sync) — declared so the seam is complete; implemented later.
    async syncFieldCache(/* entries */) { throw new NotSupportedError("syncFieldCache (Phase 4)"); }
  }

  // ---- canonical DTO mapping (extension shapes <-> server wire format) ----
  // Server stores the bio as an opaque JSON string `payload`; resume structure
  // lives in `parsedJson`. These translate both directions and are the only place
  // that knows the server's field names.
  function bioToPayload(bio) { return JSON.stringify(bio || {}); }
  function payloadToBio(payload) {
    if (!payload) return null;
    try { return JSON.parse(payload); } catch (e) { return null; }
  }
  // Local-only resume fields the server doesn't need echoed back into parsedJson.
  function stripLocalResume(resume) {
    const r = Object.assign({}, resume);
    delete r.serverId; delete r.r2ObjectKey; delete r.status; delete r.hasFile; delete r.archived;
    return r;
  }
  function resumeToDto(resume) {
    resume = resume || {};
    const dto = {
      label: resume.label || "Untitled resume",
      status: resume.status || "NEEDS_REVIEW",
      parsedJson: JSON.stringify(stripLocalResume(resume)),
    };
    if (resume.serverId != null) dto.id = resume.serverId;
    if (resume.r2ObjectKey != null) dto.r2ObjectKey = resume.r2ObjectKey;
    return dto;
  }
  function dtoToResume(dto) {
    dto = dto || {};
    let content = {};
    try { content = JSON.parse(dto.parsedJson || "{}") || {}; } catch (e) { content = {}; }
    return Object.assign(content, {
      serverId: dto.id,
      label: dto.label,
      status: dto.status,
      r2ObjectKey: dto.r2ObjectKey,
      archived: dto.archived,
    });
  }
  // Application (the tracker entry) <-> server ApplicationDTO. Only fields the caller
  // actually set are sent, so a partial update (e.g. just {status}) stays partial.
  // The picked resume is referenced by its server id; the server links the FK.
  function applicationToDto(app) {
    app = app || {};
    const dto = {};
    if (app.serverId != null) dto.id = app.serverId;
    if (app.company != null) dto.company = app.company;
    const role = app.roleTitle != null ? app.roleTitle : app.role;
    if (role != null) dto.roleTitle = role;
    if (app.jobUrl != null) dto.jobUrl = app.jobUrl;
    if (app.location != null) dto.location = app.location;
    if (app.externalJobId != null) dto.externalJobId = app.externalJobId;
    if (app.atsPlatform != null) dto.atsPlatform = app.atsPlatform;
    if (app.jobDescription != null) dto.jobDescription = app.jobDescription;
    if (app.status != null) dto.status = app.status;
    if (app.source != null) dto.source = app.source;
    if (app.submissionConfirmed != null) dto.submissionConfirmed = app.submissionConfirmed;
    if (app.appliedAt != null) dto.appliedAt = app.appliedAt;
    const resumeId = app.resumeId != null ? app.resumeId : (app.resume && app.resume.serverId);
    if (resumeId != null) dto.resume = { id: resumeId };
    return dto;
  }
  function dtoToApplication(dto) {
    dto = dto || {};
    return {
      serverId: dto.id,
      company: dto.company,
      roleTitle: dto.roleTitle,
      jobUrl: dto.jobUrl,
      location: dto.location,
      externalJobId: dto.externalJobId,
      atsPlatform: dto.atsPlatform,
      jobDescription: dto.jobDescription,
      status: dto.status,
      source: dto.source,
      submissionConfirmed: dto.submissionConfirmed,
      appliedAt: dto.appliedAt,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      resumeId: dto.resume ? dto.resume.id : undefined,
      resumeLabel: dto.resume ? dto.resume.label : undefined,
    };
  }

  // ---- token stores ------------------------------------------------------
  // In-memory store (default; also used by tests). Tokens: { access, refresh }.
  function memoryTokenStore(initial) {
    let tokens = initial || {};
    return {
      get: () => tokens,
      set: (t) => { tokens = t || {}; },
      clear: () => { tokens = {}; },
    };
  }
  // chrome.storage-backed store for the real extension (persists across reloads).
  function chromeTokenStore(key) {
    key = key || "trackingAuth";
    let cache = null;
    return {
      async get() {
        if (cache) return cache;
        cache = await new Promise((res) => chrome.storage.local.get(key, (o) => res((o && o[key]) || {})));
        return cache;
      },
      async set(t) {
        cache = t || {};
        await new Promise((res) => chrome.storage.local.set({ [key]: cache }, () => res(true)));
      },
      async clear() {
        cache = {};
        await new Promise((res) => chrome.storage.local.remove(key, () => res(true)));
      },
    };
  }

  // ---- the Dossier API provider -----------------------------------------
  function createDossierProvider(opts) {
    opts = opts || {};
    let baseUrl = (opts.baseUrl || "").replace(/\/+$/, "");
    const doFetch = opts.fetch || ((...a) => fetch(...a));
    const store = opts.tokenStore || memoryTokenStore();

    const tokens = () => Promise.resolve(store.get());
    const setTokens = (t) => Promise.resolve(store.set(t));

    async function rawRequest(method, path, { body, accessToken } = {}) {
      if (!baseUrl) throw new ApiError(0, "No backend baseUrl configured");
      const headers = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (accessToken) headers["Authorization"] = "Bearer " + accessToken;
      const res = await doFetch(baseUrl + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return res;
    }

    async function parse(res) {
      if (res.status === 204) return null;
      const text = res.text ? await res.text() : "";
      let json = null;
      if (text) { try { json = JSON.parse(text); } catch (e) { json = text; } }
      if (!res.ok) throw new ApiError(res.status, (json && json.detail) || ("Request failed (" + res.status + ")"), json);
      return json;
    }

    // Authenticated request with a single 401 -> refresh -> retry.
    async function request(method, path, { body } = {}) {
      const t = await tokens();
      let res = await rawRequest(method, path, { body, accessToken: t.access });
      if (res.status === 401 && t.refresh) {
        const ok = await tryRefresh();
        if (ok) {
          const t2 = await tokens();
          res = await rawRequest(method, path, { body, accessToken: t2.access });
        }
      }
      return parse(res);
    }

    async function tryRefresh() {
      const t = await tokens();
      if (!t.refresh) return false;
      const res = await rawRequest("POST", "/api/refresh", { body: { refreshToken: t.refresh } });
      if (!res.ok) { await setTokens({}); return false; }
      const json = await parse(res);
      // The server rotates the refresh token on every refresh — store the new one (the
      // old one is now revoked); fall back to the current one if none is returned.
      await setTokens({ access: json.accessToken, refresh: json.refreshToken || t.refresh });
      return true;
    }

    return {
      __proto__: TrackingProvider.prototype,

      configure({ baseUrl: b } = {}) { if (b != null) baseUrl = String(b).replace(/\/+$/, ""); },
      getBaseUrl() { return baseUrl; },

      async isAuthenticated() { return !!(await tokens()).access; },

      async register({ login, email, password }) {
        // JHipster register expects a ManagedUserVM; activation is handled server-side.
        return parse(await rawRequest("POST", "/api/register", { body: { login, email, password, langKey: "en" } }));
      },

      async login({ username, password }) {
        const json = await parse(await rawRequest("POST", "/api/authenticate", { body: { username, password } }));
        await setTokens({ access: json.accessToken, refresh: json.refreshToken });
        return json;
      },

      async refresh() {
        const ok = await tryRefresh();
        if (!ok) throw new ApiError(401, "Could not refresh session");
        return (await tokens()).access;
      },

      async logout() {
        // Revoke the refresh token server-side (best-effort) so it can't be replayed.
        const t = await tokens();
        if (t.refresh) {
          try { await rawRequest("POST", "/api/logout", { body: { refreshToken: t.refresh } }); } catch (e) { /* best-effort */ }
        }
        await setTokens({});
      },

      async pullProfile() {
        const t = await tokens();
        const res = await rawRequest("GET", "/api/profile", { accessToken: t.access });
        if (res.status === 404) return null;
        if (res.status === 401 && t.refresh && (await tryRefresh())) {
          const t2 = await tokens();
          const res2 = await rawRequest("GET", "/api/profile", { accessToken: t2.access });
          if (res2.status === 404) return null;
          const dto2 = await parse(res2);
          return dto2 ? payloadToBio(dto2.payload) : null;
        }
        const dto = await parse(res);
        return dto ? payloadToBio(dto.payload) : null;
      },

      async pushProfile(bio) {
        const dto = await request("PUT", "/api/profile", { body: { payload: bioToPayload(bio) } });
        return dto ? payloadToBio(dto.payload) : null;
      },

      async listResumes() {
        const dtos = (await request("GET", "/api/profile/resumes")) || [];
        return dtos.map(dtoToResume);
      },

      async pushResume(resume) {
        const dto = resumeToDto(resume);
        const saved = resume && resume.serverId != null
          ? await request("PUT", "/api/profile/resumes/" + resume.serverId, { body: dto })
          : await request("POST", "/api/profile/resumes", { body: dto });
        return dtoToResume(saved);
      },

      async deleteResume(serverId) {
        await request("DELETE", "/api/profile/resumes/" + serverId);
        return true;
      },

      // Archive (don't delete) a resume an application may still reference. Uses the
      // resume sync endpoint's partial update — only the archived flag is sent.
      async archiveResume(serverId, archived) {
        const saved = await request("PUT", "/api/profile/resumes/" + serverId, { body: { archived: archived !== false } });
        return dtoToResume(saved);
      },

      // ---- application tracking (Phase 3) ---------------------------------
      // pushApplication is an UPSERT: the server dedups on externalJobId/jobUrl, so
      // re-filling the same job updates the same entry instead of adding a new one.
      async pushApplication(app) {
        const saved = await request("POST", "/api/profile/applications", { body: applicationToDto(app) });
        return dtoToApplication(saved);
      },

      async listApplications() {
        const dtos = (await request("GET", "/api/profile/applications")) || [];
        return dtos.map(dtoToApplication);
      },

      async updateApplication(serverId, changes) {
        const saved = await request("PUT", "/api/profile/applications/" + serverId, { body: applicationToDto(changes || {}) });
        return dtoToApplication(saved);
      },

      async deleteApplication(serverId) {
        await request("DELETE", "/api/profile/applications/" + serverId);
        return true;
      },
    };
  }

  JAF.tracking = {
    TrackingProvider,
    ApiError,
    NotSupportedError,
    createDossierProvider,
    memoryTokenStore,
    chromeTokenStore,
    // exposed for tests
    bioToPayload, payloadToBio, resumeToDto, dtoToResume, applicationToDto, dtoToApplication,
  };
})();
