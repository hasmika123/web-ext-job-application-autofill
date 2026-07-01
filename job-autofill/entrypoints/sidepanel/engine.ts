/**
 * Loads the vanilla autofill ENGINE into the side panel (side-effect imports — the IIFE
 * modules attach to window.JAF). Same modules the popup/options entrypoints load; order
 * matters (parser-core before parser; tracking before sync). The React UI calls window.JAF.*
 * through the services in `panel.ts`.
 */
import "../../src/lib/storage.js";
import "../../src/lib/schema.js";
import "../../src/lib/tracking.js";
import "../../src/lib/sync.js";
import "../../src/lib/app-tracking.js";
import "../../src/lib/parser-core.js";
import "../../src/lib/parser.js";
