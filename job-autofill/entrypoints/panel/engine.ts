/**
 * Loads the vanilla autofill ENGINE into the drawer (side-effect imports — the IIFE modules
 * attach to window.JAF). Same modules the options entrypoint loads; order matters (parser-core
 * before parser; tracking before sync). The React UI calls window.JAF.* through the services in
 * `services.ts`.
 */
import "../../src/lib/storage.js";
import "../../src/lib/schema.js";
import "../../src/lib/tracking.js";
import "../../src/lib/sync.js";
import "../../src/lib/app-tracking.js";
import "../../src/lib/parser-core.js";
import "../../src/lib/parser.js";
// The drawer syncs the learned-answer cache to the server (home-actions.refreshMirror),
// so it needs the cache module too. Safe here: the store is chrome.storage, not the
// page's IndexedDB, so this frame sees the same entries the content script wrote.
import "../../src/lib/field-cache.js";
